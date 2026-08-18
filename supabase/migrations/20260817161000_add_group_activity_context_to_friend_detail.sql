-- Keep Group expenses out of the direct Friend ledger while returning the
-- pair-relevant Group expenses as read-only activity context.

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
    '    pair_settlements AS (',
    $sql$    group_expenses AS (
      SELECT
        e.*,
        COALESCE(current_split.amount, 0) AS your_share,
        COALESCE(friend_split.amount, 0) AS friend_share
      FROM public.expenses e
      LEFT JOIN public.expense_splits current_split
        ON current_split.expense_id = e.id
       AND current_split.user_id = app_user_id
      LEFT JOIN public.expense_splits friend_split
        ON friend_split.expense_id = e.id
       AND friend_split.user_id = p_friend_id
      WHERE e.deleted_at IS NULL
        AND e.group_id IS NOT NULL
        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)
        AND (COALESCE(friend_split.amount, 0) > 0 OR e.paid_by = p_friend_id)
    ),
    pair_settlements AS ($sql$
  );

  function_definition := replace(
    function_definition,
    '    settlement_projection AS (',
    $sql$    group_expense_projection AS (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'groupId', e.group_id,
          'description', e.description,
          'amount', e.amount,
          'currency', e.currency,
          'paidBy', e.paid_by,
          'createdBy', e.created_by,
          'category', e.category,
          'date', e.date,
          'imageUrl', e.image_url,
          'notes', e.notes,
          'createdAt', e.created_at,
          'updatedAt', e.updated_at,
          'yourShare', e.your_share,
          'friendShare', e.friend_share,
          'paidByName', CASE
            WHEN e.paid_by = app_user_id THEN 'You'
            ELSE COALESCE(payer.name, 'Group member')
          END,
          'groupName', group_row.name
        )
        ORDER BY e.date DESC, e.id DESC
      ), '[]'::jsonb) AS value
      FROM group_expenses e
      LEFT JOIN public.groups group_row ON group_row.id = e.group_id
      LEFT JOIN public.users payer ON payer.id = e.paid_by
    ),
    settlement_projection AS ($sql$
  );

  function_definition := replace(
    function_definition,
    $replace$      'expenses', ep.value,
      'settlements', sp.value,$replace$,
    $replace$      'expenses', ep.value,
      'groupExpenses', gep.value,
      'settlements', sp.value,$replace$
  );

  function_definition := replace(
    function_definition,
    '    CROSS JOIN settlement_projection sp',
    '    CROSS JOIN group_expense_projection gep' || chr(10) ||
    '    CROSS JOIN settlement_projection sp'
  );

  IF function_definition = original_definition
     OR position('group_expenses AS' IN function_definition) = 0
     OR position('groupExpenses' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Could not add Group activity context to friend detail RPC';
  END IF;

  EXECUTE function_definition;
END;
$$;
