-- Prevent Group settlements from being counted as direct Friend settlements,
-- and only include Group balances from Groups shared by both users.

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
    AND p.proname = 'get_friend_home_summaries'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_home_summaries() was not found';
  END IF;

  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    '    WHERE s.from_user_id = app_user_id OR s.to_user_id = app_user_id',
    '    WHERE s.group_id IS NULL' || chr(10) ||
      '      AND (s.from_user_id = app_user_id OR s.to_user_id = app_user_id)'
  );

  function_definition := replace(
    function_definition,
    '    JOIN friend_profiles friend ON friend.id = balances.user_id' || chr(10) ||
      '    JOIN public.group_members current_member',
    '    JOIN friend_profiles friend ON friend.id = balances.user_id' || chr(10) ||
      '    JOIN public.group_members friend_member' || chr(10) ||
      '      ON friend_member.group_id = balances.group_id' || chr(10) ||
      '     AND friend_member.user_id = balances.user_id' || chr(10) ||
      '    JOIN public.group_members current_member'
  );

  IF function_definition = original_definition
     OR position('s.group_id IS NULL' IN function_definition) = 0
     OR position('friend_member' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Could not fix Friend home settlement scopes';
  END IF;

  EXECUTE function_definition;
END;
$$;
