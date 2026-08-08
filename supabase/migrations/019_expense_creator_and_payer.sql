-- Allow a signed-in user to record an expense paid by another participant.
-- `created_by` is the immutable actor; `paid_by` remains the balance payer.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);

UPDATE public.expenses
SET created_by = paid_by
WHERE created_by IS NULL;

ALTER TABLE public.expenses
  ALTER COLUMN created_by SET NOT NULL;

CREATE OR REPLACE FUNCTION private.prevent_expense_creator_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Expense creator cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_expense_creator_change ON public.expenses;
CREATE TRIGGER prevent_expense_creator_change
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION private.prevent_expense_creator_change();

CREATE OR REPLACE FUNCTION private.is_expense_participant(target_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.can_act_as_user(target_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.user_id::text = target_user_id AND private.can_act_as_user(f.friend_id::text))
          OR (f.friend_id::text = target_user_id AND private.can_act_as_user(f.user_id::text)))
    )
$$;

DROP POLICY IF EXISTS "expenses_insert_payer_authenticated" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_payer_authenticated" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_payer_authenticated" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert_authenticated" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_authenticated" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_authenticated" ON public.expenses;
DROP POLICY IF EXISTS "expense_splits_insert_payer_authenticated" ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits_update_payer_authenticated" ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits_delete_payer_authenticated" ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits_insert_authenticated" ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits_update_authenticated" ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits_delete_authenticated" ON public.expense_splits;

CREATE POLICY "expenses_insert_creator_authenticated"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  private.can_act_as_user(created_by::text)
  AND (private.is_expense_participant(paid_by::text) OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id AND gm.user_id = expenses.paid_by
  ))
  AND (group_id IS NULL OR private.is_group_member(group_id::text))
);

CREATE POLICY "expenses_update_creator_authenticated"
ON public.expenses FOR UPDATE TO authenticated
USING (
  private.can_act_as_user(created_by::text)
  OR private.can_act_as_user(paid_by::text)
)
WITH CHECK (
  (private.can_act_as_user(created_by::text) OR private.can_act_as_user(paid_by::text))
  AND (private.is_expense_participant(paid_by::text) OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id AND gm.user_id = expenses.paid_by
  ))
  AND (group_id IS NULL OR private.is_group_member(group_id::text))
);

CREATE POLICY "expenses_delete_creator_authenticated"
ON public.expenses FOR DELETE TO authenticated
USING (
  private.can_act_as_user(created_by::text)
  OR private.can_act_as_user(paid_by::text)
);

CREATE POLICY "expense_splits_insert_creator_authenticated"
ON public.expense_splits FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.expenses e
  WHERE e.id = expense_splits.expense_id
    AND (private.can_act_as_user(e.created_by::text) OR private.can_act_as_user(e.paid_by::text))
));

CREATE POLICY "expense_splits_update_creator_authenticated"
ON public.expense_splits FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.expenses e
  WHERE e.id = expense_splits.expense_id
    AND (private.can_act_as_user(e.created_by::text) OR private.can_act_as_user(e.paid_by::text))
));

CREATE POLICY "expense_splits_delete_creator_authenticated"
ON public.expense_splits FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.expenses e
  WHERE e.id = expense_splits.expense_id
    AND (private.can_act_as_user(e.created_by::text) OR private.can_act_as_user(e.paid_by::text))
));
