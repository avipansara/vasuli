-- Home Friend cards use the same relationship total as Friend detail:
-- direct Friend ledger plus the selected Friend's net balance across shared
-- Groups. Group balances remain calculated from the complete Group ledger.

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
    'WHERE e.deleted_at IS NULL' || chr(10) || '      AND EXISTS (',
    'WHERE e.deleted_at IS NULL' || chr(10) ||
      '      AND e.group_id IS NULL' || chr(10) ||
      '      AND EXISTS ('
  );

  function_definition := replace(
    function_definition,
    '  all_impacts AS (',
    $insert$  group_paid_impacts AS (
    SELECT e.group_id, e.currency, e.paid_by AS user_id, SUM(e.amount) AS impact_amount
    FROM public.expenses e
    JOIN public.group_members current_member
      ON current_member.group_id = e.group_id
     AND current_member.user_id = app_user_id
    WHERE e.deleted_at IS NULL
    GROUP BY e.group_id, e.currency, e.paid_by
  ),
  group_split_impacts AS (
    SELECT e.group_id, e.currency, split.user_id, -SUM(split.amount) AS impact_amount
    FROM public.expenses e
    JOIN public.group_members current_member
      ON current_member.group_id = e.group_id
     AND current_member.user_id = app_user_id
    JOIN public.expense_splits split ON split.expense_id = e.id
    WHERE e.deleted_at IS NULL
    GROUP BY e.group_id, e.currency, split.user_id
  ),
  group_settlement_impacts AS (
    SELECT s.group_id, s.currency, s.from_user_id AS user_id, SUM(s.amount) AS impact_amount
    FROM public.settlements s
    JOIN public.group_members current_member
      ON current_member.group_id = s.group_id
     AND current_member.user_id = app_user_id
    WHERE s.group_id IS NOT NULL
    GROUP BY s.group_id, s.currency, s.from_user_id

    UNION ALL

    SELECT s.group_id, s.currency, s.to_user_id AS user_id, -SUM(s.amount) AS impact_amount
    FROM public.settlements s
    JOIN public.group_members current_member
      ON current_member.group_id = s.group_id
     AND current_member.user_id = app_user_id
    WHERE s.group_id IS NOT NULL
    GROUP BY s.group_id, s.currency, s.to_user_id
  ),
  group_balances AS (
    SELECT group_id, currency, user_id, SUM(impact_amount) AS group_balance
    FROM (
      SELECT * FROM group_paid_impacts
      UNION ALL
      SELECT * FROM group_split_impacts
      UNION ALL
      SELECT * FROM group_settlement_impacts
    ) impacts
    GROUP BY group_id, currency, user_id
  ),
  shared_group_impacts AS (
    SELECT balances.user_id AS friend_id, -SUM(balances.group_balance) AS impact_amount
    FROM group_balances balances
    JOIN friend_profiles friend ON friend.id = balances.user_id
    JOIN public.group_members current_member
      ON current_member.group_id = balances.group_id
     AND current_member.user_id = app_user_id
    GROUP BY balances.user_id
  ),
  all_impacts AS ($insert$
  );

  function_definition := replace(
    function_definition,
    '    SELECT friend_id, impact_amount
    FROM expense_impacts
    UNION ALL
    SELECT friend_id, impact_amount
    FROM settlement_impacts',
    '    SELECT friend_id, impact_amount' || chr(10) ||
      '    FROM expense_impacts' || chr(10) ||
      '    UNION ALL' || chr(10) ||
      '    SELECT friend_id, impact_amount' || chr(10) ||
      '    FROM settlement_impacts' || chr(10) ||
      '    UNION ALL' || chr(10) ||
      '    SELECT friend_id, impact_amount' || chr(10) ||
      '    FROM shared_group_impacts'
  );

  IF function_definition = original_definition
     OR position('shared_group_impacts AS' IN function_definition) = 0
     OR position('e.group_id IS NULL' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Could not include shared Group balances in friend home summaries';
  END IF;

  EXECUTE function_definition;
END;
$$;
