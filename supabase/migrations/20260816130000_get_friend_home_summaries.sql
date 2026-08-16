-- Friends home read model.
--
-- This function intentionally returns only the projection needed by the
-- Friends screen. It resolves the app user from the Supabase Auth session,
-- then performs the balance calculation set-wise as the function owner. The
-- function is not a general-purpose expense or settlement read API.

CREATE OR REPLACE FUNCTION public.get_friend_home_summaries()
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
  recent_expenses jsonb
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
  WITH accepted_friends AS (
    SELECT DISTINCT
      CASE
        WHEN f.user_id = app_user_id THEN f.friend_id
        ELSE f.user_id
      END AS friend_id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.user_id = app_user_id OR f.friend_id = app_user_id)
  ),
  friend_profiles AS (
    SELECT u.*
    FROM public.users u
    JOIN accepted_friends f ON f.friend_id = u.id
  ),
  current_user_expenses AS (
    SELECT e.*
    FROM public.expenses e
    WHERE EXISTS (
      SELECT 1
      FROM public.expense_splits current_split
      WHERE current_split.expense_id = e.id
        AND current_split.user_id = app_user_id
    )
  ),
  current_user_splits AS (
    SELECT es.expense_id, es.amount
    FROM public.expense_splits es
    JOIN current_user_expenses e ON e.id = es.expense_id
    WHERE es.user_id = app_user_id
  ),
  expense_impacts AS (
    SELECT
      split.user_id AS friend_id,
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
      split.amount AS impact_amount
    FROM current_user_expenses e
    JOIN public.expense_splits split ON split.expense_id = e.id
    JOIN friend_profiles friend ON friend.id = split.user_id
    WHERE e.paid_by = app_user_id

    UNION ALL

    SELECT
      e.paid_by AS friend_id,
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
      -current_split.amount AS impact_amount
    FROM current_user_expenses e
    JOIN current_user_splits current_split ON current_split.expense_id = e.id
    JOIN friend_profiles friend ON friend.id = e.paid_by
    WHERE e.paid_by <> app_user_id
  ),
  settlement_impacts AS (
    SELECT
      CASE
        WHEN s.from_user_id = app_user_id THEN s.to_user_id
        ELSE s.from_user_id
      END AS friend_id,
      s.amount * CASE WHEN s.from_user_id = app_user_id THEN 1 ELSE -1 END AS impact_amount
    FROM public.settlements s
    JOIN friend_profiles friend
      ON friend.id = CASE
        WHEN s.from_user_id = app_user_id THEN s.to_user_id
        ELSE s.from_user_id
      END
    WHERE s.from_user_id = app_user_id OR s.to_user_id = app_user_id
  ),
  all_impacts AS (
    SELECT friend_id, impact_amount
    FROM expense_impacts
    UNION ALL
    SELECT friend_id, impact_amount
    FROM settlement_impacts
  ),
  raw_balances AS (
    SELECT friend.id AS friend_id, COALESCE(SUM(impact.impact_amount), 0) AS balance
    FROM friend_profiles friend
    LEFT JOIN all_impacts impact ON impact.friend_id = friend.id
    GROUP BY friend.id
  ),
  normalized_balances AS (
    SELECT
      friend_id,
      CASE
        WHEN ABS(balance) < 0.01 THEN 0
        ELSE balance
      END AS balance
    FROM raw_balances
  ),
  ranked_recent_expenses AS (
    SELECT
      impact.*,
      balance.balance AS friend_balance,
      ROW_NUMBER() OVER (
        PARTITION BY impact.friend_id
        ORDER BY impact.date DESC, impact.expense_id DESC
      ) AS recent_rank
    FROM expense_impacts impact
    JOIN normalized_balances balance ON balance.friend_id = impact.friend_id
    WHERE balance.balance <> 0
      AND (
        (balance.balance > 0 AND impact.impact_amount > 0)
        OR (balance.balance < 0 AND impact.impact_amount < 0)
      )
  ),
  recent_expenses AS (
    SELECT
      friend_id,
      jsonb_agg(
        jsonb_build_object(
          'id', expense_id,
          'group_id', group_id,
          'description', description,
          'amount', ABS(impact_amount),
          'currency', currency,
          'paid_by', paid_by,
          'created_by', created_by,
          'category', category,
          'date', date,
          'image_url', image_url,
          'notes', notes,
          'created_at', created_at,
          'updated_at', updated_at
        )
        ORDER BY date DESC, expense_id DESC
      ) AS recent_expenses
    FROM ranked_recent_expenses
    WHERE recent_rank <= 2
    GROUP BY friend_id
  )
  SELECT
    friend.id,
    friend.name,
    friend.email,
    friend.phone,
    friend.avatar,
    friend.push_token,
    friend.is_active,
    friend.created_at,
    balance.balance,
    COALESCE(recent.recent_expenses, '[]'::jsonb)
  FROM friend_profiles friend
  JOIN normalized_balances balance ON balance.friend_id = friend.id
  LEFT JOIN recent_expenses recent ON recent.friend_id = friend.id
  ORDER BY friend.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_home_summaries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friend_home_summaries() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_expense_splits_user_expense_id
  ON public.expense_splits(user_id, expense_id);

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_user_id
  ON public.expense_splits(expense_id, user_id);

CREATE INDEX IF NOT EXISTS idx_group_members_group_user_id
  ON public.group_members(group_id, user_id);
