-- A payer may have a zero split while still being the person owed by the
-- current user. Keep payer-driven pair balances in the friend detail model.

DO $$
DECLARE
  function_definition text;
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

  function_definition := replace(
    function_definition,
    'AND current_split.amount > 0',
    'AND (current_split.amount > 0 OR e.paid_by = app_user_id)'
  );
  function_definition := replace(
    function_definition,
    'AND friend_split.amount > 0',
    'AND (friend_split.amount > 0 OR e.paid_by = p_friend_id)'
  );

  EXECUTE function_definition;
END;
$$;
