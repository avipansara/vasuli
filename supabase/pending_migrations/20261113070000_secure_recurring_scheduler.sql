-- Keep the service credential out of pg_net; the nonce only authorizes one
-- bounded scheduler run and expires if the request is delayed.
CREATE TABLE private.recurring_worker_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  worker_url text NOT NULL CHECK (worker_url ~ '^https://[^/[:space:]]+/functions/v1/process-recurring-expenses$')
);
CREATE TABLE private.recurring_worker_wakeups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX recurring_worker_wakeups_created_at_idx ON private.recurring_worker_wakeups(created_at);
REVOKE ALL ON private.recurring_worker_config, private.recurring_worker_wakeups FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.request_recurring_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off AS $$
DECLARE target_url text; wakeup_id uuid;
BEGIN
  SELECT worker_url INTO target_url FROM private.recurring_worker_config WHERE singleton = true;
  IF target_url IS NULL THEN RAISE EXCEPTION 'Recurring worker URL is not configured'; END IF;
  DELETE FROM private.recurring_worker_wakeups WHERE id IN (
    SELECT id FROM private.recurring_worker_wakeups WHERE created_at < clock_timestamp() - interval '1 day'
    ORDER BY created_at LIMIT 100
  );
  INSERT INTO private.recurring_worker_wakeups DEFAULT VALUES RETURNING id INTO wakeup_id;
  PERFORM net.http_post(
    url := target_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('wakeupId', wakeup_id),
    timeout_milliseconds := 30000
  );
END;
$$;
REVOKE ALL ON FUNCTION private.request_recurring_worker() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_recurring_worker_wakeup(p_wakeup_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off AS $$
DECLARE consumed uuid;
BEGIN
  PERFORM private.require_recurring_worker();
  DELETE FROM private.recurring_worker_wakeups WHERE id = p_wakeup_id
    AND created_at >= clock_timestamp() - interval '5 minutes' RETURNING id INTO consumed;
  RETURN consumed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_recurring_worker_wakeup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_recurring_worker_wakeup(uuid) TO service_role;

-- Commit the ticket and delivery result together so accepted notifications
-- enter the existing receipt checker before their outbox row is marked sent.
CREATE OR REPLACE FUNCTION public.finish_recurring_push_with_receipt(
  p_kind text, p_delivery_id uuid, p_status text, p_token text DEFAULT NULL,
  p_receipt_id text DEFAULT NULL, p_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off AS $$
DECLARE recipient uuid; notice_type text;
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_kind NOT IN ('occurrence', 'rule') OR p_kind IS NULL OR p_status NOT IN ('sent', 'skipped', 'failed') OR p_status IS NULL
     OR (p_error IS NOT NULL AND p_error !~ '^[A-Za-z0-9_]{1,80}$') THEN RAISE EXCEPTION 'Invalid delivery outcome'; END IF;
  IF p_kind = 'occurrence' THEN
    SELECT o.recipient_id, 'expense_added' INTO recipient, notice_type
      FROM public.recurring_expense_occurrence_outbox o
      WHERE o.id = p_delivery_id AND o.delivered_at IS NULL AND o.claimed_until > clock_timestamp() FOR UPDATE;
  ELSE
    SELECT o.recipient_id, CASE WHEN o.event_type = 'rule_created' THEN 'recurring_rule_created' ELSE 'recurring_rule_updated' END
      INTO recipient, notice_type FROM public.recurring_expense_rule_notification_outbox o
      WHERE o.id = p_delivery_id AND o.delivered_at IS NULL AND o.claimed_until > clock_timestamp() FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring delivery not claimed'; END IF;
  IF p_status = 'sent' THEN
    IF p_token IS NULL OR p_receipt_id IS NULL OR length(p_receipt_id) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Missing push ticket'; END IF;
    INSERT INTO public.push_receipt_checks(receipt_id, user_id, token_snapshot, notification_type)
      VALUES (p_receipt_id, recipient, p_token, notice_type) ON CONFLICT DO NOTHING;
  ELSIF p_status = 'skipped' AND p_error = 'DeviceNotRegistered' AND p_token IS NOT NULL THEN
    UPDATE public.users SET push_token = NULL WHERE id = recipient AND push_token = p_token;
  END IF;
  IF p_kind = 'occurrence' THEN
    PERFORM public.finish_recurring_expense_push_delivery(p_delivery_id, p_status, p_error);
  ELSE
    PERFORM public.finish_recurring_expense_rule_notification(p_delivery_id, p_status, p_error);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_recurring_push_with_receipt(text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_recurring_push_with_receipt(text, uuid, text, text, text, text) TO service_role;
