-- Strict RLS cutover: app tables now require Supabase Auth JWTs.
-- Existing app-domain user IDs are authorized through public.users.auth_user_id.

DROP POLICY IF EXISTS "users_all_anon" ON public.users;
DROP POLICY IF EXISTS "groups_all_anon" ON public.groups;
DROP POLICY IF EXISTS "group_members_all_anon" ON public.group_members;
DROP POLICY IF EXISTS "expenses_all_anon" ON public.expenses;
DROP POLICY IF EXISTS "expense_splits_all_anon" ON public.expense_splits;
DROP POLICY IF EXISTS "settlements_all_anon" ON public.settlements;
DROP POLICY IF EXISTS "friendships_all_anon" ON public.friendships;
DROP POLICY IF EXISTS "invitations_all_anon" ON public.invitations;
DROP POLICY IF EXISTS "activities_select_anon" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_anon" ON public.activities;
