-- activities.metadata is jsonb; keep the deletion audit payload as jsonb
-- instead of converting it to text before insertion.

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
    AND p.proname = 'soft_delete_expense'
    AND pg_get_function_identity_arguments(p.oid) = 'p_expense_id uuid, p_user_name text';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'soft_delete_expense(uuid, text) was not found';
  END IF;

  original_definition := function_definition;
  function_definition := replace(
    function_definition,
    'jsonb_build_object(''participantIds'', participant_ids)::text',
    'jsonb_build_object(''participantIds'', participant_ids)'
  );

  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not fix soft-delete activity metadata type';
  END IF;

  EXECUTE function_definition;
END;
$$;
