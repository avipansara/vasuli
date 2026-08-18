-- Return the same structured relationship projection used by Friend detail.
-- The legacy home RPC remains the source of recent-card activity while this
-- function owns the Direct/Group balance contract for Home.

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
  app_user_id uuid;
BEGIN
  SELECT u.id
  INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH home_rows AS (
    SELECT *
    FROM public.get_friend_home_summaries()
  ),
  accepted_friends AS (
    SELECT DISTINCT CASE
      WHEN f.user_id = app_user_id THEN f.friend_id
      ELSE f.user_id
    END AS friend_id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.user_id = app_user_id OR f.friend_id = app_user_id)
  ),
  friend_profiles AS (
    SELECT u.id AS friend_id
    FROM public.users u
    JOIN accepted_friends f ON f.friend_id = u.id
  ),
  direct_expense_impacts AS (
    SELECT
      friend.friend_id,
      e.currency,
      CASE
        WHEN e.paid_by = app_user_id THEN COALESCE(friend_split.amount, 0)
        WHEN e.paid_by = friend.friend_id THEN -COALESCE(current_split.amount, 0)
        ELSE 0
      END AS amount
    FROM friend_profiles friend
    JOIN public.expenses e
      ON e.group_id IS NULL
     AND e.deleted_at IS NULL
    LEFT JOIN public.expense_splits current_split
      ON current_split.expense_id = e.id
     AND current_split.user_id = app_user_id
    LEFT JOIN public.expense_splits friend_split
      ON friend_split.expense_id = e.id
     AND friend_split.user_id = friend.friend_id
    WHERE (current_split.amount > 0 OR e.paid_by = app_user_id)
      AND (friend_split.amount > 0 OR e.paid_by = friend.friend_id)
      AND (e.paid_by = app_user_id OR e.paid_by = friend.friend_id)
  ),
  direct_settlement_impacts AS (
    SELECT
      friend.friend_id,
      s.currency,
      CASE WHEN s.from_user_id = app_user_id THEN s.amount ELSE -s.amount END AS amount
    FROM friend_profiles friend
    JOIN public.settlements s
      ON s.group_id IS NULL
     AND (
       (s.from_user_id = app_user_id AND s.to_user_id = friend.friend_id)
       OR (s.from_user_id = friend.friend_id AND s.to_user_id = app_user_id)
     )
  ),
  direct_impacts AS (
    SELECT * FROM direct_expense_impacts
    UNION ALL
    SELECT * FROM direct_settlement_impacts
  ),
  direct_currency_balances AS (
    SELECT friend_id, currency, SUM(amount) AS amount
    FROM direct_impacts
    GROUP BY friend_id, currency
  ),
  direct_balances AS (
    SELECT
      friend_id,
      CASE WHEN COUNT(*) = 1 THEN SUM(amount) ELSE 0 END AS direct_balance,
      CASE WHEN COUNT(*) = 1 THEN MIN(currency) END AS direct_currency
    FROM direct_currency_balances
    GROUP BY friend_id
  ),
  shared_groups AS (
    SELECT DISTINCT
      current_member.group_id,
      friend.friend_id
    FROM public.group_members current_member
    JOIN public.group_members friend_member
      ON friend_member.group_id = current_member.group_id
    JOIN friend_profiles friend
      ON friend.friend_id = friend_member.user_id
    WHERE current_member.user_id = app_user_id
  ),
  group_impacts AS (
    SELECT e.group_id, e.currency, e.paid_by AS user_id, e.amount AS amount
    FROM public.expenses e
    JOIN public.group_members current_member
      ON current_member.group_id = e.group_id
     AND current_member.user_id = app_user_id
    WHERE e.deleted_at IS NULL

    UNION ALL

    SELECT e.group_id, e.currency, split.user_id, -split.amount
    FROM public.expenses e
    JOIN public.group_members current_member
      ON current_member.group_id = e.group_id
     AND current_member.user_id = app_user_id
    JOIN public.expense_splits split ON split.expense_id = e.id
    WHERE e.deleted_at IS NULL

    UNION ALL

    SELECT s.group_id, s.currency, s.from_user_id, s.amount
    FROM public.settlements s
    JOIN public.group_members current_member
      ON current_member.group_id = s.group_id
     AND current_member.user_id = app_user_id
    WHERE s.group_id IS NOT NULL

    UNION ALL

    SELECT s.group_id, s.currency, s.to_user_id, -s.amount
    FROM public.settlements s
    JOIN public.group_members current_member
      ON current_member.group_id = s.group_id
     AND current_member.user_id = app_user_id
    WHERE s.group_id IS NOT NULL
  ),
  group_balances AS (
    SELECT group_id, currency, user_id, SUM(amount) AS group_balance
    FROM group_impacts
    GROUP BY group_id, currency, user_id
  ),
  group_activity AS (
    SELECT group_id, currency, MAX(activity_at) AS last_activity_at
    FROM (
      SELECT group_id, currency, COALESCE(updated_at, date) AS activity_at
      FROM public.expenses
      WHERE deleted_at IS NULL AND group_id IS NOT NULL
      UNION ALL
      SELECT group_id, currency, COALESCE(created_at, date) AS activity_at
      FROM public.settlements
      WHERE group_id IS NOT NULL
    ) activity
    GROUP BY group_id, currency
  ),
  friend_group_balances AS (
    SELECT
      shared.friend_id,
      shared.group_id,
      balances.currency,
      -balances.group_balance AS amount,
      groups.name AS group_name,
      activity.last_activity_at
    FROM shared_groups shared
    JOIN group_balances balances
      ON balances.group_id = shared.group_id
     AND balances.user_id = shared.friend_id
    JOIN public.groups groups ON groups.id = shared.group_id
    LEFT JOIN group_activity activity
      ON activity.group_id = balances.group_id
     AND activity.currency = balances.currency
  ),
  group_summary_json AS (
    SELECT
      friend_id,
      jsonb_agg(jsonb_build_object(
        'groupId', group_id,
        'groupName', group_name,
        'currency', currency,
        'amount', CASE WHEN ABS(amount) < 0.01 THEN 0 ELSE ROUND(amount, 2) END,
        'direction', CASE
          WHEN amount > 0.01 THEN 'you_are_owed'
          WHEN amount < -0.01 THEN 'you_owe'
          ELSE 'settled'
        END,
        'lastActivityAt', EXTRACT(EPOCH FROM last_activity_at) * 1000
      ) ORDER BY group_name, currency) AS group_balances
    FROM friend_group_balances
    GROUP BY friend_id
  ),
  group_currency_balances AS (
    SELECT friend_id, currency, SUM(amount) AS amount
    FROM friend_group_balances
    GROUP BY friend_id, currency
  ),
  relationship_totals AS (
    SELECT friend_id, currency, amount
    FROM group_currency_balances

    UNION ALL

    SELECT direct.friend_id, direct.direct_currency, direct.direct_balance
    FROM direct_balances direct
    WHERE direct.direct_currency IS NOT NULL
  ),
  totals_by_currency AS (
    SELECT
      friend_id,
      currency,
      SUM(amount) AS amount
    FROM relationship_totals
    GROUP BY friend_id, currency
  ),
  scope_directions AS (
    SELECT friend_id, MIN(SIGN(amount)) AS min_sign, MAX(SIGN(amount)) AS max_sign
    FROM (
      SELECT friend_id, direct_balance AS amount
      FROM direct_balances
      WHERE ABS(direct_balance) >= 0.01
      UNION ALL
      SELECT friend_id, amount
      FROM friend_group_balances
      WHERE ABS(amount) >= 0.01
    ) scopes
    GROUP BY friend_id
  ),
  outstanding_totals AS (
    SELECT friend_id, MIN(currency) AS currency, SUM(amount) AS amount
    FROM totals_by_currency
    WHERE ABS(amount) >= 0.01
    GROUP BY friend_id
    HAVING COUNT(*) = 1
  ),
  relationship_rows AS (
    SELECT
      profiles.friend_id,
      COALESCE(direct.direct_balance, 0) AS direct_balance,
      direct.direct_currency,
      COALESCE(groups.group_balances, '[]'::jsonb) AS group_balances,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'currency', totals.currency,
          'amount', CASE WHEN ABS(totals.amount) < 0.01 THEN 0 ELSE ROUND(totals.amount, 2) END,
          'direction', CASE
            WHEN totals.amount > 0.01 THEN 'you_are_owed'
            WHEN totals.amount < -0.01 THEN 'you_owe'
            ELSE 'settled'
          END
        ) ORDER BY totals.currency)
        FROM totals_by_currency totals
        WHERE totals.friend_id = profiles.friend_id
      ), '[]'::jsonb) AS totals_by_currency,
      CASE
        WHEN outstanding.currency IS NOT NULL
         AND (COALESCE(direct.direct_balance, 0) = 0 OR direct.direct_currency = outstanding.currency)
         AND COALESCE(directions.min_sign, 0) = COALESCE(directions.max_sign, 0)
        THEN jsonb_build_object(
          'currency', outstanding.currency,
          'amount', ROUND(outstanding.amount, 2),
          'direction', CASE WHEN outstanding.amount > 0 THEN 'you_are_owed' ELSE 'you_owe' END
        )
      END AS settleable_total
    FROM friend_profiles profiles
    LEFT JOIN direct_balances direct ON direct.friend_id = profiles.friend_id
    LEFT JOIN group_summary_json groups ON groups.friend_id = profiles.friend_id
    LEFT JOIN outstanding_totals outstanding ON outstanding.friend_id = profiles.friend_id
    LEFT JOIN scope_directions directions ON directions.friend_id = profiles.friend_id
  )
  SELECT
    home.id,
    home.name,
    home.email,
    home.phone,
    home.avatar,
    home.push_token,
    home.is_active,
    home.created_at,
    COALESCE(
      (relationship.settleable_total ->> 'amount')::numeric,
      CASE WHEN relationship.direct_currency IS NOT NULL THEN relationship.direct_balance ELSE 0 END
    ) AS balance,
    home.recent_expenses,
    jsonb_build_object(
      'directBalance', relationship.direct_balance,
      'directCurrency', relationship.direct_currency,
      'groupBalances', relationship.group_balances,
      'activity', '[]'::jsonb,
      'totalsByCurrency', relationship.totals_by_currency,
      'settleableTotal', relationship.settleable_total
    ) AS relationship
  FROM home_rows home
  JOIN relationship_rows relationship ON relationship.friend_id = home.id
  ORDER BY home.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_home_relationships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friend_home_relationships() TO authenticated;
