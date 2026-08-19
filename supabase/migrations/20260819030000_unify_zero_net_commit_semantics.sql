-- Unify zero-net transfer-only semantics with the positive settlement command.
-- Zero-net remains a separate public lifecycle entry point because it has no
-- cash allocation, but it uses the same operation, sign, authorization,
-- idempotency, and transfer-trigger contracts.

CREATE OR REPLACE FUNCTION public.commit_zero_net_settlement_operation(
  p_payment_intent_id UUID,
  p_friend_id UUID,
  p_currency TEXT,
  p_date TIMESTAMPTZ,
  p_expected_balance NUMERIC,
  p_transfers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id UUID;
  operation_id UUID;
  existing_operation public.settlement_operations%ROWTYPE;
  transfer JSONB;
  transfer_group_id UUID;
  transfer_from_user_id UUID;
  transfer_to_user_id UUID;
  transfer_delta NUMERIC;
  transfer_currency TEXT;
  new_request_fingerprint TEXT;
  stored_transfers JSONB;
  requested_transfers JSONB;
  transfer_rows JSONB;
  affected_group_ids JSONB;
  current_currency_balance NUMERIC;
  direction TEXT := 'you_paid_friend';
  operation_reused BOOLEAN := FALSE;
BEGIN
  SELECT u.id INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;
  IF app_user_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED'; END IF;
  IF p_payment_intent_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REQUIRED'; END IF;
  IF p_currency IS NULL OR BTRIM(p_currency) = '' THEN RAISE EXCEPTION 'SETTLEMENT_CURRENCY_REQUIRED'; END IF;
  IF p_currency <> 'USD' THEN RAISE EXCEPTION 'SETTLEMENT_CURRENCY_UNSUPPORTED'; END IF;
  IF p_expected_balance IS NULL OR p_expected_balance <> 0 THEN RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE'; END IF;
  IF jsonb_typeof(p_transfers) <> 'array' OR jsonb_array_length(p_transfers) = 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_REQUIRED';
  END IF;

  -- Zero-net operations do not persist p_date in settlement_operations. The
  -- fingerprint therefore covers all durable zero-net request facts.
  new_request_fingerprint := md5(jsonb_build_object(
    'friendId', p_friend_id,
    'currency', p_currency,
    'expectedBalance', 0,
    'transfers', p_transfers
  )::TEXT);

  INSERT INTO public.settlement_operations (
    actor_user_id, friend_user_id, group_id, mode, currency,
    expected_balance, requested_payment_amount, payment_intent_id,
    request_fingerprint
  ) VALUES (
    app_user_id, p_friend_id, NULL, 'all_balances', p_currency,
    0, 0, p_payment_intent_id, new_request_fingerprint
  )
  ON CONFLICT (actor_user_id, payment_intent_id) DO NOTHING
  RETURNING id INTO operation_id;

  IF operation_id IS NULL THEN
    SELECT * INTO existing_operation
    FROM public.settlement_operations
    WHERE actor_user_id = app_user_id AND payment_intent_id = p_payment_intent_id
    FOR UPDATE;
    IF existing_operation.id IS NULL
       OR existing_operation.friend_user_id <> p_friend_id
       OR existing_operation.group_id IS NOT NULL
       OR existing_operation.mode <> 'all_balances'
       OR existing_operation.currency <> p_currency
       OR existing_operation.expected_balance <> 0
       OR existing_operation.requested_payment_amount <> 0
       OR (existing_operation.request_fingerprint IS NOT NULL
           AND existing_operation.request_fingerprint <> new_request_fingerprint) THEN
      RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT';
    END IF;

    IF existing_operation.request_fingerprint IS NULL THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'groupId', to_jsonb(t.group_id),
        'fromUserId', to_jsonb(t.from_user_id),
        'toUserId', to_jsonb(t.to_user_id),
        'currency', to_jsonb(t.currency),
        'signedGroupBalanceDelta', to_jsonb(t.signed_group_balance_delta),
        'note', to_jsonb(t.note)
      ) ORDER BY t.created_at, t.id), '[]'::jsonb)
      INTO stored_transfers
      FROM public.settlement_scope_transfers t
      WHERE t.operation_id = existing_operation.id AND NOT t.is_reversal;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'groupId', value->'groupId',
        'fromUserId', value->'fromUserId',
        'toUserId', value->'toUserId',
        'currency', value->'currency',
        'signedGroupBalanceDelta', value->'signedGroupBalanceDelta',
        'note', COALESCE(value->'note', 'null'::jsonb)
      ) ORDER BY ordinality), '[]'::jsonb)
      INTO requested_transfers
      FROM jsonb_array_elements(p_transfers) WITH ORDINALITY AS items(value, ordinality);

      IF stored_transfers <> requested_transfers THEN
        RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT';
      END IF;
      UPDATE public.settlement_operations
      SET request_fingerprint = new_request_fingerprint
      WHERE id = existing_operation.id;
    END IF;
    operation_id := existing_operation.id;
    operation_reused := TRUE;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.user_id = app_user_id AND f.friend_id = p_friend_id)
          OR (f.user_id = p_friend_id AND f.friend_id = app_user_id))
    ) THEN RAISE EXCEPTION 'SETTLEMENT_FRIENDSHIP_REQUIRED'; END IF;

    PERFORM 1 FROM public.users u
    WHERE u.id IN (app_user_id, p_friend_id) ORDER BY u.id FOR UPDATE;

    SELECT COALESCE(SUM((total ->> 'amount')::NUMERIC), 0)
    INTO current_currency_balance
    FROM public.get_friend_home_relationships() home
    CROSS JOIN LATERAL jsonb_array_elements(home.relationship -> 'totalsByCurrency') total
    WHERE home.id = p_friend_id AND total ->> 'currency' = p_currency;
    IF ROUND(current_currency_balance, 2) <> 0 THEN RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE'; END IF;

    -- Validate every transfer before inserting any transfer row. The trigger
    -- remains the authoritative check that each delta neutralizes its Group.
    FOR transfer IN SELECT value FROM jsonb_array_elements(p_transfers) LOOP
      transfer_group_id := NULLIF(transfer->>'groupId', '')::UUID;
      transfer_from_user_id := NULLIF(transfer->>'fromUserId', '')::UUID;
      transfer_to_user_id := NULLIF(transfer->>'toUserId', '')::UUID;
      transfer_delta := (transfer->>'signedGroupBalanceDelta')::NUMERIC;
      transfer_currency := transfer->>'currency';
      IF transfer_group_id IS NULL OR transfer_from_user_id IS NULL OR transfer_to_user_id IS NULL
         OR transfer_from_user_id = transfer_to_user_id
         OR transfer_from_user_id NOT IN (app_user_id, p_friend_id)
         OR transfer_to_user_id NOT IN (app_user_id, p_friend_id)
         OR transfer_currency <> p_currency OR transfer_delta IS NULL
         OR transfer_delta = 0 OR transfer_delta <> ROUND(transfer_delta, 2) THEN
        RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.group_members actor_member
        JOIN public.group_members friend_member ON friend_member.group_id = actor_member.group_id
          AND friend_member.user_id = p_friend_id
        WHERE actor_member.group_id = transfer_group_id AND actor_member.user_id = app_user_id
      ) THEN RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID'; END IF;
      direction := CASE WHEN transfer_from_user_id = app_user_id
        THEN 'you_paid_friend' ELSE 'friend_paid_you' END;
    END LOOP;

    -- Pair locking is shared with positive commits and prevents a concurrent
    -- positive operation from invalidating the zero-net balance check.
    PERFORM 1 FROM public.users u
    WHERE u.id IN (app_user_id, p_friend_id) ORDER BY u.id FOR UPDATE;

    FOR transfer IN SELECT value FROM jsonb_array_elements(p_transfers) LOOP
      INSERT INTO public.settlement_scope_transfers (
        operation_id, group_id, from_user_id, to_user_id, currency,
        signed_group_balance_delta, note
      ) VALUES (
        operation_id,
        NULLIF(transfer->>'groupId', '')::UUID,
        NULLIF(transfer->>'fromUserId', '')::UUID,
        NULLIF(transfer->>'toUserId', '')::UUID,
        transfer->>'currency',
        (transfer->>'signedGroupBalanceDelta')::NUMERIC,
        NULLIF(transfer->>'note', '')
      ) ON CONFLICT ON CONSTRAINT settlement_scope_transfers_operation_group_key DO NOTHING;
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'operationId', t.operation_id, 'groupId', t.group_id,
    'fromUserId', t.from_user_id, 'toUserId', t.to_user_id,
    'currency', t.currency, 'signedGroupBalanceDelta', t.signed_group_balance_delta,
    'note', t.note, 'createdAt', t.created_at
  ) ORDER BY t.created_at, t.id), '[]'::jsonb)
  INTO transfer_rows
  FROM public.settlement_scope_transfers t
  WHERE t.operation_id = operation_id AND NOT t.is_reversal;

  SELECT COALESCE(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
  INTO affected_group_ids
  FROM (SELECT DISTINCT t.group_id FROM public.settlement_scope_transfers t
        WHERE t.operation_id = operation_id AND NOT t.is_reversal) groups;

  RETURN jsonb_build_object(
    'paymentIntentId', p_payment_intent_id,
    'reused', operation_reused,
    'committedAt', COALESCE(existing_operation.created_at,
      (SELECT created_at FROM public.settlement_operations WHERE id = operation_id)),
    'totalAmount', 0, 'currency', p_currency, 'direction', direction,
    'settlements', '[]'::jsonb, 'operationId', operation_id,
    'mode', 'all_balances', 'affectedGroupIds', affected_group_ids,
    'transfers', transfer_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_zero_net_settlement_operation(
  UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, JSONB
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.commit_zero_net_settlement_operation(
  UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, JSONB
) TO authenticated;
