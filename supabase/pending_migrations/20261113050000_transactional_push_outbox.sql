-- Enqueue notices in the transaction that records the expense splits or settlement.
CREATE TABLE public.push_notification_events (
  event_type text NOT NULL CHECK (event_type IN ('expense_added', 'settlement_created', 'settlement_reversed')),
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (event_type, subject_id)
);
CREATE TABLE public.push_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  subject_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  last_error text,
  FOREIGN KEY (event_type, subject_id) REFERENCES public.push_notification_events(event_type, subject_id),
  UNIQUE(event_type, subject_id, recipient_id)
);
CREATE INDEX push_notification_outbox_pending_idx ON public.push_notification_outbox(created_at, id)
  WHERE delivered_at IS NULL AND attempts < 10;
ALTER TABLE public.push_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_notification_events, public.push_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_notification_events, public.push_notification_outbox TO service_role;

-- A statement-level trigger sees the complete first split insert. Later edits
-- cannot enqueue a second creation event for the same expense.
CREATE OR REPLACE FUNCTION private.enqueue_new_expense_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp SET row_security = off AS $$
DECLARE exp record; marker uuid;
BEGIN
  FOR exp IN SELECT DISTINCT e.id, e.group_id, e.created_by
    FROM new_expense_splits s JOIN public.expenses e ON e.id = s.expense_id
    WHERE e.recurring_rule_id IS NULL AND e.deleted_at IS NULL
  LOOP
    marker := NULL;
    INSERT INTO public.push_notification_events(event_type, subject_id) VALUES ('expense_added', exp.id)
      ON CONFLICT DO NOTHING RETURNING subject_id INTO marker;
    IF marker IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.push_notification_outbox(event_type, subject_id, actor_id, recipient_id, group_id)
    SELECT 'expense_added', exp.id, exp.created_by, recipients.user_id, exp.group_id
    FROM (
      SELECT gm.user_id FROM public.group_members gm WHERE exp.group_id IS NOT NULL AND gm.group_id = exp.group_id
      UNION
      SELECT s.user_id FROM new_expense_splits s WHERE exp.group_id IS NULL AND s.expense_id = exp.id
    ) recipients WHERE recipients.user_id <> exp.created_by
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER enqueue_new_expense_notifications AFTER INSERT ON public.expense_splits
  REFERENCING NEW TABLE AS new_expense_splits FOR EACH STATEMENT EXECUTE FUNCTION private.enqueue_new_expense_notifications();

CREATE OR REPLACE FUNCTION private.enqueue_settlement_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp SET row_security = off AS $$
DECLARE operation_row public.settlement_operations%ROWTYPE; event_name text; subject uuid; actor uuid; recipient uuid;
BEGIN
  IF TG_TABLE_NAME = 'settlement_operations' THEN
    operation_row := NEW;
    IF operation_row.requested_payment_amount <= 0 THEN RETURN NEW; END IF;
    event_name := 'settlement_created'; subject := operation_row.id; actor := operation_row.actor_user_id;
    recipient := operation_row.friend_user_id;
  ELSE
    SELECT * INTO operation_row FROM public.settlement_operations WHERE id = NEW.operation_id;
    event_name := 'settlement_reversed'; subject := NEW.id; actor := NEW.actor_user_id;
    recipient := CASE WHEN actor = operation_row.actor_user_id THEN operation_row.friend_user_id ELSE operation_row.actor_user_id END;
  END IF;
  INSERT INTO public.push_notification_events(event_type, subject_id) VALUES (event_name, subject) ON CONFLICT DO NOTHING;
  INSERT INTO public.push_notification_outbox(event_type, subject_id, actor_id, recipient_id, group_id)
    VALUES (event_name, subject, actor, recipient, operation_row.group_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enqueue_settlement_created AFTER INSERT ON public.settlement_operations
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_settlement_notification();
CREATE TRIGGER enqueue_settlement_reversed AFTER INSERT ON public.settlement_operation_reversals
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_settlement_notification();

CREATE OR REPLACE FUNCTION public.claim_push_notifications(p_limit integer DEFAULT 50)
RETURNS TABLE(delivery_id uuid, event_type text, push_token text, title text, body text, data jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp SET row_security = off AS $$
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
  RETURN QUERY WITH due AS (
    SELECT o.id FROM public.push_notification_outbox o
    WHERE o.delivered_at IS NULL AND o.attempts < 10 AND (o.claimed_until IS NULL OR o.claimed_until < clock_timestamp())
    ORDER BY o.created_at, o.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.push_notification_outbox o SET claimed_until = clock_timestamp() + interval '5 minutes', attempts = o.attempts + 1
      FROM due WHERE o.id = due.id RETURNING o.*
  )
  SELECT c.id, c.event_type, recipient.push_token,
    CASE c.event_type WHEN 'expense_added' THEN 'New expense added' WHEN 'settlement_created' THEN 'Payment recorded' ELSE 'Payment deleted' END,
    CASE c.event_type
      WHEN 'expense_added' THEN CASE WHEN e.id IS NULL THEN actor.name || ' added an expense' ELSE actor.name || ' added "' || e.description || '" for ' || e.currency || ' ' || to_char(e.amount, 'FM999999999990.00') END
      WHEN 'settlement_created' THEN CASE WHEN op.id IS NULL THEN actor.name || ' recorded a payment' ELSE actor.name || ' recorded that ' || COALESCE(payer.name, 'someone') || ' paid ' || op.currency || ' ' || to_char(op.requested_payment_amount, 'FM999999999990.00') || ' to ' || COALESCE(payee.name, 'someone') END
      ELSE actor.name || CASE WHEN op.requested_payment_amount > 0 THEN ' deleted a recorded payment of ' || op.currency || ' ' || to_char(op.requested_payment_amount, 'FM999999999990.00') ELSE ' deleted a settlement' END END,
    CASE WHEN c.event_type = 'expense_added' THEN jsonb_build_object('type', 'expense_added', 'expenseId', c.subject_id, 'groupId', c.group_id)
      ELSE jsonb_build_object('type', c.event_type, 'groupId', c.group_id, 'friendId', c.actor_id) END
  FROM claimed c JOIN public.users actor ON actor.id = c.actor_id JOIN public.users recipient ON recipient.id = c.recipient_id
    LEFT JOIN public.expenses e ON c.event_type = 'expense_added' AND e.id = c.subject_id
    LEFT JOIN public.settlement_operation_reversals rev ON c.event_type = 'settlement_reversed' AND rev.id = c.subject_id
    LEFT JOIN public.settlement_operations op ON op.id = CASE WHEN c.event_type = 'settlement_created' THEN c.subject_id ELSE rev.operation_id END
    LEFT JOIN LATERAL (SELECT s.from_user_id, s.to_user_id FROM public.settlements s
      WHERE s.operation_id = op.id AND (s.notes IS NULL OR s.notes NOT LIKE 'Reversal of settlement operation %')
      ORDER BY s.created_at, s.id LIMIT 1) payment ON true
    LEFT JOIN public.users payer ON payer.id = payment.from_user_id
    LEFT JOIN public.users payee ON payee.id = payment.to_user_id
  ORDER BY c.created_at, c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_push_notification(p_delivery_id uuid, p_status text, p_token text DEFAULT NULL, p_receipt_id text DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp SET row_security = off AS $$
DECLARE row_data public.push_notification_outbox%ROWTYPE;
BEGIN
  PERFORM private.require_recurring_worker();
  IF p_status IS NULL OR p_status NOT IN ('sent', 'skipped', 'failed') OR (p_error IS NOT NULL AND p_error !~ '^[A-Za-z0-9_]{1,80}$') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  SELECT * INTO row_data FROM public.push_notification_outbox WHERE id = p_delivery_id AND delivered_at IS NULL AND claimed_until > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Push delivery not claimed'; END IF;
  IF p_status = 'sent' THEN
    IF p_receipt_id IS NULL OR length(p_receipt_id) NOT BETWEEN 1 AND 128 OR p_token IS NULL THEN RAISE EXCEPTION 'Missing receipt'; END IF;
    INSERT INTO public.push_receipt_checks(receipt_id, user_id, token_snapshot, notification_type)
      VALUES (p_receipt_id, row_data.recipient_id, p_token, row_data.event_type) ON CONFLICT DO NOTHING;
  ELSIF p_error = 'DeviceNotRegistered' AND p_token IS NOT NULL THEN
    UPDATE public.users SET push_token = NULL WHERE id = row_data.recipient_id AND push_token = p_token;
  END IF;
  UPDATE public.push_notification_outbox SET status = p_status,
    delivered_at = CASE WHEN p_status IN ('sent', 'skipped') THEN clock_timestamp() ELSE NULL END,
    claimed_until = CASE WHEN p_status = 'failed' THEN clock_timestamp() + interval '5 minutes' ELSE NULL END,
    last_error = p_error WHERE id = p_delivery_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_push_notifications(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_push_notification(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_notifications(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_push_notification(uuid, text, text, text, text) TO service_role;
