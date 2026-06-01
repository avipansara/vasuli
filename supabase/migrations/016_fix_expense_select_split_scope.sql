-- Fix column scoping in the split-participant branch of the direct expense
-- SELECT policy. The payer and group checks are unchanged.

DROP POLICY IF EXISTS "expenses_select_authenticated" ON public.expenses;

CREATE POLICY "expenses_select_authenticated"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  private.can_act_as_user(paid_by::text)
  OR (
    group_id IS NOT NULL
    AND private.is_group_member(group_id::text)
  )
  OR EXISTS (
    SELECT 1
    FROM public.expense_splits es
    WHERE es.expense_id::text = expenses.id::text
      AND private.can_act_as_user(es.user_id::text)
  )
);
