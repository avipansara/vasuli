-- Group expenses and group settlements belong to the group ledger, not an
-- individual friend ledger, even when both friends share the expense.

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
    AND p.proname = 'get_friend_detail_read_model'
    AND pg_get_function_identity_arguments(p.oid) = 'p_friend_id uuid';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_detail_read_model(uuid) was not found';
  END IF;

  original_definition := function_definition;

  -- Handle both the current soft-delete predicate and the older version.
  function_definition := replace(
    function_definition,
    'WHERE e.deleted_at IS NULL' || chr(10) ||
      '        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)',
    'WHERE e.deleted_at IS NULL' || chr(10) ||
      '        AND e.group_id IS NULL' || chr(10) ||
      '        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)'
  );
  function_definition := replace(
    function_definition,
    'WHERE (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)',
    'WHERE e.group_id IS NULL' || chr(10) ||
      '        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)'
  );

  function_definition := replace(
    function_definition,
    'WHERE (s.from_user_id = app_user_id AND s.to_user_id = p_friend_id)' || chr(10) ||
      '         OR (s.from_user_id = p_friend_id AND s.to_user_id = app_user_id)',
    'WHERE s.group_id IS NULL' || chr(10) ||
      '        AND (' || chr(10) ||
      '          (s.from_user_id = app_user_id AND s.to_user_id = p_friend_id)' || chr(10) ||
      '          OR (s.from_user_id = p_friend_id AND s.to_user_id = app_user_id)' || chr(10) ||
      '        )'
  );

  function_definition := replace(
    function_definition,
    'WHERE a.type IN (''expense_updated'', ''expense_deleted'')',
    'WHERE a.group_id IS NULL' || chr(10) ||
      '        AND a.type IN (''expense_updated'', ''expense_deleted'')'
  );

  IF function_definition = original_definition
    AND position('e.group_id IS NULL' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Could not add group filters to get_friend_detail_read_model(uuid)';
  END IF;

  IF function_definition <> original_definition THEN
    EXECUTE function_definition;
  END IF;
END;
$$;
