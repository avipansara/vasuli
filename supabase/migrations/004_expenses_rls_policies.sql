-- Expenses + expense_splits RLS: strict rules for authenticated (JWT), permissive anon for OTP-only clients.
-- See supabase/docs/RLS_EXPENSES.md

-- Drop legacy / permissive policies (initial schema + schema-otp-auth names)
DROP POLICY IF EXISTS "Allow all for expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow all for expense_splits" ON public.expense_splits;

DROP POLICY IF EXISTS "Group members can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Expense creator can update" ON public.expenses;
DROP POLICY IF EXISTS "Expense creator can delete" ON public.expenses;

DROP POLICY IF EXISTS "Users can view expense splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Users can create expense splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Users can update expense splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Users can delete expense splits" ON public.expense_splits;

-- ---------------------------------------------------------------------------
-- authenticated: enforce payer + group membership (Path A — Supabase JWT)
-- ---------------------------------------------------------------------------

CREATE POLICY "expenses_select_authenticated"
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (
    (
      group_id IS NULL
      AND (
        paid_by::text = (SELECT auth.uid())::text
        OR EXISTS (
          SELECT 1
          FROM public.expense_splits es
          WHERE es.expense_id = expenses.id
            AND es.user_id::text = (SELECT auth.uid())::text
        )
      )
    )
    OR (
      group_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = expenses.group_id
          AND gm.user_id::text = (SELECT auth.uid())::text
      )
    )
  );

CREATE POLICY "expenses_insert_authenticated"
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    paid_by::text = (SELECT auth.uid())::text
    AND (
      group_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = expenses.group_id
          AND gm.user_id::text = (SELECT auth.uid())::text
      )
    )
  );

CREATE POLICY "expenses_update_authenticated"
  ON public.expenses
  FOR UPDATE
  TO authenticated
  USING (paid_by::text = (SELECT auth.uid())::text)
  WITH CHECK (
    paid_by::text = (SELECT auth.uid())::text
    AND (
      group_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = expenses.group_id
          AND gm.user_id::text = (SELECT auth.uid())::text
      )
    )
  );

CREATE POLICY "expenses_delete_authenticated"
  ON public.expenses
  FOR DELETE
  TO authenticated
  USING (paid_by::text = (SELECT auth.uid())::text);

CREATE POLICY "expense_splits_select_authenticated"
  ON public.expense_splits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_splits.expense_id
        AND (
          (
            e.group_id IS NULL
            AND (
              e.paid_by::text = (SELECT auth.uid())::text
              OR EXISTS (
                SELECT 1
                FROM public.expense_splits es
                WHERE es.expense_id = e.id
                  AND es.user_id::text = (SELECT auth.uid())::text
              )
            )
          )
          OR (
            e.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.group_members gm
              WHERE gm.group_id = e.group_id
                AND gm.user_id::text = (SELECT auth.uid())::text
            )
          )
        )
    )
  );

CREATE POLICY "expense_splits_insert_authenticated"
  ON public.expense_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_splits.expense_id
        AND e.paid_by::text = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "expense_splits_update_authenticated"
  ON public.expense_splits
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_splits.expense_id
        AND e.paid_by::text = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_splits.expense_id
        AND e.paid_by::text = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "expense_splits_delete_authenticated"
  ON public.expense_splits
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_splits.expense_id
        AND e.paid_by::text = (SELECT auth.uid())::text
    )
  );

-- ---------------------------------------------------------------------------
-- anon: permissive so OTP + anon key keeps working (Path B). Remove when JWT is enforced.
-- ---------------------------------------------------------------------------

CREATE POLICY "expenses_all_anon"
  ON public.expenses
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "expense_splits_all_anon"
  ON public.expense_splits
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
