-- Invitations RLS: restrict by inviter / invitee using auth.uid().
--
-- PREREQUISITE: Supabase Auth JWT where auth.uid() matches public.users.id (same UUID or same text).
-- See supabase/docs/RLS_INVITATIONS.md — do NOT apply while the app uses only the anon key.
--
-- Idempotent: drops both legacy and new policy names, then recreates.
--
-- Aligns with Supabase RLS guidance: https://supabase.com/docs/guides/database/postgres/row-level-security
-- - Use (select auth.uid()) in policies for better performance (initPlan / per-statement).
-- - Explicit IS NOT NULL so intent matches "authenticated" requests (uid null => false).
-- - UPDATE requires a matching SELECT policy (see doc).

-- Legacy names (schema-otp-auth.sql, schema-fresh.sql)
DROP POLICY IF EXISTS "Users can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can update invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can view their invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can update received invitations" ON public.invitations;

-- This migration’s policy names (re-run safe)
DROP POLICY IF EXISTS "invitations_select_inviter_or_invitee" ON public.invitations;
DROP POLICY IF EXISTS "invitations_insert_as_inviter" ON public.invitations;
DROP POLICY IF EXISTS "invitations_update_as_invitee" ON public.invitations;
DROP POLICY IF EXISTS "invitations_update_as_inviter" ON public.invitations;
DROP POLICY IF EXISTS "invitations_delete_as_inviter" ON public.invitations;

-- Compare auth.uid() to users.id whether id is uuid or text
-- SELECT: inviter sees sent; invitee sees rows addressed to their email
CREATE POLICY "invitations_select_inviter_or_invitee"
  ON public.invitations
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND (
      inviter_id::text = (select auth.uid())::text
      OR (
        invitee_email IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.users u
          WHERE u.id::text = (select auth.uid())::text
            AND u.email IS NOT NULL
            AND lower(btrim(u.email)) = lower(btrim(invitee_email))
        )
      )
    )
  );

-- INSERT: only as the inviter
CREATE POLICY "invitations_insert_as_inviter"
  ON public.invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND inviter_id::text = (select auth.uid())::text
  );

-- UPDATE: invitee (accept/decline) or inviter (cancel/resend/extend expiry)
CREATE POLICY "invitations_update_as_invitee"
  ON public.invitations
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND invitee_email IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id::text = (select auth.uid())::text
        AND u.email IS NOT NULL
        AND lower(btrim(u.email)) = lower(btrim(invitee_email))
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND invitee_email IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id::text = (select auth.uid())::text
        AND u.email IS NOT NULL
        AND lower(btrim(u.email)) = lower(btrim(invitee_email))
    )
  );

CREATE POLICY "invitations_update_as_inviter"
  ON public.invitations
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND inviter_id::text = (select auth.uid())::text
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND inviter_id::text = (select auth.uid())::text
  );

-- DELETE: inviter cancels invite
CREATE POLICY "invitations_delete_as_inviter"
  ON public.invitations
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND inviter_id::text = (select auth.uid())::text
  );
