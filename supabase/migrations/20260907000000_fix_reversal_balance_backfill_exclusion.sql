-- Reversal stale-balance guard ignores converted (backfilled) group legs.
--
-- The friend/group readers treat converted transfer legs as activity-only
-- context and exclude them from balance math, but the reversal guard summed
-- every group settlement row. For a transfer-bearing operation with
-- converted legs the guard therefore computed a balance that included the
-- converted group leg while the Delete flow passes the displayed balance,
-- so deletion always failed with SETTLEMENT_STALE_BALANCE. The direct-scope
-- converted leg stays counted, matching the readers. This migration is
-- additive to behavior only for pairs carrying converted legs; all other
-- reversals compute identically.

CREATE OR REPLACE FUNCTION public.reverse_settlement_operation(
  p_operation_id UUID,
  p_expected_balance NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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
  PERFORM private.settlement_pair_write_lock(operation_row.actor_user_id, operation_row.friend_user_id);
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

  SELECT COUNT(*) > 0,
    COALESCE(SUM(CASE WHEN s.from_user_id = operation_row.actor_user_id
      THEN s.amount ELSE -s.amount END), 0)
  INTO cash_has_rows, cash_effect_actor
  FROM public.settlements s
  WHERE s.operation_id = operation_row.id
    AND (s.notes IS NULL OR s.notes NOT LIKE 'Reversal of settlement operation %');
  IF NOT cash_has_rows OR operation_row.requested_payment_amount IS NULL
     OR operation_row.requested_payment_amount = 0 OR cash_effect_actor = 0 THEN
    actor_expected_after := operation_row.expected_balance;
  ELSIF cash_effect_actor > 0 THEN
    actor_expected_after := operation_row.expected_balance + operation_row.requested_payment_amount;
  ELSE
    actor_expected_after := operation_row.expected_balance - operation_row.requested_payment_amount;
  END IF;
  caller_expected_after := CASE WHEN is_actor THEN actor_expected_after ELSE -actor_expected_after END;
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
      -- Converted (backfilled) group legs are activity-only context for the
      -- friend/group readers, so the reversal guard must not count them;
      -- otherwise any transfer-bearing operation with converted legs can
      -- never satisfy the stale-balance check against the displayed balance.
      AND s.backfilled_transfer_id IS NULL
      AND ((s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id)
        OR (s.from_user_id = operation_row.friend_user_id AND s.to_user_id = operation_row.actor_user_id))), 0)
  INTO actor_current_balance;
  caller_current_balance := CASE WHEN is_actor THEN actor_current_balance ELSE -actor_current_balance END;
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
    t.signed_group_balance_delta, 'Reversal of settlement operation ' || operation_row.id, true
  FROM public.settlement_scope_transfers t
  WHERE t.operation_id = operation_row.id AND t.is_reversal = false;
  INSERT INTO public.settlement_cancellations (operation_id, group_id, amount, signed_group_balance_delta, currency,
    note, is_reversal)
  SELECT c.operation_id, c.group_id, c.amount, c.signed_group_balance_delta, c.currency,
    'Reversal of settlement operation ' || operation_row.id, true
  FROM public.settlement_cancellations c
  WHERE c.operation_id = operation_row.id AND c.is_reversal = false;
  UPDATE public.settlement_operations SET status = 'reversed', reversed_at = reversal_row.created_at
  WHERE id = operation_row.id;
  RETURN jsonb_build_object('operationId', operation_row.id, 'status', 'reversed',
    'reversedAt', reversal_row.created_at, 'reused', false,
    'reversalSettlementCount', reversal_settlement_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) TO authenticated;

