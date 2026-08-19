-- Include previously committed scope offsets when validating a later
-- all-balances allocation. Without this, the RPC validates against the raw
-- Group ledger and can reject a direction that the transfer-adjusted client
-- projection correctly calculated.

DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
      current_scope_balance := current_scope_balance + COALESCE((transfer_deltas_by_group->>allocation_group_id::TEXT)::numeric, 0);
$old$;
  new_expression TEXT := $new$
      current_scope_balance := current_scope_balance + COALESCE((
        SELECT SUM(CASE
          WHEN operation.actor_user_id = app_user_id THEN transfer.signed_group_balance_delta
          WHEN operation.friend_user_id = app_user_id THEN -transfer.signed_group_balance_delta
          ELSE 0
        END)
        FROM public.settlement_scope_transfers transfer
        JOIN public.settlement_operations operation
          ON operation.id = transfer.operation_id
        WHERE transfer.group_id = allocation_group_id
          AND transfer.currency = p_currency
          AND NOT transfer.is_reversal
          AND (
            (operation.actor_user_id = app_user_id AND operation.friend_user_id = p_friend_id)
            OR (operation.actor_user_id = p_friend_id AND operation.friend_user_id = app_user_id)
          )
      ), 0)
      + COALESCE((transfer_deltas_by_group->>allocation_group_id::TEXT)::numeric, 0);
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commit_combined_settlement'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_payment_intent_id uuid, p_friend_id uuid, p_amount numeric, p_currency text, p_date timestamp with time zone, p_expected_balance numeric, p_allocations jsonb, p_transfers jsonb';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'commit_combined_settlement(uuid, uuid, numeric, text, timestamptz, numeric, jsonb, jsonb) was not found';
  END IF;

  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);

  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update Group allocation validation in commit_combined_settlement';
  END IF;

  EXECUTE function_definition;
END;
$$;
