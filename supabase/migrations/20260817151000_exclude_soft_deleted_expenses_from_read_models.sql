DO $$
DECLARE
  friend_detail_definition text;
  friend_home_definition text;
  groups_home_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO friend_detail_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_friend_detail_read_model'
    AND pg_get_function_identity_arguments(p.oid) = 'p_friend_id uuid';

  IF friend_detail_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_detail_read_model(uuid) was not found';
  END IF;

  IF position('e.deleted_at IS NULL' IN friend_detail_definition) = 0 THEN
    friend_detail_definition := replace(
      friend_detail_definition,
      'WHERE (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)',
      'WHERE e.deleted_at IS NULL' || chr(10) ||
        '        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)'
    );
    EXECUTE friend_detail_definition;
  END IF;

  SELECT pg_get_functiondef(p.oid)
  INTO friend_home_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_friend_home_summaries'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF friend_home_definition IS NOT NULL AND position('e.deleted_at IS NULL' IN friend_home_definition) = 0 THEN
    friend_home_definition := replace(
      friend_home_definition,
      'WHERE EXISTS (',
      'WHERE e.deleted_at IS NULL' || chr(10) || '      AND EXISTS ('
    );
    EXECUTE friend_home_definition;
  END IF;

  SELECT pg_get_functiondef(p.oid)
  INTO groups_home_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_groups_home_summaries'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF groups_home_definition IS NOT NULL AND position('WHERE e.deleted_at IS NULL' IN groups_home_definition) = 0 THEN
    groups_home_definition := replace(
      groups_home_definition,
      'JOIN user_groups group_row ON group_row.id = e.group_id',
      'JOIN user_groups group_row ON group_row.id = e.group_id' || chr(10) ||
        '    WHERE e.deleted_at IS NULL'
    );
    EXECUTE groups_home_definition;
  END IF;
END;
$$;
