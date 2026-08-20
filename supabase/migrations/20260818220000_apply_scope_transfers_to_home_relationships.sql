-- Apply scope-transfer reclassifications to Home's structured relationship
-- projection without changing the net relationship total.

CREATE OR REPLACE FUNCTION public.get_friend_home_relationships()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  avatar text,
  push_token text,
  is_active boolean,
  created_at timestamptz,
  balance numeric,
  recent_expenses jsonb,
  relationship jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id UUID;
BEGIN
  SELECT u.id INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH home_rows AS (
    SELECT * FROM public.get_friend_home_relationships_legacy()
  ),
  transfer_deltas AS (
    SELECT
      CASE WHEN operation.actor_user_id = app_user_id
        THEN operation.friend_user_id ELSE operation.actor_user_id END AS friend_id,
      transfer.group_id,
      transfer.currency,
      SUM(CASE WHEN operation.actor_user_id = app_user_id
        THEN transfer.signed_group_balance_delta
        ELSE -transfer.signed_group_balance_delta END) AS delta
    FROM public.settlement_scope_transfers transfer
    JOIN public.settlement_operations operation
      ON operation.id = transfer.operation_id
    WHERE operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id
    GROUP BY 1, 2, 3
  ),
  adjusted_direct AS (
    SELECT
      home.id AS friend_id,
      COALESCE((home.relationship ->> 'directBalance')::numeric, 0)
        - COALESCE((
          SELECT SUM(delta)
          FROM transfer_deltas delta
          WHERE delta.friend_id = home.id
            AND delta.currency = home.relationship ->> 'directCurrency'
        ), 0) AS direct_balance
    FROM home_rows home
  ),
  adjusted_group_items AS (
    SELECT
      home.id AS friend_id,
      item,
      (item ->> 'amount')::numeric + COALESCE(delta.delta, 0) AS amount
    FROM home_rows home
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(home.relationship -> 'groupBalances', '[]'::jsonb)
    ) item
    LEFT JOIN transfer_deltas delta
      ON delta.friend_id = home.id
     AND delta.group_id = NULLIF(item ->> 'groupId', '')::uuid
     AND delta.currency = item ->> 'currency'
  ),
  adjusted_groups AS (
    SELECT
      friend_id,
      jsonb_agg(jsonb_build_object(
        'groupId', item ->> 'groupId',
        'groupName', item ->> 'groupName',
        'currency', item ->> 'currency',
        'amount', CASE WHEN ABS(amount) < 0.01 THEN 0 ELSE ROUND(amount, 2) END,
        'direction', CASE
          WHEN amount > 0.01 THEN 'you_are_owed'
          WHEN amount < -0.01 THEN 'you_owe'
          ELSE 'settled'
        END,
        'lastActivityAt', item -> 'lastActivityAt'
      ) ORDER BY item ->> 'groupName', item ->> 'currency') AS group_balances
    FROM adjusted_group_items
    GROUP BY friend_id
  ),
  adjusted_relationship AS (
    SELECT
      home.*,
      direct.direct_balance,
      COALESCE(groups.group_balances, '[]'::jsonb) AS group_balances,
      home.relationship -> 'totalsByCurrency' AS totals_by_currency,
      (
        SELECT jsonb_build_object(
          'currency', total ->> 'currency',
          'amount', (total ->> 'amount')::numeric,
          'direction', total ->> 'direction'
        )
        FROM jsonb_array_elements(
          COALESCE(home.relationship -> 'totalsByCurrency', '[]'::jsonb)
        ) total
        WHERE ABS((total ->> 'amount')::numeric) >= 0.01
        LIMIT 1
      ) AS settleable_total
    FROM home_rows home
    JOIN adjusted_direct direct ON direct.friend_id = home.id
    LEFT JOIN adjusted_groups groups ON groups.friend_id = home.id
  )
  SELECT
    adjusted.id,
    adjusted.name,
    adjusted.email,
    adjusted.phone,
    adjusted.avatar,
    adjusted.push_token,
    adjusted.is_active,
    adjusted.created_at,
    CASE
      WHEN jsonb_array_length(adjusted.totals_by_currency) = 1
        THEN (adjusted.totals_by_currency -> 0 ->> 'amount')::numeric
      ELSE adjusted.balance
    END AS balance,
    adjusted.recent_expenses,
    jsonb_build_object(
      'directBalance', CASE WHEN ABS(adjusted.direct_balance) < 0.01 THEN 0 ELSE ROUND(adjusted.direct_balance, 2) END,
      'directCurrency', adjusted.relationship -> 'directCurrency',
      'groupBalances', adjusted.group_balances,
      'activity', adjusted.relationship -> 'activity',
      'totalsByCurrency', adjusted.totals_by_currency,
      'settleableTotal', adjusted.settleable_total
    ) AS relationship
  FROM adjusted_relationship adjusted
  ORDER BY adjusted.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_home_relationships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_home_relationships() TO authenticated;
