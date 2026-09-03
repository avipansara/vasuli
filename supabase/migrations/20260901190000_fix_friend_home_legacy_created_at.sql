-- The legacy Friends Home projection is still used by the current structured
-- relationship RPC. Its `created_at` output-column variable shadowed the
-- unqualified settlements column in the group-activity CTE, causing every
-- authenticated Friends read that reaches this path to fail with SQLSTATE 42702.

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
    AND p.proname = 'get_friend_home_relationships_legacy'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_home_relationships_legacy() was not found';
  END IF;

  original_definition := function_definition;
  function_definition := regexp_replace(
    function_definition,
    'SELECT[[:space:]]+group_id,[[:space:]]+currency,[[:space:]]+COALESCE[(]created_at,[[:space:]]+date[)][[:space:]]+AS[[:space:]]+activity_at[[:space:]]+FROM[[:space:]]+public[.]settlements',
    'SELECT s.group_id, s.currency, COALESCE(s.created_at, s.date) AS activity_at' ||
      E'\n      FROM public.settlements s'
  );

  -- Some development databases were hotfixed before this migration existed.
  -- Treat their already-qualified function as valid, while requiring the
  -- Production legacy definition to be changed exactly once.
  IF function_definition = original_definition
     AND position('COALESCE(s.created_at, s.date) AS activity_at' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected to find the settlements created_at expression in get_friend_home_relationships_legacy()';
  END IF;

  IF function_definition <> original_definition THEN
    EXECUTE function_definition;
  END IF;
END;
$$;
