-- Development E2E fixture only.
-- Run this once in the development Supabase SQL editor so scripts/e2e-cleanup.cjs
-- can remove Detox-created groups whose settlement history (settlement scope
-- transfers and settlement operations) otherwise restricts group deletion,
-- and wipe the E2E accounts' test history (activities, direct Detox expenses,
-- and the settlements between them) so runs start from a clean baseline.
-- Do not run against production. Safe to rerun.

CREATE OR REPLACE FUNCTION public.purge_e2e_groups(group_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_ids uuid[];
  v_operation_ids uuid[];
  v_deleted integer;
BEGIN
  IF group_prefix IS NULL OR group_prefix NOT LIKE 'Detox Group %' THEN
    RAISE EXCEPTION 'Refusing to purge groups outside the E2E prefix';
  END IF;

  SELECT coalesce(array_agg(id), '{}')
    INTO v_group_ids
  FROM public.groups
  WHERE name LIKE group_prefix || '%';

  IF coalesce(array_length(v_group_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.settlement_scope_transfers
   WHERE group_id = ANY(v_group_ids);

  SELECT coalesce(array_agg(id), '{}')
    INTO v_operation_ids
  FROM public.settlement_operations
  WHERE group_id = ANY(v_group_ids);

  IF coalesce(array_length(v_operation_ids, 1), 0) > 0 THEN
    UPDATE public.settlements
       SET operation_id = NULL
     WHERE operation_id = ANY(v_operation_ids);

    DELETE FROM public.settlement_operations
     WHERE id = ANY(v_operation_ids);
  END IF;

  DELETE FROM public.groups
   WHERE id = ANY(v_group_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_e2e_groups(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_e2e_groups(text) TO authenticated;

-- Wipes all test history for the given E2E account and its accepted friends:
-- activity rows, direct expenses whose description starts with the E2E
-- prefix (and their splits), and every settlement plus settlement operation
-- recorded between these accounts. The accepted friendships are preserved.
CREATE OR REPLACE FUNCTION public.purge_e2e_history(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_ids uuid[];
  v_expense_ids uuid[];
  v_operation_ids uuid[];
  v_deleted integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'purge_e2e_history requires a user id';
  END IF;

  SELECT coalesce(array_agg(uid), '{}')
    INTO v_user_ids
  FROM (
    SELECT p_user_id AS uid
    UNION
    SELECT CASE WHEN f.user_id = p_user_id THEN f.friend_id ELSE f.user_id END AS uid
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.user_id = p_user_id OR f.friend_id = p_user_id)
  ) members;

  DELETE FROM public.activities
   WHERE user_id = ANY(v_user_ids);

  SELECT coalesce(array_agg(id), '{}')
    INTO v_expense_ids
  FROM public.expenses
  WHERE group_id IS NULL
    AND description LIKE 'Detox %'
    AND (paid_by = ANY(v_user_ids) OR created_by = ANY(v_user_ids));

  DELETE FROM public.expense_splits
   WHERE expense_id = ANY(v_expense_ids);

  DELETE FROM public.expenses
   WHERE id = ANY(v_expense_ids);

  SELECT coalesce(array_agg(id), '{}')
    INTO v_operation_ids
  FROM public.settlement_operations
  WHERE actor_user_id = ANY(v_user_ids)
    AND friend_user_id = ANY(v_user_ids);

  DELETE FROM public.settlement_scope_transfers
   WHERE operation_id = ANY(v_operation_ids);

  DELETE FROM public.settlement_operation_reversals
   WHERE operation_id = ANY(v_operation_ids);

  UPDATE public.settlements
     SET operation_id = NULL
   WHERE (from_user_id = ANY(v_user_ids) AND to_user_id = ANY(v_user_ids))
      OR operation_id = ANY(v_operation_ids);

  DELETE FROM public.settlements
   WHERE (from_user_id = ANY(v_user_ids) AND to_user_id = ANY(v_user_ids))
      OR operation_id = ANY(v_operation_ids);

  DELETE FROM public.settlement_operations
   WHERE id = ANY(v_operation_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN coalesce(array_length(v_user_ids, 1), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_e2e_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_e2e_history(uuid) TO authenticated;
