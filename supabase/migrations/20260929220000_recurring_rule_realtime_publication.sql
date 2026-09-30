-- Let owners refresh recurring rule screens when another session changes a
-- rule. Row Level Security remains in force, so shared participants use the
-- existing focus-refetch path for RPC-visible schedule changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'recurring_expense_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recurring_expense_rules;
  END IF;
END;
$$;
