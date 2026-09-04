-- Refine 20260904200000: the settle flow builds its plan from the
-- pair-scoped projection (get_friend_scope_transfers returns only operations
-- between the two people; get_friend_home_relationships transfer_deltas is
-- likewise scoped to operations involving the viewer). Counting every
-- transfer that merely involves the friend would reject a valid full settle
-- when the friend has transfers with a third person (e.g. Varun settling
-- Deep while an Avee<->Deep offset exists).
--
-- Fix: count only prior transfers between the operation's actor and friend,
-- with the scope sign (from friend: -delta, to friend: +delta), matching
-- calculateGroupBalances as applied to the pair projection. Expenses and
-- group settlements stay global, mirroring the client base amounts.

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
        AND (
          (t.from_user_id = operation_row.actor_user_id AND t.to_user_id = operation_row.friend_user_id)
          OR (t.from_user_id = operation_row.friend_user_id AND t.to_user_id = operation_row.actor_user_id)
        )
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
