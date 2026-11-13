-- Run after the recurring and receipt migrations in a disposable database.
-- Network requests never leave this rolled-back transaction.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO public.users (id, name, email, push_token) VALUES
  ('ae100000-0000-0000-0000-000000000001', 'Owner', 'recurring-owner-security@example.test', NULL),
  ('ae100000-0000-0000-0000-000000000002', 'Friend', 'recurring-friend-security@example.test', 'old-token');
INSERT INTO public.friendships (id, user_id, friend_id, status) VALUES
  ('ae700000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000002', 'accepted');
INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone, first_due_on, next_due_on
) VALUES (
  'ae300000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000001', 'friends', NULL,
  'Rent', 120, 'USD', 'ae100000-0000-0000-0000-000000000001', 'equal', 'equal', 'weekly',
  extract(dow from current_date - 1)::smallint, 'UTC', current_date - 1, current_date - 1
);
INSERT INTO public.recurring_expense_rule_participants(rule_id, user_id, share_amount) VALUES
  ('ae300000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000001', 60),
  ('ae300000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000002', 60);
INSERT INTO private.recurring_worker_config(singleton, worker_url)
VALUES (true, 'https://example.test/functions/v1/process-recurring-expenses')
ON CONFLICT (singleton) DO UPDATE SET worker_url = excluded.worker_url;
DO $$
DECLARE request_body jsonb; wake_id uuid; result jsonb; delivery_id uuid; notice_id uuid;
BEGIN
  IF has_function_privilege('authenticated', 'public.consume_recurring_worker_wakeup(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finish_recurring_push_with_receipt(text,uuid,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.request_recurring_worker()', 'EXECUTE')
     OR has_table_privilege('authenticated', 'private.recurring_worker_wakeups', 'SELECT') THEN
    RAISE EXCEPTION 'Untrusted role can access the recurring scheduler';
  END IF;
  PERFORM private.request_recurring_worker();
  SELECT convert_from(body, 'UTF8')::jsonb INTO request_body FROM net.http_request_queue
    WHERE url = 'https://example.test/functions/v1/process-recurring-expenses' ORDER BY id DESC LIMIT 1;
  IF request_body IS NULL OR (SELECT array_agg(key) FROM jsonb_object_keys(request_body) AS key) <> ARRAY['wakeupId'] THEN RAISE EXCEPTION 'Unexpected scheduler wake-up payload'; END IF;
  IF EXISTS (SELECT 1 FROM net.http_request_queue WHERE url = 'https://example.test/functions/v1/process-recurring-expenses' AND (headers ? 'Authorization' OR headers ? 'apikey')) THEN RAISE EXCEPTION 'Scheduler request contains privileged credentials'; END IF;
  wake_id := (request_body->>'wakeupId')::uuid;
  IF NOT public.consume_recurring_worker_wakeup(wake_id) OR public.consume_recurring_worker_wakeup(wake_id) THEN RAISE EXCEPTION 'Recurring wake-up was not single-use'; END IF;
  INSERT INTO private.recurring_worker_wakeups(id, created_at) VALUES ('ae400000-0000-0000-0000-000000000001', clock_timestamp() - interval '6 minutes');
  IF public.consume_recurring_worker_wakeup('ae400000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Expired recurring wake-up was accepted'; END IF;

  result := public.post_due_recurring_expenses('ae300000-0000-0000-0000-000000000001', current_date - 1);
  IF jsonb_array_length(result->'posted') <> 1 THEN RAISE EXCEPTION 'Recurring expense was not posted'; END IF;
  SELECT c.delivery_id INTO delivery_id FROM public.claim_recurring_expense_push_deliveries(10) c
    WHERE c.recipient_id = 'ae100000-0000-0000-0000-000000000002';
  IF delivery_id IS NULL THEN RAISE EXCEPTION 'Occurrence push was not queued'; END IF;
  BEGIN
    PERFORM public.finish_recurring_push_with_receipt('occurrence', delivery_id, 'sent', 'old-token', NULL, NULL);
    RAISE EXCEPTION 'Missing receipt was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Missing push ticket' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.recurring_expense_occurrence_outbox WHERE id = delivery_id AND delivered_at IS NOT NULL) THEN RAISE EXCEPTION 'Missing ticket marked as sent'; END IF;
  PERFORM public.finish_recurring_push_with_receipt('occurrence', delivery_id, 'sent', 'old-token', 'occurrence-ticket', NULL);
  IF NOT EXISTS (SELECT 1 FROM public.push_receipt_checks WHERE receipt_id = 'occurrence-ticket' AND user_id = 'ae100000-0000-0000-0000-000000000002' AND notification_type = 'expense_added') THEN RAISE EXCEPTION 'Occurrence receipt was not stored'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recurring_expense_occurrence_outbox WHERE id = delivery_id AND delivered_at IS NOT NULL AND delivery_status = 'sent') THEN RAISE EXCEPTION 'Occurrence was not marked sent'; END IF;

  INSERT INTO public.recurring_expense_rule_notification_outbox(rule_id, rule_revision, recipient_id, event_type, payload)
    VALUES ('ae300000-0000-0000-0000-000000000001', 1, 'ae100000-0000-0000-0000-000000000002', 'rule_created', '{}'::jsonb);
  SELECT c.delivery_id INTO notice_id FROM public.claim_recurring_expense_rule_notifications(10) c
    WHERE c.recipient_id = 'ae100000-0000-0000-0000-000000000002';
  UPDATE public.users SET push_token = 'new-token' WHERE id = 'ae100000-0000-0000-0000-000000000002';
  PERFORM public.finish_recurring_push_with_receipt('rule', notice_id, 'skipped', 'old-token', NULL, 'DeviceNotRegistered');
  IF (SELECT push_token FROM public.users WHERE id = 'ae100000-0000-0000-0000-000000000002') <> 'new-token' THEN RAISE EXCEPTION 'A refreshed token was cleared'; END IF;
  INSERT INTO public.recurring_expense_rule_notification_outbox(rule_id, rule_revision, recipient_id, event_type, payload)
    VALUES ('ae300000-0000-0000-0000-000000000001', 2, 'ae100000-0000-0000-0000-000000000002', 'rule_updated', '{}'::jsonb);
  SELECT c.delivery_id INTO notice_id FROM public.claim_recurring_expense_rule_notifications(10) c
    WHERE c.recipient_id = 'ae100000-0000-0000-0000-000000000002';
  PERFORM public.finish_recurring_push_with_receipt('rule', notice_id, 'sent', 'new-token', 'rule-ticket', NULL);
  IF NOT EXISTS (SELECT 1 FROM public.push_receipt_checks WHERE receipt_id = 'rule-ticket' AND notification_type = 'recurring_rule_updated') THEN RAISE EXCEPTION 'Rule notice receipt was not stored'; END IF;
  INSERT INTO public.recurring_expense_rule_notification_outbox(rule_id, rule_revision, recipient_id, event_type, payload)
    VALUES ('ae300000-0000-0000-0000-000000000001', 3, 'ae100000-0000-0000-0000-000000000002', 'rule_updated', '{}'::jsonb);
  SELECT c.delivery_id INTO notice_id FROM public.claim_recurring_expense_rule_notifications(10) c
    WHERE c.recipient_id = 'ae100000-0000-0000-0000-000000000002';
  PERFORM public.finish_recurring_push_with_receipt('rule', notice_id, 'skipped', 'new-token', NULL, 'DeviceNotRegistered');
  IF (SELECT push_token FROM public.users WHERE id = 'ae100000-0000-0000-0000-000000000002') IS NOT NULL THEN RAISE EXCEPTION 'Invalid token was not cleared'; END IF;
END $$;
SET LOCAL request.jwt.claim.role = 'authenticated';
DO $$ BEGIN
  BEGIN PERFORM public.consume_recurring_worker_wakeup('ae400000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'Untrusted caller could consume wake-up';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
