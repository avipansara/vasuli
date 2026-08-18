-- A zero-value split means the person was listed in the group split editor but
-- did not participate in the expense. Keep those expenses out of pair detail.

DO $$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_friend_detail_read_model'
    AND pg_get_function_identity_arguments(p.oid) = 'p_friend_id uuid';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_detail_read_model(uuid) was not found';
  END IF;

  function_definition := replace(
    function_definition,
    'AND current_split.user_id = app_user_id',
    'AND current_split.user_id = app_user_id' || E'\n       AND current_split.amount > 0'
  );
  function_definition := replace(
    function_definition,
    'AND friend_split.user_id = p_friend_id',
    'AND friend_split.user_id = p_friend_id' || E'\n       AND friend_split.amount > 0'
  );

  EXECUTE function_definition;
END;
$$;
