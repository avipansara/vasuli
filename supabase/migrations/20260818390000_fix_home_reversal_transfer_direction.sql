-- Home projections must use the transfer participants to determine the
-- current user's group-balance delta. Reversal rows swap from/to users while
-- retaining the original signed delta, so operation.actor_user_id is not a
-- reliable direction source.

DO $$
DECLARE
  function_row RECORD;
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$CASE WHEN operation\.actor_user_id = app_user_id[[:space:]]+THEN transfer\.signed_group_balance_delta[[:space:]]+ELSE -transfer\.signed_group_balance_delta[[:space:]]+END$old$;
  new_expression TEXT := $new$CASE WHEN transfer.from_user_id = app_user_id
        THEN transfer.signed_group_balance_delta
        ELSE -transfer.signed_group_balance_delta
      END$new$;
  replaced_count INTEGER := 0;
BEGIN
  FOR function_row IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_friend_home_relationships', 'get_groups_home_summaries')
      AND pg_get_function_identity_arguments(p.oid) = ''
  LOOP
    SELECT pg_get_functiondef(function_row.oid)
    INTO function_definition;

    original_definition := function_definition;
    function_definition := regexp_replace(function_definition, old_expression, new_expression, 'g');

    IF function_definition <> original_definition THEN
      EXECUTE function_definition;
      replaced_count := replaced_count + 1;
    END IF;
  END LOOP;

  IF replaced_count <> 2 THEN
    RAISE EXCEPTION 'Expected to update both Home transfer projections, updated %', replaced_count;
  END IF;
END;
$$;
