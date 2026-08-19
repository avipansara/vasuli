-- Add temporary diagnostic details to stale-balance reversal failures.
-- These values are returned through Supabase's error.details field and do not
-- change the reversal decision or write any additional data.

DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expected_check TEXT := $old$
  IF ROUND(p_expected_balance, 2) <> ROUND(expected_after_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;
$old$;
  new_expected_check TEXT := $new$
  IF ROUND(p_expected_balance, 2) <> ROUND(expected_after_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE'
      USING DETAIL = jsonb_build_object(
        'phase', 'expected_after_balance',
        'providedBalance', p_expected_balance,
        'operationExpectedBalance', operation_row.expected_balance,
        'requestedPaymentAmount', operation_row.requested_payment_amount,
        'expectedAfterBalance', expected_after_balance
      )::text;
  END IF;
$new$;
  old_current_check TEXT := $old$
  IF ROUND(current_balance, 2) <> ROUND(p_expected_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;
$old$;
  new_current_check TEXT := $new$
  IF ROUND(current_balance, 2) <> ROUND(p_expected_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE'
      USING DETAIL = jsonb_build_object(
        'phase', 'current_balance',
        'providedBalance', p_expected_balance,
        'recomputedBalance', current_balance,
        'operationId', operation_row.id
      )::text;
  END IF;
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
  function_definition := replace(function_definition, old_expected_check, new_expected_check);
  function_definition := replace(function_definition, old_current_check, new_current_check);

  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not add reversal balance diagnostics';
  END IF;

  EXECUTE function_definition;
END;
$$;
