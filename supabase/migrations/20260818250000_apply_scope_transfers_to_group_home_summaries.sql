-- Keep the Groups home cards aligned with Group detail after a scope transfer.

CREATE OR REPLACE FUNCTION public.get_groups_home_summaries()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  image_url text,
  created_at timestamptz,
  updated_at timestamptz,
  your_balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id uuid;
BEGIN
  SELECT u.id INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH user_groups AS (
    SELECT g.id, g.name, g.description, g.image_url, g.created_at, g.updated_at
    FROM public.groups g
    JOIN public.group_members member ON member.group_id = g.id
    WHERE member.user_id = app_user_id
      AND g.deleted_at IS NULL
  ),
  group_expenses AS (
    SELECT e.id, e.group_id, e.amount, e.paid_by
    FROM public.expenses e
    JOIN user_groups group_row ON group_row.id = e.group_id
    WHERE e.deleted_at IS NULL
  ),
  expense_impacts AS (
    SELECT e.group_id, e.amount AS impact_amount
    FROM group_expenses e
    WHERE e.paid_by = app_user_id
    UNION ALL
    SELECT e.group_id, -split.amount AS impact_amount
    FROM group_expenses e
    JOIN public.expense_splits split ON split.expense_id = e.id
    WHERE split.user_id = app_user_id
  ),
  settlement_impacts AS (
    SELECT settlement.group_id,
      CASE WHEN settlement.from_user_id = app_user_id THEN settlement.amount ELSE -settlement.amount END AS impact_amount
    FROM public.settlements settlement
    JOIN user_groups group_row ON group_row.id = settlement.group_id
    WHERE settlement.from_user_id = app_user_id OR settlement.to_user_id = app_user_id
  ),
  transfer_impacts AS (
    SELECT transfer.group_id,
      CASE WHEN operation.actor_user_id = app_user_id
        THEN transfer.signed_group_balance_delta
        ELSE -transfer.signed_group_balance_delta
      END AS impact_amount
    FROM public.settlement_scope_transfers transfer
    JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
    JOIN user_groups group_row ON group_row.id = transfer.group_id
    WHERE operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id
  ),
  all_impacts AS (
    SELECT group_id, impact_amount FROM expense_impacts
    UNION ALL SELECT group_id, impact_amount FROM settlement_impacts
    UNION ALL SELECT group_id, impact_amount FROM transfer_impacts
  ),
  balances AS (
    SELECT group_id, SUM(impact_amount) AS computed_balance
    FROM all_impacts
    GROUP BY group_id
  )
  SELECT group_row.id, group_row.name, group_row.description, group_row.image_url,
    group_row.created_at, group_row.updated_at,
    CASE WHEN ABS(COALESCE(balance.computed_balance, 0)) < 0.01 THEN 0
      ELSE COALESCE(balance.computed_balance, 0) END AS your_balance
  FROM user_groups group_row
  LEFT JOIN balances balance ON balance.group_id = group_row.id
  ORDER BY group_row.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_groups_home_summaries() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_groups_home_summaries() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_groups_home_summaries() TO authenticated;
