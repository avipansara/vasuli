-- Durable server-side retry records for PostHog person deletion. The table
-- has no client grants; only the Edge Function service role can write it.
CREATE TABLE IF NOT EXISTS public.analytics_deletion_retries (
  distinct_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text
);

ALTER TABLE public.analytics_deletion_retries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.analytics_deletion_retries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analytics_deletion_retries TO service_role;

CREATE INDEX IF NOT EXISTS analytics_deletion_retries_last_attempt_idx
  ON public.analytics_deletion_retries (last_attempt_at);
