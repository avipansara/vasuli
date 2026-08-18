-- In share-based expenses, a payer with a zero share may not have a split row
-- at all. Pair detail should treat that missing row as a zero share.

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
    'current_split.amount AS your_share',
    'COALESCE(current_split.amount, 0) AS your_share'
  );
  function_definition := replace(
    function_definition,
    'friend_split.amount AS friend_share',
    'COALESCE(friend_split.amount, 0) AS friend_share'
  );
  function_definition := replace(
    function_definition,
    'JOIN public.expense_splits current_split',
    'LEFT JOIN public.expense_splits current_split'
  );
  function_definition := replace(
    function_definition,
    'JOIN public.expense_splits friend_split',
    'LEFT JOIN public.expense_splits friend_split'
  );

  EXECUTE function_definition;
END;
$$;
