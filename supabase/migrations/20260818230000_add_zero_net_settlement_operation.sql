-- Commit a transfer-only all-balances operation for a zero-net relationship.

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
  transfer_rows JSONB;
  affected_group_ids JSONB;
  current_currency_balance NUMERIC;
  direction TEXT := 'you_paid_friend';
BEGIN
  SELECT u.id INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED';
  END IF;

  IF p_currency IS NULL OR BTRIM(p_currency) = '' THEN
    RAISE EXCEPTION 'SETTLEMENT_CURRENCY_REQUIRED';
  END IF;

  IF p_currency <> 'USD' THEN
    RAISE EXCEPTION 'SETTLEMENT_CURRENCY_UNSUPPORTED';
  END IF;

  IF p_expected_balance IS NULL OR p_expected_balance <> 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.user_id = app_user_id AND f.friend_id = p_friend_id)
        OR (f.user_id = p_friend_id AND f.friend_id = app_user_id))
  ) THEN
    RAISE EXCEPTION 'SETTLEMENT_FRIENDSHIP_REQUIRED';
  END IF;

  IF jsonb_typeof(p_transfers) <> 'array' OR jsonb_array_length(p_transfers) = 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_REQUIRED';
  END IF;

  SELECT COALESCE(SUM((total ->> 'amount')::numeric), 0)
  INTO current_currency_balance
  FROM public.get_friend_home_relationships() home
  CROSS JOIN LATERAL jsonb_array_elements(home.relationship -> 'totalsByCurrency') total
  WHERE home.id = p_friend_id
    AND total ->> 'currency' = p_currency;

  IF ROUND(current_currency_balance, 2) <> 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  PERFORM 1
  FROM public.users u
  WHERE u.id IN (app_user_id, p_friend_id)
  ORDER BY u.id
  FOR UPDATE;

  INSERT INTO public.settlement_operations (
    actor_user_id,
    friend_user_id,
    group_id,
    mode,
    currency,
    expected_balance,
    requested_payment_amount,
    payment_intent_id
  )
  VALUES (app_user_id, p_friend_id, NULL, 'all_balances', p_currency, 0, 0, p_payment_intent_id)
  ON CONFLICT (actor_user_id, payment_intent_id) DO NOTHING
  RETURNING id INTO operation_id;

  IF operation_id IS NULL THEN
    SELECT * INTO existing_operation
    FROM public.settlement_operations
    WHERE actor_user_id = app_user_id
      AND payment_intent_id = p_payment_intent_id
    FOR UPDATE;

    IF existing_operation.friend_user_id <> p_friend_id
       OR existing_operation.currency <> p_currency
       OR existing_operation.requested_payment_amount <> 0 THEN
      RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT';
    END IF;
    operation_id := existing_operation.id;
  END IF;

  FOR transfer IN SELECT value FROM jsonb_array_elements(p_transfers)
  LOOP
    transfer_group_id := NULLIF(transfer->>'groupId', '')::UUID;
    transfer_from_user_id := NULLIF(transfer->>'fromUserId', '')::UUID;
    transfer_to_user_id := NULLIF(transfer->>'toUserId', '')::UUID;
    transfer_delta := (transfer->>'signedGroupBalanceDelta')::NUMERIC;
    transfer_currency := transfer->>'currency';

    IF transfer_group_id IS NULL
       OR transfer_from_user_id NOT IN (app_user_id, p_friend_id)
       OR transfer_to_user_id NOT IN (app_user_id, p_friend_id)
       OR transfer_from_user_id = transfer_to_user_id
       OR transfer_currency <> p_currency
       OR transfer_delta IS NULL
       OR transfer_delta = 0
       OR transfer_delta <> ROUND(transfer_delta, 2) THEN
      RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID';
    END IF;

    IF transfer_from_user_id = app_user_id THEN
      direction := 'you_paid_friend';
    ELSE
      direction := 'friend_paid_you';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.group_members actor_member
      JOIN public.group_members friend_member
        ON friend_member.group_id = actor_member.group_id
       AND friend_member.user_id = p_friend_id
      WHERE actor_member.group_id = transfer_group_id
        AND actor_member.user_id = app_user_id
    ) THEN
      RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID';
    END IF;

    INSERT INTO public.settlement_scope_transfers (
      operation_id, group_id, from_user_id, to_user_id, currency,
      signed_group_balance_delta, note
    )
    VALUES (
      operation_id, transfer_group_id, transfer_from_user_id, transfer_to_user_id,
      transfer_currency, transfer_delta, NULLIF(transfer->>'note', '')
    )
    ON CONFLICT ON CONSTRAINT settlement_scope_transfers_operation_group_key DO NOTHING;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'operationId', t.operation_id,
    'groupId', t.group_id,
    'fromUserId', t.from_user_id,
    'toUserId', t.to_user_id,
    'currency', t.currency,
    'signedGroupBalanceDelta', t.signed_group_balance_delta,
    'note', t.note,
    'createdAt', t.created_at
  ) ORDER BY t.created_at, t.id), '[]'::jsonb)
  INTO transfer_rows
  FROM public.settlement_scope_transfers t
  WHERE t.operation_id = operation_id;

  SELECT COALESCE(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
  INTO affected_group_ids
  FROM (
    SELECT DISTINCT t.group_id
    FROM public.settlement_scope_transfers t
    WHERE t.operation_id = operation_id
  ) groups;

  RETURN jsonb_build_object(
    'paymentIntentId', p_payment_intent_id,
    'reused', existing_operation.id IS NOT NULL,
    'committedAt', COALESCE(existing_operation.created_at, NOW()),
    'totalAmount', 0,
    'currency', p_currency,
    'direction', direction,
    'settlements', '[]'::jsonb,
    'operationId', operation_id,
    'mode', 'all_balances',
    'affectedGroupIds', affected_group_ids,
    'transfers', transfer_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_zero_net_settlement_operation(UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_zero_net_settlement_operation(UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, JSONB) TO authenticated;
