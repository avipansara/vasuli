-- Scope-transfer validation must mirror the client's group balance for the
-- settling pair (see calculateGroupBalances + friend-group-balance-service).
--
-- Friend balance includes transfers where the FRIEND is a party (vs anyone),
-- with scope = -friendBalance. The trigger was summing transfers where the
-- ACTOR is a party instead, so an unrelated actor<->third-party transfer
-- (e.g. Alaska 2026 op 2dd51b2d...) polluted the Hetal pair balance and every
-- follow-up full settlement failed with SETTLEMENT_TRANSFER_BALANCE_MISMATCH.
--
-- Fix: aggregate prior transfers by friend_user_id with the scope sign
-- (from friend: -delta, to friend: +delta), matching settlements/expenses.

CREATE OR REPLACE FUNCTION public.validate_settlement_scope_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  operation_row public.settlement_operations%ROWTYPE;
  actor_balance NUMERIC;
BEGIN
  IF NEW.is_reversal THEN RETURN NEW; END IF;

  SELECT * INTO operation_row
  FROM public.settlement_operations
  WHERE id = NEW.operation_id;
  IF operation_row.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID'; END IF;

  SELECT COALESCE(SUM(COALESCE(friend_split.amount, 0)
      - CASE WHEN e.paid_by = operation_row.friend_user_id THEN e.amount ELSE 0 END), 0)
    + COALESCE((
      SELECT SUM(CASE
        WHEN s.from_user_id = operation_row.friend_user_id THEN -s.amount
        WHEN s.to_user_id = operation_row.friend_user_id THEN s.amount
        ELSE 0 END)
      FROM public.settlements s
      WHERE s.group_id = NEW.group_id AND s.currency = NEW.currency
    ), 0)
    + COALESCE((
      SELECT SUM(CASE
        WHEN t.from_user_id = operation_row.friend_user_id THEN -t.signed_group_balance_delta
        WHEN t.to_user_id = operation_row.friend_user_id THEN t.signed_group_balance_delta
        ELSE 0 END)
      FROM public.settlement_scope_transfers t
      WHERE t.group_id = NEW.group_id
        AND t.currency = NEW.currency
        AND NOT t.is_reversal
    ), 0)
  INTO actor_balance
  FROM public.expenses e
  LEFT JOIN public.expense_splits friend_split
    ON friend_split.expense_id = e.id
   AND friend_split.user_id = operation_row.friend_user_id
  JOIN public.group_members actor_member
    ON actor_member.group_id = e.group_id
   AND actor_member.user_id = operation_row.actor_user_id
  JOIN public.group_members friend_member
    ON friend_member.group_id = e.group_id
   AND friend_member.user_id = operation_row.friend_user_id
  WHERE e.deleted_at IS NULL
    AND e.group_id = NEW.group_id
    AND e.currency = NEW.currency;

  IF ROUND(NEW.signed_group_balance_delta, 2)
     <> ROUND(-COALESCE(actor_balance, 0), 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFER_BALANCE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;
