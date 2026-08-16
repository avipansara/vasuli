-- The output column named balance is also a PL/pgSQL variable. Qualify the
-- balance CTE columns so the function does not resolve them ambiguously.

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
    SELECT
      friend.id AS friend_id,
      COALESCE(SUM(impact.impact_amount), 0) AS computed_balance
    FROM friend_profiles friend
    LEFT JOIN all_impacts impact ON impact.friend_id = friend.id
    GROUP BY friend.id
  ),
  normalized_balances AS (
    SELECT
      raw.friend_id,
      CASE
        WHEN ABS(raw.computed_balance) < 0.01 THEN 0
        ELSE raw.computed_balance
      END AS normalized_balance
    FROM raw_balances raw
  ),
  ranked_recent_expenses AS (
    SELECT
      impact.*,
      normalized.normalized_balance AS friend_balance,
      ROW_NUMBER() OVER (
        PARTITION BY impact.friend_id
        ORDER BY impact.date DESC, impact.expense_id DESC
      ) AS recent_rank
    FROM expense_impacts impact
    JOIN normalized_balances normalized
      ON normalized.friend_id = impact.friend_id
    WHERE normalized.normalized_balance <> 0
      AND (
        (normalized.normalized_balance > 0 AND impact.impact_amount > 0)
        OR (normalized.normalized_balance < 0 AND impact.impact_amount < 0)
      )
  ),
  recent_expenses AS (
    SELECT
      ranked.friend_id,
      jsonb_agg(
        jsonb_build_object(
          'id', ranked.expense_id,
          'group_id', ranked.group_id,
          'description', ranked.description,
          'amount', ABS(ranked.impact_amount),
          'currency', ranked.currency,
          'paid_by', ranked.paid_by,
          'created_by', ranked.created_by,
          'category', ranked.category,
          'date', ranked.date,
          'image_url', ranked.image_url,
          'notes', ranked.notes,
          'created_at', ranked.created_at,
          'updated_at', ranked.updated_at
        )
        ORDER BY ranked.date DESC, ranked.expense_id DESC
      ) AS recent_expenses
    FROM ranked_recent_expenses ranked
    WHERE ranked.recent_rank <= 2
    GROUP BY ranked.friend_id
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
    normalized.normalized_balance,
    COALESCE(recent.recent_expenses, '[]'::jsonb)
  FROM friend_profiles friend
  JOIN normalized_balances normalized ON normalized.friend_id = friend.id
  LEFT JOIN recent_expenses recent ON recent.friend_id = friend.id
  ORDER BY friend.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_home_summaries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friend_home_summaries() TO authenticated;
