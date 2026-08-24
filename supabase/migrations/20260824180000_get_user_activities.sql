-- User activity feed read model.
--
-- This function returns a paginated, optionally-searched list of activities
-- visible to the calling user. It resolves the app user from the Supabase Auth
-- session, then fetches and merges:
--   1. Rows from `activities` where the user is the actor, a group member, or
--      a participant in the referenced expense.
--   2. Rows synthesised from `settlements` (both as payer and payee), joined
--      to `users` and `groups` to resolve display names.
--
-- Settlement activities from the `activities` table are excluded because the
-- settlements table is the authoritative source for payment events.
--
-- All filtering, ordering, and LIMIT/OFFSET pagination happen inside the
-- function, so callers receive only the rows they actually need.

CREATE OR REPLACE FUNCTION public.get_user_activities(
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_search text    DEFAULT ''
)
RETURNS TABLE (
  id          uuid,
  type        text,
  user_id     uuid,
  user_name   text,
  target_id   uuid,
  group_id    uuid,
  group_name  text,
  description text,
  amount      numeric,
  metadata    text,
  created_at  timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id uuid;
  search_term text;
BEGIN
  -- Resolve app-layer user from the JWT subject
  SELECT u.id
    INTO app_user_id
    FROM public.users u
   WHERE u.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  IF app_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Normalise the search term once; empty string means no filter
  search_term := TRIM(COALESCE(p_search, ''));

  RETURN QUERY
  WITH

  -- Groups the user belongs to
  user_group_ids AS (
    SELECT gm.group_id AS grp_id
      FROM public.group_members gm
     WHERE gm.user_id = app_user_id
  ),

  -- Expenses the user is a participant in (via splits)
  user_expense_ids AS (
    SELECT DISTINCT es.expense_id AS exp_id
      FROM public.expense_splits es
     WHERE es.user_id = app_user_id
  ),

  -- Activities from the activities table, excluding settlement types
  -- (those come from the settlements table below)
  db_activities AS (
    SELECT
      a.id          AS act_id,
      a.type        AS act_type,
      a.user_id     AS act_user_id,
      a.user_name   AS act_user_name,
      a.target_id   AS act_target_id,
      a.group_id    AS act_group_id,
      a.group_name  AS act_group_name,
      a.description AS act_description,
      a.amount      AS act_amount,
      a.metadata::text AS act_metadata,
      a.created_at  AS act_created_at
    FROM public.activities a
    WHERE a.type NOT IN ('settlement_created', 'settlement_deleted')
      AND (
        a.user_id = app_user_id
        OR a.group_id IN (SELECT grp_id FROM user_group_ids)
        OR a.target_id IN (SELECT exp_id FROM user_expense_ids)
      )
  ),

  -- Activities synthesised from the settlements table
  settlement_activities AS (
    SELECT
      s.id           AS act_id,
      CASE
        WHEN LOWER(COALESCE(s.notes, '')) LIKE 'reversal of%'
          OR LOWER(COALESCE(s.notes, '')) LIKE 'reversed%'
        THEN 'settlement_deleted'
        ELSE 'settlement_created'
      END            AS act_type,
      s.from_user_id AS act_user_id,
      fu.name        AS act_user_name,
      s.id           AS act_target_id,
      s.group_id     AS act_group_id,
      g.name         AS act_group_name,
      CASE
        WHEN LOWER(COALESCE(s.notes, '')) LIKE 'reversal of%'
          OR LOWER(COALESCE(s.notes, '')) LIKE 'reversed%'
        THEN 'Deleted: ' ||
             CASE WHEN s.from_user_id = app_user_id THEN 'You' ELSE COALESCE(fu.name, 'Someone') END
             || ' paid ' ||
             CASE WHEN s.to_user_id   = app_user_id THEN 'You' ELSE COALESCE(tu.name, 'Someone') END
        ELSE
             CASE WHEN s.from_user_id = app_user_id THEN 'You' ELSE COALESCE(fu.name, 'Someone') END
             || ' paid ' ||
             CASE WHEN s.to_user_id   = app_user_id THEN 'You' ELSE COALESCE(tu.name, 'Someone') END
      END            AS act_description,
      s.amount       AS act_amount,
      NULL::text     AS act_metadata,
      s.created_at   AS act_created_at
    FROM public.settlements s
    JOIN public.users fu ON fu.id = s.from_user_id
    JOIN public.users tu ON tu.id = s.to_user_id
    LEFT JOIN public.groups g ON g.id = s.group_id
    WHERE s.from_user_id = app_user_id
       OR s.to_user_id   = app_user_id
  ),

  -- Combined feed (column names are the act_* aliases from above)
  combined AS (
    SELECT * FROM db_activities
    UNION ALL
    SELECT * FROM settlement_activities
  ),

  -- Optional search filter using unambiguous act_* column names
  filtered AS (
    SELECT *
      FROM combined c
     WHERE search_term = ''
        OR c.act_description ILIKE '%' || search_term || '%'
        OR c.act_group_name  ILIKE '%' || search_term || '%'
        OR c.act_user_name   ILIKE '%' || search_term || '%'
  )

  -- Final projection maps act_* back to the RETURNS TABLE column names
  SELECT
    f.act_id,
    f.act_type,
    f.act_user_id,
    f.act_user_name,
    f.act_target_id,
    f.act_group_id,
    f.act_group_name,
    f.act_description,
    f.act_amount,
    f.act_metadata,
    f.act_created_at
  FROM filtered f
  ORDER BY f.act_created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- Lock down execution: only authenticated users may call this function
REVOKE ALL ON FUNCTION public.get_user_activities(integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_activities(integer, integer, text) TO authenticated;

-- Supporting indexes (CREATE IF NOT EXISTS is idempotent)
CREATE INDEX IF NOT EXISTS idx_activities_user_id
  ON public.activities (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_group_id
  ON public.activities (group_id, created_at DESC)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_target_id
  ON public.activities (target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_type
  ON public.activities (type);

CREATE INDEX IF NOT EXISTS idx_settlements_participants
  ON public.settlements (from_user_id, to_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlements_created_at
  ON public.settlements (created_at DESC);
