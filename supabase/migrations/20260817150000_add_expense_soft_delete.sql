ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_expenses_active_group_date
  ON public.expenses(group_id, date DESC)
  WHERE deleted_at IS NULL;
