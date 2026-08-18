-- Keep the Friend ledger direct-only. Group balances are exposed separately
-- through the Friend group-balance service and remain owned by their Group.

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

  function_definition := replace(
    function_definition,
    'WHERE (' || chr(10) ||
      '          e.group_id IS NULL' || chr(10) ||
      '          OR (e.paid_by = app_user_id AND COALESCE(friend_split.amount, 0) > 0)' || chr(10) ||
      '          OR (e.paid_by = p_friend_id AND COALESCE(current_split.amount, 0) > 0)' || chr(10) ||
      '        )' || chr(10) ||
      '        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)',
    'WHERE e.group_id IS NULL' || chr(10) ||
      '        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)'
  );
  function_definition := replace(
    function_definition,
    'WHERE e.deleted_at IS NULL' || chr(10) ||
      '        AND (' || chr(10) ||
      '          e.group_id IS NULL' || chr(10) ||
      '          OR (e.paid_by = app_user_id AND COALESCE(friend_split.amount, 0) > 0)' || chr(10) ||
      '          OR (e.paid_by = p_friend_id AND COALESCE(current_split.amount, 0) > 0)' || chr(10) ||
      '        )' || chr(10) ||
      '        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)',
    'WHERE e.deleted_at IS NULL' || chr(10) ||
      '        AND e.group_id IS NULL' || chr(10) ||
      '        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)'
  );
  function_definition := replace(
    function_definition,
    'WHERE a.type IN (''expense_updated'', ''expense_deleted'')',
    'WHERE a.group_id IS NULL' || chr(10) ||
      '        AND a.type IN (''expense_updated'', ''expense_deleted'')'
  );

  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Friend ledger was already direct-only or did not match the deployed RPC definition';
  END IF;

  EXECUTE function_definition;
END;
$$;
