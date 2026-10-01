-- Durable follow-up delivery for recurring occurrences. Posting stays atomic;
-- activity and push delivery can retry independently after it commits.

ALTER TABLE public.activities
  ADD COLUMN recurring_occurrence_id uuid
    REFERENCES public.expenses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT activities_recurring_occurrence_unique
    UNIQUE (recurring_occurrence_id);

ALTER TABLE public.recurring_expense_occurrence_outbox
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'skipped', 'failed')),
  ADD COLUMN claimed_until timestamptz;

ALTER TABLE public.recurring_expense_rule_notification_outbox
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'skipped', 'failed')),
  ADD COLUMN claimed_until timestamptz;

CREATE INDEX recurring_occurrence_outbox_retry_idx
  ON public.recurring_expense_occurrence_outbox(created_at, id)
  WHERE delivered_at IS NULL AND attempt_count < 10;

CREATE INDEX recurring_rule_notification_retry_idx
  ON public.recurring_expense_rule_notification_outbox(created_at, id)
  WHERE delivered_at IS NULL AND attempt_count < 10;

CREATE TABLE public.recurring_expense_activity_outbox (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id uuid NOT NULL UNIQUE REFERENCES public.expenses(id) ON DELETE RESTRICT,
  rule_id uuid NOT NULL REFERENCES public.recurring_expense_rules(id) ON DELETE RESTRICT,
  scheduled_for date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  claimed_until timestamptz
);

CREATE INDEX recurring_expense_activity_outbox_pending_idx
  ON public.recurring_expense_activity_outbox(created_at, id)
  WHERE delivered_at IS NULL;

ALTER TABLE public.recurring_expense_activity_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_activity_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.recurring_expense_activity_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.recurring_expense_activity_outbox TO service_role;

CREATE OR REPLACE FUNCTION private.enqueue_recurring_expense_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.recurring_expense_activity_outbox(expense_id, rule_id, scheduled_for)
  VALUES (NEW.expense_id, NEW.rule_id, NEW.scheduled_for)
  ON CONFLICT (expense_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recurring_occurrence_activity_outbox_enqueue
  AFTER INSERT ON public.recurring_expense_occurrence_outbox
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_recurring_expense_activity();

CREATE OR REPLACE FUNCTION private.require_recurring_worker()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, auth, pg_temp
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
    AND (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted recurring expense worker required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_recurring_expense_rules(p_limit integer DEFAULT 50)
RETURNS TABLE(rule_id uuid, expected_due_on date)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 100' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT r.id, r.next_due_on
  FROM public.recurring_expense_rules r
  WHERE r.status = 'active'
    AND r.next_due_on IS NOT NULL
    AND r.next_due_on <= (clock_timestamp() AT TIME ZONE r.time_zone)::date
    AND clock_timestamp() >= ((r.next_due_on::timestamp + time '09:00') AT TIME ZONE r.time_zone)
  ORDER BY r.next_due_on, r.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.deliver_recurring_expense_activities(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
DECLARE
  outbox_row public.recurring_expense_activity_outbox%ROWTYPE;
  occurrence public.expenses%ROWTYPE;
  rule_row public.recurring_expense_rules%ROWTYPE;
  owner_name text;
  group_label text;
  delivered integer := 0;
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  FOR outbox_row IN
    SELECT o.* FROM public.recurring_expense_activity_outbox o
    WHERE o.delivered_at IS NULL
    ORDER BY o.created_at, o.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT * INTO occurrence FROM public.expenses WHERE id = outbox_row.expense_id;
      SELECT * INTO rule_row FROM public.recurring_expense_rules WHERE id = outbox_row.rule_id;
      SELECT u.name INTO owner_name FROM public.users u WHERE u.id = rule_row.owner_id;
      IF occurrence.id IS NULL OR rule_row.id IS NULL OR owner_name IS NULL THEN
        RAISE EXCEPTION 'Recurring occurrence activity references missing data.';
      END IF;
      group_label := NULL;
      IF occurrence.group_id IS NOT NULL THEN
        SELECT g.name INTO group_label FROM public.groups g WHERE g.id = occurrence.group_id;
      END IF;

      INSERT INTO public.activities(
        type, user_id, user_name, target_id, group_id, group_name,
        description, amount, metadata, recurring_occurrence_id
      ) VALUES (
        'expense_created', rule_row.owner_id, owner_name, occurrence.id,
        occurrence.group_id, group_label, occurrence.description, occurrence.amount,
        jsonb_build_object('recurring', true, 'scheduled_for', outbox_row.scheduled_for),
        occurrence.id
      ) ON CONFLICT (recurring_occurrence_id) DO NOTHING;

      UPDATE public.recurring_expense_activity_outbox
      SET delivered_at = clock_timestamp(), attempt_count = attempt_count + 1,
          last_error = NULL, claimed_until = NULL
      WHERE id = outbox_row.id;
      delivered := delivered + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.recurring_expense_activity_outbox
      SET attempt_count = attempt_count + 1, last_error = left(SQLERRM, 500),
          claimed_until = NULL
      WHERE id = outbox_row.id;
    END;
  END LOOP;
  RETURN delivered;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_recurring_expense_push_deliveries(p_limit integer DEFAULT 50)
RETURNS TABLE(
  delivery_id uuid,
  recipient_id uuid,
  push_token text,
  recipient_name text,
  expense_id uuid,
  description text,
  amount numeric,
  currency text,
  group_id uuid,
  group_name text,
  attempt_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 100' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.recurring_expense_occurrence_outbox o
    WHERE o.delivered_at IS NULL AND o.attempt_count < 10
      AND (o.claimed_until IS NULL OR o.claimed_until < clock_timestamp())
    ORDER BY o.created_at, o.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.recurring_expense_occurrence_outbox o
    SET claimed_until = clock_timestamp() + interval '5 minutes'
    FROM candidates c WHERE o.id = c.id
    RETURNING o.id, o.recipient_id, o.expense_id, o.attempt_count
  )
  SELECT c.id, c.recipient_id, u.push_token, u.name, e.id,
         e.description, e.amount, e.currency, e.group_id, g.name, c.attempt_count
  FROM claimed c
  JOIN public.users u ON u.id = c.recipient_id
  JOIN public.expenses e ON e.id = c.expense_id
  LEFT JOIN public.groups g ON g.id = e.group_id
  ORDER BY c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_recurring_expense_push_delivery(
  p_delivery_id uuid,
  p_status text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_status NOT IN ('sent', 'skipped', 'failed') THEN
    RAISE EXCEPTION 'Invalid push delivery status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.recurring_expense_occurrence_outbox
  SET attempt_count = attempt_count + 1,
      delivery_status = p_status,
      delivered_at = CASE WHEN p_status IN ('sent', 'skipped') THEN clock_timestamp() ELSE NULL END,
      claimed_until = NULL,
      last_error = CASE WHEN p_status = 'failed' THEN left(COALESCE(p_error, 'Push delivery failed'), 500) ELSE NULL END
  WHERE id = p_delivery_id AND delivered_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Push delivery not found or already completed' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_recurring_expense_rule_notifications(p_limit integer DEFAULT 50)
RETURNS TABLE(
  delivery_id uuid,
  rule_id uuid,
  recipient_id uuid,
  push_token text,
  event_type text,
  payload jsonb,
  attempt_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 100' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT n.id FROM public.recurring_expense_rule_notification_outbox n
    WHERE n.delivered_at IS NULL AND n.attempt_count < 10
      AND (n.claimed_until IS NULL OR n.claimed_until < clock_timestamp())
    ORDER BY n.created_at, n.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.recurring_expense_rule_notification_outbox n
    SET claimed_until = clock_timestamp() + interval '5 minutes'
    FROM candidates c WHERE n.id = c.id
    RETURNING n.id, n.rule_id, n.recipient_id, n.event_type, n.payload, n.attempt_count
  )
  SELECT c.id, c.rule_id, c.recipient_id, u.push_token, c.event_type, c.payload, c.attempt_count
  FROM claimed c
  JOIN public.users u ON u.id = c.recipient_id
  ORDER BY c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_recurring_expense_rule_notification(
  p_delivery_id uuid,
  p_status text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_status NOT IN ('sent', 'skipped', 'failed') THEN
    RAISE EXCEPTION 'Invalid rule notification delivery status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.recurring_expense_rule_notification_outbox
  SET attempt_count = attempt_count + 1,
      delivery_status = p_status,
      delivered_at = CASE WHEN p_status IN ('sent', 'skipped') THEN clock_timestamp() ELSE NULL END,
      claimed_until = NULL,
      last_error = CASE WHEN p_status = 'failed' THEN left(COALESCE(p_error, 'Rule notification delivery failed'), 500) ELSE NULL END
  WHERE id = p_delivery_id AND delivered_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rule notification not found or already completed' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_recurring_expense_worker_error(
  p_rule_id uuid,
  p_expected_due_on date,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  PERFORM private.require_recurring_worker();
  UPDATE public.recurring_expense_rules
  SET last_error = left(COALESCE(p_error, 'Recurring expense posting failed'), 500),
      last_error_at = clock_timestamp()
  WHERE id = p_rule_id AND next_due_on = p_expected_due_on AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_recurring_expense_activity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.require_recurring_worker() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_due_recurring_expense_rules(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deliver_recurring_expense_activities(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_recurring_expense_push_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_recurring_expense_push_delivery(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_recurring_expense_rule_notifications(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_recurring_expense_rule_notification(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_recurring_expense_worker_error(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_recurring_expense_rules(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.deliver_recurring_expense_activities(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_recurring_expense_push_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_recurring_expense_push_delivery(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_recurring_expense_rule_notifications(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_recurring_expense_rule_notification(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_recurring_expense_worker_error(uuid, date, text) TO service_role;
