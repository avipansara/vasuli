-- Temporary diagnostic RPC for strict RLS debugging. It returns only the caller's
-- auth context and boolean policy checks for the supplied app user/group IDs.

CREATE OR REPLACE FUNCTION public.debug_expense_rls_context(
  target_paid_by text,
  target_group_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT jsonb_build_object(
    'auth_uid', (SELECT auth.uid())::text,
    'jwt_email', lower(btrim((SELECT auth.jwt() ->> 'email'))),
    'current_app_user_id', private.current_app_user_id(),
    'current_app_user_email', private.current_app_user_email(),
    'target_paid_by', target_paid_by,
    'target_group_id', target_group_id,
    'can_act_as_paid_by', private.can_act_as_user(target_paid_by),
    'is_group_member', CASE
      WHEN target_group_id IS NULL THEN NULL
      ELSE private.is_group_member(target_group_id)
    END
  )
$$;

REVOKE ALL ON FUNCTION public.debug_expense_rls_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_expense_rls_context(text, text) TO authenticated;
