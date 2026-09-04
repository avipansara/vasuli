-- Bilateral pair group balances (display == validation).
--
-- Until now every pair-facing group number was the friend's GLOBAL net
-- (all expenses/settlements in the group) negated and shown as a personal
-- debt, while transfers were pair-scoped. In multi-member groups that
-- mislabels third parties' money as the viewer's debt.
--
-- This migration makes the group base bilateral everywhere it must agree:
-- the friend-home display base, the commit STALE check, the scope-transfer
-- trigger, and the reversal check. Bilateral = only flows between the two
-- people (the pair pattern already proven by direct_expense_impacts):
--   expenses:  paid_by=actor -> +friend_split / paid_by=friend -> -actor_split
--   settlements/transfers: pair-only, from=friend -> -amount / to=friend -> +amount
-- Direct legs are already bilateral and are NOT touched.
-- Zero-net needs NO change: commit_zero_net_settlement_operation derives its
-- balance from get_friend_home_relationships() display totals, so it follows
-- automatically. Group-detail (global nets) is intentionally NOT touched.
-- NOTE: live reverse_settlement_operation has no transfer leg (pre-existing);
-- that absence is preserved here. Reversing transfer-bearing operations was
-- already STALE-guarded before this change; see follow-up.
--
-- Invariant preserved: trigger expects NEW.delta = -actor_balance and the
-- client sends delta = -scope.amount, so actor_balance must equal the
-- displayed scope.amount. All four rewrites below compute the same number.

-- ── Block 1: display base (get_friend_home_relationships_legacy) ──────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
  group_impacts AS (
    SELECT e.group_id, e.currency, e.paid_by AS user_id, e.amount AS amount
    FROM public.expenses e
    JOIN public.group_members current_member
      ON current_member.group_id = e.group_id
     AND current_member.user_id = app_user_id
    WHERE e.deleted_at IS NULL

    UNION ALL

    SELECT e.group_id, e.currency, split.user_id, -split.amount
    FROM public.expenses e
    JOIN public.group_members current_member
      ON current_member.group_id = e.group_id
     AND current_member.user_id = app_user_id
    JOIN public.expense_splits split ON split.expense_id = e.id
    WHERE e.deleted_at IS NULL

    UNION ALL

    SELECT s.group_id, s.currency, s.from_user_id, s.amount
    FROM public.settlements s
    JOIN public.group_members current_member
      ON current_member.group_id = s.group_id
     AND current_member.user_id = app_user_id
    WHERE s.group_id IS NOT NULL

    UNION ALL

    SELECT s.group_id, s.currency, s.to_user_id, -s.amount
    FROM public.settlements s
    JOIN public.group_members current_member
      ON current_member.group_id = s.group_id
     AND current_member.user_id = app_user_id
    WHERE s.group_id IS NOT NULL
  ),
$old$;
  new_expression TEXT := $new$
  group_impacts AS (
    SELECT e.group_id, e.currency, friend.friend_id AS user_id, -COALESCE(friend_split.amount, 0) AS amount
    FROM friend_profiles friend
    JOIN public.expenses e
      ON e.paid_by = app_user_id
     AND e.deleted_at IS NULL
    JOIN public.group_members friend_member
      ON friend_member.group_id = e.group_id
     AND friend_member.user_id = friend.friend_id
    LEFT JOIN public.expense_splits friend_split
      ON friend_split.expense_id = e.id
     AND friend_split.user_id = friend.friend_id
    WHERE COALESCE(friend_split.amount, 0) > 0

    UNION ALL

    SELECT e.group_id, e.currency, friend.friend_id AS user_id, COALESCE(current_split.amount, 0) AS amount
    FROM friend_profiles friend
    JOIN public.expenses e
      ON e.paid_by = friend.friend_id
     AND e.deleted_at IS NULL
    JOIN public.group_members current_member
      ON current_member.group_id = e.group_id
     AND current_member.user_id = app_user_id
    LEFT JOIN public.expense_splits current_split
      ON current_split.expense_id = e.id
     AND current_split.user_id = app_user_id
    WHERE COALESCE(current_split.amount, 0) > 0

    UNION ALL

    SELECT s.group_id, s.currency, friend.friend_id AS user_id,
      CASE WHEN s.from_user_id = friend.friend_id THEN s.amount ELSE -s.amount END AS amount
    FROM friend_profiles friend
    JOIN public.settlements s
      ON s.group_id IS NOT NULL
     AND ((s.from_user_id = app_user_id AND s.to_user_id = friend.friend_id)
      OR (s.from_user_id = friend.friend_id AND s.to_user_id = app_user_id))
    JOIN public.group_members current_member
      ON current_member.group_id = s.group_id
     AND current_member.user_id = app_user_id
    JOIN public.group_members friend_member
      ON friend_member.group_id = s.group_id
     AND friend_member.user_id = friend.friend_id
  ),
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_friend_home_relationships_legacy'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_home_relationships_legacy() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update legacy group_impacts to bilateral';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 2: commit STALE check (commit_settlement_operation) ──────────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
      + COALESCE((SELECT SUM(COALESCE(friend_split.amount, 0)
          - CASE WHEN e.paid_by = p_friend_id THEN e.amount ELSE 0 END)
        FROM public.expenses e
        JOIN public.group_members actor_member ON actor_member.group_id = e.group_id
          AND actor_member.user_id = app_user_id
        JOIN public.group_members friend_member ON friend_member.group_id = e.group_id
          AND friend_member.user_id = p_friend_id
        LEFT JOIN public.expense_splits friend_split ON friend_split.expense_id = e.id
          AND friend_split.user_id = p_friend_id
        WHERE e.deleted_at IS NULL AND e.currency = p_currency), 0)
      + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = p_friend_id THEN -s.amount
          WHEN s.to_user_id = p_friend_id THEN s.amount ELSE 0 END)
        FROM public.settlements s
        JOIN public.group_members actor_member ON actor_member.group_id = s.group_id
          AND actor_member.user_id = app_user_id
        JOIN public.group_members friend_member ON friend_member.group_id = s.group_id
          AND friend_member.user_id = p_friend_id
        WHERE s.currency = p_currency), 0) INTO current_balance;
$old$;
  new_expression TEXT := $new$
      + COALESCE((SELECT SUM(CASE
          WHEN e.paid_by = app_user_id THEN COALESCE(friend_split.amount, 0)
          WHEN e.paid_by = p_friend_id THEN -COALESCE(current_split.amount, 0)
          ELSE 0 END)
        FROM public.expenses e
        JOIN public.group_members actor_member ON actor_member.group_id = e.group_id
          AND actor_member.user_id = app_user_id
        JOIN public.group_members friend_member ON friend_member.group_id = e.group_id
          AND friend_member.user_id = p_friend_id
        LEFT JOIN public.expense_splits friend_split ON friend_split.expense_id = e.id
          AND friend_split.user_id = p_friend_id
        LEFT JOIN public.expense_splits current_split ON current_split.expense_id = e.id
          AND current_split.user_id = app_user_id
        WHERE e.deleted_at IS NULL AND e.currency = p_currency
          AND e.paid_by IN (app_user_id, p_friend_id)), 0)
      + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = p_friend_id THEN -s.amount
          WHEN s.to_user_id = p_friend_id THEN s.amount ELSE 0 END)
        FROM public.settlements s
        JOIN public.group_members actor_member ON actor_member.group_id = s.group_id
          AND actor_member.user_id = app_user_id
        JOIN public.group_members friend_member ON friend_member.group_id = s.group_id
          AND friend_member.user_id = p_friend_id
        WHERE s.currency = p_currency
          AND ((s.from_user_id = app_user_id AND s.to_user_id = p_friend_id)
            OR (s.from_user_id = p_friend_id AND s.to_user_id = app_user_id))), 0) INTO current_balance;
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commit_settlement_operation'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payment_intent_id uuid, p_friend_id uuid, p_group_id uuid, p_mode text, p_amount numeric, p_currency text, p_date timestamp with time zone, p_expected_balance numeric, p_allocations jsonb, p_transfers jsonb';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'commit_settlement_operation() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update commit current_balance to bilateral';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 3: scope-transfer trigger base ───────────────────────────────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
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
$old$;
  new_expression TEXT := $new$
  SELECT COALESCE(SUM(CASE
        WHEN e.paid_by = operation_row.actor_user_id THEN COALESCE(friend_split.amount, 0)
        WHEN e.paid_by = operation_row.friend_user_id THEN -COALESCE(viewer_split.amount, 0)
        ELSE 0 END), 0)
    + COALESCE((
      SELECT SUM(CASE
        WHEN s.from_user_id = operation_row.friend_user_id THEN -s.amount
        WHEN s.to_user_id = operation_row.friend_user_id THEN s.amount
        ELSE 0 END)
      FROM public.settlements s
      WHERE s.group_id = NEW.group_id AND s.currency = NEW.currency
        AND ((s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id)
          OR (s.from_user_id = operation_row.friend_user_id AND s.to_user_id = operation_row.actor_user_id))
    ), 0)
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'validate_settlement_scope_transfer'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'validate_settlement_scope_transfer() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update scope-transfer validation base to bilateral';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 4: trigger needs the viewer split join ───────────────────────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
  FROM public.expenses e
  LEFT JOIN public.expense_splits friend_split
    ON friend_split.expense_id = e.id
   AND friend_split.user_id = operation_row.friend_user_id
  JOIN public.group_members actor_member
$old$;
  new_expression TEXT := $new$
  FROM public.expenses e
  LEFT JOIN public.expense_splits friend_split
    ON friend_split.expense_id = e.id
   AND friend_split.user_id = operation_row.friend_user_id
  LEFT JOIN public.expense_splits viewer_split
    ON viewer_split.expense_id = e.id
   AND viewer_split.user_id = operation_row.actor_user_id
  JOIN public.group_members actor_member
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'validate_settlement_scope_transfer'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'validate_settlement_scope_transfer() was not found (join block)';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not add viewer_split join to scope-transfer validation';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 5: trigger paid_by guard (pair-paid expenses only) ───────────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
  WHERE e.deleted_at IS NULL
    AND e.group_id = NEW.group_id
    AND e.currency = NEW.currency;

  IF ROUND(NEW.signed_group_balance_delta, 2)
$old$;
  new_expression TEXT := $new$
  WHERE e.deleted_at IS NULL
    AND e.group_id = NEW.group_id
    AND e.currency = NEW.currency
    AND e.paid_by IN (operation_row.actor_user_id, operation_row.friend_user_id);

  IF ROUND(NEW.signed_group_balance_delta, 2)
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'validate_settlement_scope_transfer'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'validate_settlement_scope_transfer() was not found (guard block)';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not add pair-paid guard to scope-transfer validation';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 6: live reversal check to bilateral ──────────────────────────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
  + COALESCE((SELECT SUM(COALESCE(friend_split.amount, 0)
      - CASE WHEN e.paid_by = operation_row.friend_user_id THEN e.amount ELSE 0 END)
    FROM public.expenses e
    JOIN public.group_members actor_member ON actor_member.group_id = e.group_id
      AND actor_member.user_id = operation_row.actor_user_id
    JOIN public.group_members friend_member ON friend_member.group_id = e.group_id
      AND friend_member.user_id = operation_row.friend_user_id
    LEFT JOIN public.expense_splits friend_split ON friend_split.expense_id = e.id
      AND friend_split.user_id = operation_row.friend_user_id
    WHERE e.deleted_at IS NULL AND e.currency = operation_row.currency), 0)
  + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = operation_row.friend_user_id THEN -s.amount
      WHEN s.to_user_id = operation_row.friend_user_id THEN s.amount ELSE 0 END)
    FROM public.settlements s
    JOIN public.group_members actor_member ON actor_member.group_id = s.group_id
      AND actor_member.user_id = operation_row.actor_user_id
    JOIN public.group_members friend_member ON friend_member.group_id = s.group_id
      AND friend_member.user_id = operation_row.friend_user_id
    WHERE s.currency = operation_row.currency), 0)
  INTO current_balance;
$old$;
  new_expression TEXT := $new$
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
  INTO current_balance;
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'reverse_settlement_operation'
    AND pg_get_function_identity_arguments(p.oid) = 'p_operation_id uuid, p_expected_balance numeric';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'reverse_settlement_operation() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update reversal current_balance to bilateral';
  END IF;
  EXECUTE function_definition;
END;
$$;
