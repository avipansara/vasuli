CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Feedback contains user-provided text and optional images. Only service-role
-- functions and project administrators may read it.
CREATE TABLE public.feedback_submissions (
  id uuid PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('problem', 'idea', 'question')),
  message text NOT NULL CHECK (char_length(trim(message)) BETWEEN 1 AND 5000),
  reply_email text CHECK (reply_email IS NULL OR char_length(reply_email) <= 254),
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  app_version text NOT NULL CHECK (char_length(app_version) BETWEEN 1 AND 80),
  screenshot_base64 text CHECK (screenshot_base64 IS NULL OR length(screenshot_base64) <= 2800000),
  screenshot_type text CHECK (screenshot_type IS NULL OR screenshot_type IN ('image/jpeg', 'image/png')),
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  CHECK ((screenshot_base64 IS NULL) = (screenshot_type IS NULL))
);
ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_submissions TO service_role;
CREATE INDEX feedback_created_at_idx ON public.feedback_submissions (created_at);
CREATE INDEX feedback_pending_notice_idx ON public.feedback_submissions (created_at) WHERE notified_at IS NULL;

-- The service role supplies the identity only for abuse prevention; it is not
-- stored with the feedback and expires after an hour.
CREATE TABLE private.feedback_rate_limits (user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON private.feedback_rate_limits FROM PUBLIC, anon, authenticated;
CREATE INDEX feedback_rate_limits_user_created_idx ON private.feedback_rate_limits (user_id, created_at);
CREATE OR REPLACE FUNCTION public.reserve_feedback_submission(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  DELETE FROM private.feedback_rate_limits WHERE created_at < now() - interval '1 hour';
  IF (SELECT count(*) FROM private.feedback_rate_limits WHERE user_id = p_user_id) >= 10 THEN RETURN false; END IF;
  INSERT INTO private.feedback_rate_limits(user_id) VALUES (p_user_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_feedback_submission(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_feedback_submission(uuid) TO service_role;

-- Cron removes both the message and its inline screenshot together.
SELECT cron.schedule('feedback-retention', '17 3 * * *', $job$
  DELETE FROM public.feedback_submissions WHERE created_at < now() - interval '1 year';
$job$);
SELECT cron.schedule('feedback-rate-cleanup', '7 * * * *', $job$ DELETE FROM private.feedback_rate_limits WHERE created_at < now() - interval '1 hour'; $job$);

-- One-use wake-ups allow pg_cron to run the worker without putting a service
-- credential into pg_net's request history.
CREATE TABLE private.feedback_worker_config (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), worker_url text NOT NULL CHECK (worker_url ~ '^https://[^/[:space:]]+/functions/v1/feedback-worker$'));
CREATE TABLE private.feedback_worker_wakeups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON private.feedback_worker_config, private.feedback_worker_wakeups FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION private.request_feedback_worker() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_url text; wakeup_id uuid;
BEGIN
  SELECT worker_url INTO target_url FROM private.feedback_worker_config WHERE singleton;
  IF target_url IS NULL THEN RAISE EXCEPTION 'Feedback worker URL is not configured'; END IF;
  DELETE FROM private.feedback_worker_wakeups WHERE created_at < now() - interval '1 day';
  INSERT INTO private.feedback_worker_wakeups DEFAULT VALUES RETURNING id INTO wakeup_id;
  PERFORM net.http_post(url := target_url, headers := jsonb_build_object('Content-Type', 'application/json'), body := jsonb_build_object('wakeupId', wakeup_id), timeout_milliseconds := 30000);
END $$;
REVOKE ALL ON FUNCTION private.request_feedback_worker() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.consume_feedback_worker_wakeup(p_wakeup_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE consumed uuid;
BEGIN
  DELETE FROM private.feedback_worker_wakeups WHERE id = p_wakeup_id AND created_at >= now() - interval '5 minutes' RETURNING id INTO consumed;
  RETURN consumed IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.consume_feedback_worker_wakeup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_feedback_worker_wakeup(uuid) TO service_role;
