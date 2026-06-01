-- Remove anon table privileges for app data. Authenticated access is granted
-- explicitly and still filtered by RLS policies.

REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.groups FROM anon;
REVOKE ALL ON TABLE public.group_members FROM anon;
REVOKE ALL ON TABLE public.expenses FROM anon;
REVOKE ALL ON TABLE public.expense_splits FROM anon;
REVOKE ALL ON TABLE public.settlements FROM anon;
REVOKE ALL ON TABLE public.friendships FROM anon;
REVOKE ALL ON TABLE public.invitations FROM anon;
REVOKE ALL ON TABLE public.activities FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expense_splits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.friendships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activities TO authenticated;
