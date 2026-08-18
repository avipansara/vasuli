-- LEFT JOINs are required for payer-only split rows, but the projection must
-- still discard expenses unrelated to both people in the friend pair.

DO $$
DECLARE
  function_definition text;
  old_fragment text := E'       AND (friend_split.amount > 0 OR e.paid_by = p_friend_id)\n    ),\n    pair_settlements AS (';
  new_fragment text := E'       AND (friend_split.amount > 0 OR e.paid_by = p_friend_id)\n      WHERE (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)\n        AND (COALESCE(friend_split.amount, 0) > 0 OR e.paid_by = p_friend_id)\n    ),\n    pair_settlements AS (';
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

  IF position(old_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'friend detail shared_expenses join fragment was not found';
  END IF;

  function_definition := replace(function_definition, old_fragment, new_fragment);
  EXECUTE function_definition;
END;
$$;
