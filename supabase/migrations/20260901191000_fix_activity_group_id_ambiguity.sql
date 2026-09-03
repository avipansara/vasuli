-- `group_id` is also an output-column variable of this PL/pgSQL function.
-- The unqualified CTE reference therefore fails with SQLSTATE 42702 whenever
-- an authenticated user loads the Activity feed.

DO $$
DECLARE
  function_definition text;
  original_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_user_activities'
    AND pg_get_function_identity_arguments(p.oid) = 'p_limit integer, p_offset integer, p_search text';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_user_activities(integer, integer, text) was not found';
  END IF;

  original_definition := function_definition;
  function_definition := replace(
    function_definition,
    'a.group_id IN (SELECT group_id FROM user_group_ids)',
    'a.group_id IN (SELECT ug.group_id FROM user_group_ids AS ug)'
  );

  -- Development may already have the equivalent `grp_id` CTE hotfix.
  IF function_definition = original_definition
     AND position('a.group_id IN (SELECT ug.group_id FROM user_group_ids AS ug)' IN function_definition) = 0
     AND position('a.group_id IN (SELECT grp_id FROM user_group_ids)' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected to find the Activity group-membership predicate';
  END IF;

  IF function_definition <> original_definition THEN
    EXECUTE function_definition;
  END IF;
END;
$$;
