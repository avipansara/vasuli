-- A wake-up carries no server credential. The one-use nonce can only start a
-- bounded worker run; the outbox remains the durable source of truth.
CREATE TABLE private.push_wakeup_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  worker_url text NOT NULL CHECK (worker_url ~ '^https://[^/[:space:]]+/functions/v1/process-push-receipts$')
);
CREATE TABLE private.push_wakeups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  check_receipts boolean NOT NULL DEFAULT false
);
CREATE INDEX push_wakeups_created_at_idx ON private.push_wakeups(created_at);
REVOKE ALL ON private.push_wakeup_config, private.push_wakeups FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.request_push_worker(p_check_receipts boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off AS $$
DECLARE target_url text; wakeup_id uuid;
BEGIN
  SELECT worker_url INTO target_url FROM private.push_wakeup_config WHERE singleton = true;
  IF target_url IS NULL THEN RETURN; END IF;

  DELETE FROM private.push_wakeups WHERE id IN (
    SELECT id FROM private.push_wakeups WHERE created_at < clock_timestamp() - interval '1 day'
    ORDER BY created_at LIMIT 100
  );
  INSERT INTO private.push_wakeups(check_receipts) VALUES (COALESCE(p_check_receipts, false)) RETURNING id INTO wakeup_id;
  PERFORM net.http_post(
    url := target_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('wakeupId', wakeup_id),
    timeout_milliseconds := 5000
  );
  RETURN;
EXCEPTION WHEN OTHERS THEN
  -- The scheduled worker will retry if the wake-up cannot be queued.
  RAISE WARNING 'Push worker wake-up could not be queued; notifications remain in the outbox';
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION private.request_push_worker(boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.wake_push_notification_worker()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM new_push_deliveries) THEN
    PERFORM private.request_push_worker(false);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER wake_push_notification_worker AFTER INSERT ON public.push_notification_outbox
  REFERENCING NEW TABLE AS new_push_deliveries FOR EACH STATEMENT
  EXECUTE FUNCTION private.wake_push_notification_worker();

CREATE OR REPLACE FUNCTION public.consume_push_wakeup(p_wakeup_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off AS $$
DECLARE check_receipts boolean;
BEGIN
  PERFORM private.require_recurring_worker();
  DELETE FROM private.push_wakeups WHERE id = p_wakeup_id
    AND created_at >= clock_timestamp() - interval '5 minutes' RETURNING push_wakeups.check_receipts INTO check_receipts;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN CASE WHEN check_receipts THEN 'scheduled' ELSE 'delivery' END;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_push_wakeup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_push_wakeup(uuid) TO service_role;
