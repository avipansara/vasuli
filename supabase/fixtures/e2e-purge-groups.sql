-- Development E2E fixture only.
-- Install supabase/fixtures/e2e-run-scoped-fixtures.sql first. This file
-- reuses its development and allowlisted-actor checks so legacy cleanup cannot
-- delete another account's groups. Do not run against production.

CREATE OR REPLACE FUNCTION public.purge_e2e_groups(group_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_group_ids uuid[];
  v_operation_ids uuid[];
  v_commitment_ids uuid[];
  v_deleted integer;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF group_prefix IS NULL OR group_prefix NOT LIKE 'Detox Group %' THEN
    RAISE EXCEPTION 'Refusing to purge groups outside the E2E prefix';
  END IF;

  SELECT coalesce(array_agg(fixture_group.id), '{}')
    INTO v_group_ids
  FROM public.groups fixture_group
  JOIN public.group_members member
    ON member.group_id = fixture_group.id
   AND member.user_id = v_actor_id
  WHERE fixture_group.name LIKE group_prefix || '%';

  IF coalesce(array_length(v_group_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Capture every operation linked to the selected Groups before deleting any
  -- child rows. All-balance operations may have a NULL group_id, so include
  -- links through transfers and settlements as well.
  SELECT coalesce(array_agg(DISTINCT operation.id), '{}')
    INTO v_operation_ids
  FROM public.settlement_operations operation
  WHERE operation.group_id = ANY(v_group_ids)
     OR EXISTS (
       SELECT 1
       FROM public.settlement_scope_transfers transfer
       WHERE transfer.operation_id = operation.id
         AND transfer.group_id = ANY(v_group_ids)
     )
     OR EXISTS (
       SELECT 1
       FROM public.settlements settlement
       WHERE settlement.operation_id = operation.id
         AND settlement.group_id = ANY(v_group_ids)
     );

  SELECT coalesce(array_agg(DISTINCT settlement.commitment_id)
                 FILTER (WHERE settlement.commitment_id IS NOT NULL), '{}')
    INTO v_commitment_ids
  FROM public.settlements settlement
  WHERE settlement.group_id = ANY(v_group_ids)
     OR settlement.operation_id = ANY(v_operation_ids);

  IF coalesce(array_length(v_operation_ids, 1), 0) > 0 THEN
    DELETE FROM public.settlement_operation_reversals
     WHERE operation_id = ANY(v_operation_ids);

    DELETE FROM public.settlement_scope_transfers
     WHERE operation_id = ANY(v_operation_ids);

    DELETE FROM public.settlements
     WHERE group_id = ANY(v_group_ids)
        OR operation_id = ANY(v_operation_ids);

    DELETE FROM public.settlement_operations
     WHERE id = ANY(v_operation_ids);
  ELSE
    DELETE FROM public.settlements
     WHERE group_id = ANY(v_group_ids);
  END IF;

  -- A commitment can be shared by legacy settlement rows. Delete only the
  -- commitments made orphaned by this group purge.
  DELETE FROM public.settlement_commitments commitment
   WHERE commitment.id = ANY(v_commitment_ids)
     AND NOT EXISTS (
       SELECT 1
       FROM public.settlements settlement
       WHERE settlement.commitment_id = commitment.id
     );

  DELETE FROM public.groups
   WHERE id = ANY(v_group_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Ticket 11 removed the old broad history RPC. Dropping it here also fixes
-- development projects that installed an earlier copy of this fixture.
DROP FUNCTION IF EXISTS public.purge_e2e_history(uuid);

REVOKE EXECUTE ON FUNCTION public.purge_e2e_groups(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.purge_e2e_groups(text) TO authenticated;
