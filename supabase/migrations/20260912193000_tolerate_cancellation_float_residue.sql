-- JSON numbers produced by JavaScript arithmetic can carry tiny binary
-- floating-point residue, for example 69.48000000000002 instead of 69.48.
-- Accept only sub-nanodollar residue at the cancellation RPC boundary and
-- normalize it before comparing the request with the server-owned plan.
-- Genuine fractional-cent values remain invalid.
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_validation TEXT := $old$
      IF cancellation_group_id IS NULL
         OR cancellation_amount IS NULL OR cancellation_amount <= 0
         OR cancellation_amount <> ROUND(cancellation_amount, 2)
         OR cancellation_currency <> p_currency
      THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;
$old$;
  new_validation TEXT := $new$
      IF cancellation_group_id IS NULL
         OR cancellation_amount IS NULL OR cancellation_amount <= 0
         OR ABS(cancellation_amount - ROUND(cancellation_amount, 2)) > 0.000000001
         OR cancellation_currency <> p_currency
      THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;
      cancellation_amount := ROUND(cancellation_amount, 2);
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commit_settlement_operation'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_payment_intent_id uuid, p_friend_id uuid, p_group_id uuid, p_mode text, p_amount numeric, p_currency text, p_date timestamp with time zone, p_expected_balance numeric, p_allocations jsonb, p_transfers jsonb, p_cancellations jsonb';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'commit_settlement_operation() was not found';
  END IF;

  original_definition := function_definition;
  function_definition := replace(function_definition, old_validation, new_validation);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update cancellation amount normalization';
  END IF;

  EXECUTE function_definition;
END;
$$;
