-- Scope-transfer deltas are stored from the settlement operation actor's
-- perspective. The integrity trigger was applying existing transfers with the
-- opposite sign, causing valid follow-up offsets to fail validation.

DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
        WHEN t.from_user_id = operation_row.actor_user_id THEN -t.signed_group_balance_delta
        WHEN t.to_user_id = operation_row.actor_user_id THEN t.signed_group_balance_delta
$old$;
  new_expression TEXT := $new$
        WHEN t.from_user_id = operation_row.actor_user_id THEN t.signed_group_balance_delta
        WHEN t.to_user_id = operation_row.actor_user_id THEN -t.signed_group_balance_delta
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
    RAISE EXCEPTION 'Could not update scope-transfer validation sign';
  END IF;

  EXECUTE function_definition;
END;
$$;
