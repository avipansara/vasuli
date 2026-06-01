-- Backfill existing app profiles that signed in with Supabase Auth before the
-- auth_user_id bridge was fully active. This keeps public.users.id stable while
-- allowing RLS helpers to resolve auth.uid() to the app-domain user ID.

WITH candidates AS (
  SELECT
    u.id AS user_id,
    au.id AS auth_user_id,
    row_number() OVER (
      PARTITION BY au.id
      ORDER BY u.created_at ASC NULLS LAST, u.id
    ) AS match_rank
  FROM public.users u
  JOIN auth.users au
    ON lower(btrim(u.email)) = lower(btrim(au.email))
  WHERE u.auth_user_id IS NULL
    AND u.email IS NOT NULL
    AND au.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.users linked
      WHERE linked.auth_user_id = au.id
    )
)
UPDATE public.users u
SET auth_user_id = candidates.auth_user_id
FROM candidates
WHERE u.id = candidates.user_id
  AND candidates.match_rank = 1;
