-- A reversal swaps the transfer participants, so it must preserve the
-- original signed delta. Negating the delta as well would apply the original
-- group-balance change a second time instead of undoing it.

DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
    -t.signed_group_balance_delta,
$old$;
  new_expression TEXT := $new$
    t.signed_group_balance_delta,
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
    RAISE EXCEPTION 'reverse_settlement_operation(uuid,numeric) was not found';
  END IF;

  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);

  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not fix reversal scope-transfer sign';
  END IF;

  EXECUTE function_definition;
END;
$$;
