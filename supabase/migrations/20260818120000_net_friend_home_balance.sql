-- Make the Home friend-card balance use the same net relationship total as
-- Friend detail when all outstanding scopes share one currency.
--
-- settleable_total remains the authoritative action guard: opposite direct
-- and Group directions still cannot be settled as one transaction.

ALTER FUNCTION public.get_friend_home_relationships()
  RENAME TO get_friend_home_relationships_legacy;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT
    home.id,
    home.name,
    home.email,
    home.phone,
    home.avatar,
    home.push_token,
    home.is_active,
    home.created_at,
    CASE
      WHEN jsonb_array_length(home.relationship -> 'totalsByCurrency') = 1
        THEN (home.relationship -> 'totalsByCurrency' -> 0 ->> 'amount')::numeric
      ELSE home.balance
    END AS balance,
    home.recent_expenses,
    home.relationship
  FROM public.get_friend_home_relationships_legacy() AS home;
$$;

REVOKE ALL ON FUNCTION public.get_friend_home_relationships() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friend_home_relationships() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_friend_home_relationships() TO authenticated;
