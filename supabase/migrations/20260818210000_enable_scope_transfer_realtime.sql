-- Allow remote clients to invalidate balance projections when a transfer is
-- committed in another device session.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'settlement_scope_transfers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.settlement_scope_transfers;
  END IF;
END;
$$;
