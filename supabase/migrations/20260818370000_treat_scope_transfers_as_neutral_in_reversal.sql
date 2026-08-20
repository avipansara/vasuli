-- Scope transfers reclassify an amount between group and direct scopes. They
-- must not change the combined friendship balance used by reversal validation.
-- The group and direct ledger terms already describe the relationship balance;
-- adding the transfer delta again double-counts the reclassification.

DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  transfer_balance_term TEXT := $old$
  + COALESCE((
    SELECT SUM(t.signed_group_balance_delta)
    FROM public.settlement_scope_transfers t
    JOIN public.group_members current_member
      ON current_member.group_id = t.group_id
     AND current_member.user_id = operation_row.actor_user_id
    JOIN public.group_members friend_member
      ON friend_member.group_id = t.group_id
     AND friend_member.user_id = operation_row.friend_user_id
    WHERE t.currency = operation_row.currency
      AND (
        (t.from_user_id = operation_row.actor_user_id AND t.to_user_id = operation_row.friend_user_id)
        OR (t.from_user_id = operation_row.friend_user_id AND t.to_user_id = operation_row.actor_user_id)
      )
  ), 0)
$old$;
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
  function_definition := replace(function_definition, transfer_balance_term, '');

  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not remove scope-transfer double counting from reversal validation';
  END IF;

  EXECUTE function_definition;
END;
$$;
