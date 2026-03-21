-- OTP app uses the Supabase anon key without a Supabase Auth JWT (session in AsyncStorage).
-- Migration 002 policies are TO authenticated only, so anon role had no SELECT/INSERT/UPDATE on
-- invitations → received list and accept/decline could fail silently (0 rows).
-- See supabase/docs/RLS_INVITATIONS.md — Path A (JWT) is tighter; this is Path B.
--
-- If you already have permissive anon policies on invitations, this is a no-op (duplicate names).

DROP POLICY IF EXISTS "invitations_anon_select" ON public.invitations;
DROP POLICY IF EXISTS "invitations_anon_insert" ON public.invitations;
DROP POLICY IF EXISTS "invitations_anon_update" ON public.invitations;

CREATE POLICY "invitations_anon_select"
  ON public.invitations
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "invitations_anon_insert"
  ON public.invitations
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "invitations_anon_update"
  ON public.invitations
  FOR UPDATE
  TO anon
  USING (true);
