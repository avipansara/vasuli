-- Avoid recursive RLS evaluation when an expense is visible because the
-- authenticated user appears in its expense_splits rows.
--
-- The expenses SELECT policy must inspect expense_splits, while the
-- expense_splits SELECT policy calls can_view_expense(), which inspects
-- expenses. This helper performs only the participant lookup as the
-- security-definer owner with row security disabled for the nested lookup.

CREATE OR REPLACE FUNCTION private.has_expense_split_participant(target_expense_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_splits es
    WHERE es.expense_id::text = target_expense_id
      AND private.can_act_as_user(es.user_id::text)
  )
$$;

REVOKE ALL ON FUNCTION private.has_expense_split_participant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_expense_split_participant(text) TO authenticated;

DROP POLICY IF EXISTS "expenses_select_authenticated" ON public.expenses;

CREATE POLICY "expenses_select_authenticated"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  private.can_act_as_user(created_by::text)
  OR private.can_act_as_user(paid_by::text)
  OR (
    group_id IS NOT NULL
    AND private.is_group_member(group_id::text)
  )
  OR private.has_expense_split_participant(id::text)
);
