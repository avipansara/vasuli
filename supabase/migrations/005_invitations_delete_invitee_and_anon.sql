-- Allow invitees to DELETE invitation rows (e.g. after unfriend, clear A→B invite so A can re-invite).
-- Migration 002 only allowed inviter DELETE; OTP/anon had no DELETE at all.
--
-- Idempotent.

DROP POLICY IF EXISTS "invitations_delete_as_invitee" ON public.invitations;

CREATE POLICY "invitations_delete_as_invitee"
  ON public.invitations
  FOR DELETE
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
  );

DROP POLICY IF EXISTS "invitations_anon_delete" ON public.invitations;

CREATE POLICY "invitations_anon_delete"
  ON public.invitations
  FOR DELETE
  TO anon
  USING (true);
