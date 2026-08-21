-- Development E2E fixture only.
-- Run this once in the development Supabase SQL editor so scripts/e2e-cleanup.cjs
-- can remove Detox-created groups whose settlement history (settlement scope
-- transfers and settlement operations) otherwise restricts group deletion.
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
