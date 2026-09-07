-- Fix zero-net receipt ambiguity and reversal direction/orientation.
--
-- B1: commit_zero_net_settlement_operation reintroduced an unqualified
-- operation_id comparison in its receipt queries (PG 42702), after
-- 20260818240000 had qualified them with a block label. This replacement
-- uses a uniquely named variable (v_operation_id) so new and reused receipts
-- succeed. Semantics, authorization, idempotency, and grants are unchanged.
--
-- B3: reverse_settlement_operation derived the post-operation balance from
-- SIGN(combined pre-balance). Group-only cash can move opposite to the
-- combined sign, and the current-balance guard is actor-oriented, so a friend
-- caller supplying their own balance is rejected. This replacement derives
-- the post-operation balance from the actual original cash direction relative
-- to the operation actor and accepts either participant's own perspective
-- (negated when the caller is the friend). Public signature, authorization,
-- atomicity, retry receipts, and stale/later-activity guards are preserved.
-- Scope transfers remain neutral for the combined balance (no transfer leg),
-- and reversal rows keep the original signed delta with swapped participants.
--
-- Additive only: prior migrations are not edited.

-- ── Zero-net receipt fix ──────────────────────────────────────────────
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
  v_operation_id UUID;
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
  RETURNING id INTO v_operation_id;

  IF v_operation_id IS NULL THEN
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
    v_operation_id := existing_operation.id;
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
        v_operation_id,
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
  WHERE t.operation_id = v_operation_id AND NOT t.is_reversal;

  SELECT COALESCE(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
  INTO affected_group_ids
  FROM (SELECT DISTINCT t.group_id FROM public.settlement_scope_transfers t
        WHERE t.operation_id = v_operation_id AND NOT t.is_reversal) groups;

  RETURN jsonb_build_object(
    'paymentIntentId', p_payment_intent_id,
    'reused', operation_reused,
    'committedAt', COALESCE(existing_operation.created_at,
      (SELECT created_at FROM public.settlement_operations WHERE id = v_operation_id)),
    'totalAmount', 0, 'currency', p_currency, 'direction', direction,
    'settlements', '[]'::jsonb, 'operationId', v_operation_id,
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

-- ── Reversal direction + orientation fix ──────────────────────────────
-- Keeps the bilateral current-balance base (pair-paid expenses, pair-only
-- settlements), the neutral combined-balance contract (no transfer leg), and
-- the compensating-row convention (swap participants, preserve signed delta).
CREATE OR REPLACE FUNCTION public.reverse_settlement_operation(
  p_operation_id UUID,
  p_expected_balance NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id UUID;
  operation_row public.settlement_operations%ROWTYPE;
  reversal_row public.settlement_operation_reversals%ROWTYPE;
  reversal_settlement_count INTEGER := 0;
  actor_current_balance NUMERIC;
  caller_current_balance NUMERIC;
  actor_expected_after NUMERIC;
  caller_expected_after NUMERIC;
  cash_effect_actor NUMERIC := 0;
  cash_has_rows BOOLEAN := FALSE;
  is_actor BOOLEAN := FALSE;
BEGIN
  SELECT u.id INTO app_user_id FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid()) LIMIT 1;
  IF app_user_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED'; END IF;

  SELECT * INTO operation_row FROM public.settlement_operations
  WHERE id = p_operation_id FOR UPDATE;
  IF operation_row.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_OPERATION_NOT_FOUND'; END IF;
  IF app_user_id <> operation_row.actor_user_id
     AND app_user_id <> operation_row.friend_user_id THEN
    RAISE EXCEPTION 'SETTLEMENT_REVERSAL_UNAUTHORIZED';
  END IF;
  IF operation_row.status = 'reversed' THEN
    SELECT * INTO reversal_row FROM public.settlement_operation_reversals
    WHERE operation_id = operation_row.id;
    RETURN jsonb_build_object('operationId', operation_row.id, 'status', 'reversed',
      'reversedAt', reversal_row.created_at, 'reused', true);
  END IF;
  IF operation_row.status <> 'committed' THEN
    RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID_STATUS';
  END IF;
  IF p_expected_balance IS NULL OR p_expected_balance <> ROUND(p_expected_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  is_actor := (app_user_id = operation_row.actor_user_id);

  -- Actual original cash direction relative to the operation actor. Reversal
  -- compensating rows share the operation id, so exclude them; at this point
  -- status is committed, but the filter keeps the derivation stable.
  SELECT COUNT(*) > 0,
    COALESCE(SUM(CASE WHEN s.from_user_id = operation_row.actor_user_id
      THEN s.amount ELSE -s.amount END), 0)
  INTO cash_has_rows, cash_effect_actor
  FROM public.settlements s
  WHERE s.operation_id = operation_row.id
    AND (s.notes IS NULL OR s.notes NOT LIKE 'Reversal of settlement operation %');

  IF NOT cash_has_rows
     OR operation_row.requested_payment_amount IS NULL
     OR operation_row.requested_payment_amount = 0
     OR cash_effect_actor = 0 THEN
    actor_expected_after := operation_row.expected_balance;
  ELSIF cash_effect_actor > 0 THEN
    -- Actor was the payer: paying increases the actor-perspective balance.
    actor_expected_after := operation_row.expected_balance
      + operation_row.requested_payment_amount;
  ELSE
    -- Friend was the payer (actor is the receiver): balance decreases.
    actor_expected_after := operation_row.expected_balance
      - operation_row.requested_payment_amount;
  END IF;

  caller_expected_after := CASE WHEN is_actor
    THEN actor_expected_after ELSE -actor_expected_after END;
  IF ROUND(p_expected_balance, 2) <> ROUND(caller_expected_after, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  SELECT COALESCE((SELECT SUM(CASE
    WHEN e.paid_by = operation_row.actor_user_id THEN COALESCE(friend_split.amount, 0)
    WHEN e.paid_by = operation_row.friend_user_id THEN -COALESCE(current_split.amount, 0)
    ELSE 0 END)
    FROM public.expenses e
    LEFT JOIN public.expense_splits current_split ON current_split.expense_id = e.id
      AND current_split.user_id = operation_row.actor_user_id
      AND (current_split.amount > 0 OR e.paid_by = operation_row.actor_user_id)
    LEFT JOIN public.expense_splits friend_split ON friend_split.expense_id = e.id
      AND friend_split.user_id = operation_row.friend_user_id
      AND (friend_split.amount > 0 OR e.paid_by = operation_row.friend_user_id)
    WHERE e.deleted_at IS NULL AND e.group_id IS NULL AND e.currency = operation_row.currency
      AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = operation_row.actor_user_id)
      AND (COALESCE(friend_split.amount, 0) > 0 OR e.paid_by = operation_row.friend_user_id)), 0)
  + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = operation_row.actor_user_id
      THEN s.amount ELSE -s.amount END) FROM public.settlements s
    WHERE s.group_id IS NULL AND s.currency = operation_row.currency
      AND ((s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id)
        OR (s.from_user_id = operation_row.friend_user_id AND s.to_user_id = operation_row.actor_user_id))), 0)
  + COALESCE((SELECT SUM(CASE
      WHEN e.paid_by = operation_row.actor_user_id THEN COALESCE(friend_split.amount, 0)
      WHEN e.paid_by = operation_row.friend_user_id THEN -COALESCE(current_split.amount, 0)
      ELSE 0 END)
    FROM public.expenses e
    JOIN public.group_members actor_member ON actor_member.group_id = e.group_id
      AND actor_member.user_id = operation_row.actor_user_id
    JOIN public.group_members friend_member ON friend_member.group_id = e.group_id
      AND friend_member.user_id = operation_row.friend_user_id
    LEFT JOIN public.expense_splits friend_split ON friend_split.expense_id = e.id
      AND friend_split.user_id = operation_row.friend_user_id
    LEFT JOIN public.expense_splits current_split ON current_split.expense_id = e.id
      AND current_split.user_id = operation_row.actor_user_id
    WHERE e.deleted_at IS NULL AND e.currency = operation_row.currency
      AND e.paid_by IN (operation_row.actor_user_id, operation_row.friend_user_id)), 0)
  + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = operation_row.friend_user_id THEN -s.amount
      WHEN s.to_user_id = operation_row.friend_user_id THEN s.amount ELSE 0 END)
    FROM public.settlements s
    JOIN public.group_members actor_member ON actor_member.group_id = s.group_id
      AND actor_member.user_id = operation_row.actor_user_id
    JOIN public.group_members friend_member ON friend_member.group_id = s.group_id
      AND friend_member.user_id = operation_row.friend_user_id
    WHERE s.currency = operation_row.currency
      AND ((s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id)
        OR (s.from_user_id = operation_row.friend_user_id AND s.to_user_id = operation_row.actor_user_id))), 0)
  INTO actor_current_balance;

  caller_current_balance := CASE WHEN is_actor
    THEN actor_current_balance ELSE -actor_current_balance END;
  IF ROUND(caller_current_balance, 2) <> ROUND(p_expected_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  INSERT INTO public.settlement_operation_reversals (operation_id, actor_user_id)
  VALUES (operation_row.id, app_user_id) RETURNING * INTO reversal_row;
  INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency,
    date, notes, operation_id)
  SELECT s.group_id, s.to_user_id, s.from_user_id, s.amount, s.currency, NOW(),
    'Reversal of settlement operation ' || operation_row.id, s.operation_id
  FROM public.settlements s WHERE s.operation_id = operation_row.id;
  GET DIAGNOSTICS reversal_settlement_count = ROW_COUNT;

  INSERT INTO public.settlement_scope_transfers (operation_id, group_id, from_user_id,
    to_user_id, currency, signed_group_balance_delta, note, is_reversal)
  SELECT t.operation_id, t.group_id, t.to_user_id, t.from_user_id, t.currency,
    t.signed_group_balance_delta,
    'Reversal of settlement operation ' || operation_row.id, true
  FROM public.settlement_scope_transfers t
  WHERE t.operation_id = operation_row.id AND t.is_reversal = false;

  UPDATE public.settlement_operations SET status = 'reversed', reversed_at = reversal_row.created_at
  WHERE id = operation_row.id;
  RETURN jsonb_build_object('operationId', operation_row.id, 'status', 'reversed',
    'reversedAt', reversal_row.created_at, 'reused', false,
    'reversalSettlementCount', reversal_settlement_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) TO authenticated;
