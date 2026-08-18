-- Return pair-relevant Group expenses as recent Friend-card activity without
-- adding them to the Friend balance calculation.

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
    AND p.proname = 'get_friend_home_summaries'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_home_summaries() was not found';
  END IF;

  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    '  ranked_recent_expenses AS (',
    $insert$  group_activity_impacts AS (
    SELECT
      friend.id AS friend_id,
      e.id AS expense_id,
      e.group_id,
      e.description,
      e.currency,
      e.paid_by,
      e.created_by,
      e.category,
      e.date,
      e.image_url,
      e.notes,
      e.created_at,
      e.updated_at,
      CASE
        WHEN e.paid_by = app_user_id THEN COALESCE(friend_split.amount, 0)
        WHEN e.paid_by = friend.id THEN -COALESCE(current_split.amount, 0)
        ELSE 0
      END AS impact_amount
    FROM public.expenses e
    CROSS JOIN friend_profiles friend
    LEFT JOIN public.expense_splits current_split
      ON current_split.expense_id = e.id
     AND current_split.user_id = app_user_id
    LEFT JOIN public.expense_splits friend_split
      ON friend_split.expense_id = e.id
     AND friend_split.user_id = friend.id
    WHERE e.deleted_at IS NULL
      AND e.group_id IS NOT NULL
      AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)
      AND (COALESCE(friend_split.amount, 0) > 0 OR e.paid_by = friend.id)
  ),
  ranked_recent_expenses AS ($insert$
  );

  function_definition := replace(
    function_definition,
    '    FROM expense_impacts impact
    JOIN normalized_balances normalized',
    '    FROM (' || chr(10) ||
      '      SELECT * FROM expense_impacts' || chr(10) ||
      '      UNION ALL' || chr(10) ||
      '      SELECT * FROM group_activity_impacts' || chr(10) ||
      '    ) impact' || chr(10) ||
      '    JOIN normalized_balances normalized'
  );

  function_definition := replace(
    function_definition,
    $predicate$      AND (
        (normalized.normalized_balance > 0 AND impact.impact_amount > 0)
        OR (normalized.normalized_balance < 0 AND impact.impact_amount < 0)
      )$predicate$,
    '      AND (' || chr(10) ||
      '        impact.group_id IS NOT NULL' || chr(10) ||
      '        OR (' || chr(10) ||
      '          (normalized.normalized_balance > 0 AND impact.impact_amount > 0)' || chr(10) ||
      '          OR (normalized.normalized_balance < 0 AND impact.impact_amount < 0)' || chr(10) ||
      '        )' || chr(10) ||
      '      )'
  );

  IF function_definition = original_definition
     OR position('group_activity_impacts AS' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Could not include Group activity in friend home summaries';
  END IF;

  EXECUTE function_definition;
END;
$$;
