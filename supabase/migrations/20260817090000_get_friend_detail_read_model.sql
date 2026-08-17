-- Pair-scoped Friend detail read model.
--
-- The RPC derives the current app user from the Supabase Auth session and
-- returns only the projection required by Friend detail. It intentionally
-- avoids exposing a general-purpose expense, split, settlement, or activity
-- read API.

CREATE OR REPLACE FUNCTION public.get_friend_detail_read_model(p_friend_id uuid)
RETURNS jsonb
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
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = app_user_id AND f.friend_id = p_friend_id)
        OR (f.user_id = p_friend_id AND f.friend_id = app_user_id)
      )
  ) THEN
    RETURN NULL;
  END IF;

  RETURN (
    WITH friend_profile AS (
      SELECT u.*
      FROM public.users u
      WHERE u.id = p_friend_id
    ),
    shared_expenses AS (
      SELECT
        e.*,
        current_split.amount AS your_share,
        friend_split.amount AS friend_share
      FROM public.expenses e
      JOIN public.expense_splits current_split
        ON current_split.expense_id = e.id
       AND current_split.user_id = app_user_id
      JOIN public.expense_splits friend_split
        ON friend_split.expense_id = e.id
       AND friend_split.user_id = p_friend_id
    ),
    pair_settlements AS (
      SELECT s.*,
        CASE WHEN s.from_user_id = app_user_id
          THEN 'you_paid_friend'
          ELSE 'friend_paid_you'
        END AS direction
      FROM public.settlements s
      WHERE (s.from_user_id = app_user_id AND s.to_user_id = p_friend_id)
         OR (s.from_user_id = p_friend_id AND s.to_user_id = app_user_id)
    ),
    balance AS (
      SELECT COALESCE((
        SELECT SUM(
          CASE
            WHEN e.paid_by = app_user_id THEN e.friend_share
            WHEN e.paid_by = p_friend_id THEN -e.your_share
            ELSE 0
          END
        )
        FROM shared_expenses e
      ), 0)
      + COALESCE((
        SELECT SUM(
          CASE WHEN s.from_user_id = app_user_id THEN s.amount ELSE -s.amount END
        )
        FROM pair_settlements s
      ), 0) AS raw_balance
    ),
    normalized_balance AS (
      SELECT CASE WHEN ABS(raw_balance) < 0.01 THEN 0 ELSE raw_balance END AS value
      FROM balance
    ),
    expense_projection AS (
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
          'paidByName', CASE WHEN e.paid_by = app_user_id THEN 'You' ELSE f.name END
        )
        ORDER BY e.date DESC, e.id DESC
      ), '[]'::jsonb) AS value
      FROM shared_expenses e
      CROSS JOIN friend_profile f
    ),
    settlement_projection AS (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'groupId', s.group_id,
          'amount', s.amount,
          'currency', s.currency,
          'date', s.date,
          'notes', s.notes,
          'createdAt', s.created_at,
          'direction', s.direction
        )
        ORDER BY s.date DESC, s.id DESC
      ), '[]'::jsonb) AS value
      FROM pair_settlements s
    ),
    activity_projection AS (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'activityType', a.type,
          'targetId', a.target_id,
          'groupId', a.group_id,
          'groupName', a.group_name,
          'description', a.description,
          'amount', a.amount,
          'userId', a.user_id,
          'userName', a.user_name,
          'date', a.created_at,
          'isDeleted', a.type = 'expense_deleted',
          'isUpdated', a.type = 'expense_updated'
        )
        ORDER BY a.created_at DESC, a.id DESC
      ), '[]'::jsonb) AS value
      FROM public.activities a
      WHERE a.type IN ('expense_updated', 'expense_deleted')
        AND (
          a.target_id IN (SELECT e.id FROM shared_expenses e)
          OR (
            a.type = 'expense_deleted'
            AND a.metadata -> 'participantIds' ? app_user_id::text
            AND a.metadata -> 'participantIds' ? p_friend_id::text
          )
        )
    )
    SELECT jsonb_build_object(
      'friend', jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'email', f.email,
        'phone', f.phone,
        'avatar', f.avatar,
        'pushToken', f.push_token,
        'isActive', f.is_active,
        'createdAt', f.created_at,
        'balance', b.value
      ),
      'expenses', ep.value,
      'settlements', sp.value,
      'activities', ap.value
    )
    FROM friend_profile f
    CROSS JOIN normalized_balance b
    CROSS JOIN expense_projection ep
    CROSS JOIN settlement_projection sp
    CROSS JOIN activity_projection ap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_detail_read_model(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friend_detail_read_model(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_expense_splits_user_expense_id
  ON public.expense_splits(user_id, expense_id);

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_user_id
  ON public.expense_splits(expense_id, user_id);

CREATE INDEX IF NOT EXISTS idx_activities_target_id_created_at
  ON public.activities(target_id, created_at DESC);
