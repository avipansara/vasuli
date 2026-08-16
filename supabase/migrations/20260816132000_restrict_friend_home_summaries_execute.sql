-- Defense in depth: this read model requires an authenticated session.
-- Explicitly deny anonymous execution even if role grants/default privileges
-- change independently of the function migration.

REVOKE EXECUTE ON FUNCTION public.get_friend_home_summaries() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_friend_home_summaries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friend_home_summaries() TO authenticated;
