-- The legacy combined-settlement overload bypasses settlement_operations and
-- reversal history. It is no longer used by the app and must not be exposed
-- through the Supabase API.

DROP FUNCTION IF EXISTS public.commit_combined_settlement(
  UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB
);

REVOKE EXECUTE ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC)
  FROM anon;

