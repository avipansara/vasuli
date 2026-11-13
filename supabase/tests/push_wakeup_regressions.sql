-- Run against a disposable database after all migrations with pg_net enabled.
-- Requests are inspected before rollback, so no HTTP request is sent.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO public.users (id, name) VALUES
  ('ac100000-0000-0000-0000-000000000001', 'Wake actor'),
  ('ac100000-0000-0000-0000-000000000002', 'Wake recipient'),
  ('ac100000-0000-0000-0000-000000000003', 'Wake recipient two');
INSERT INTO private.push_wakeup_config(singleton, worker_url)
VALUES (true, 'https://example.test/functions/v1/process-push-receipts')
ON CONFLICT (singleton) DO UPDATE SET worker_url = excluded.worker_url;
INSERT INTO public.push_notification_events(event_type, subject_id)
VALUES ('expense_added', 'ac300000-0000-0000-0000-000000000001');
INSERT INTO public.push_notification_outbox(event_type, subject_id, actor_id, recipient_id)
VALUES
 ('expense_added', 'ac300000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000002'),
 ('expense_added', 'ac300000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000003');
DO $$
DECLARE request_body jsonb; wake_id uuid; original_requests integer;
BEGIN
  SELECT count(*) INTO original_requests FROM net.http_request_queue WHERE url = 'https://example.test/functions/v1/process-push-receipts';
  IF original_requests <> 1 THEN RAISE EXCEPTION 'Expected one wake-up for the batch'; END IF;
  SELECT convert_from(body, 'UTF8')::jsonb INTO request_body FROM net.http_request_queue
    WHERE url = 'https://example.test/functions/v1/process-push-receipts';
  IF (SELECT array_agg(key) FROM jsonb_object_keys(request_body) AS key) <> ARRAY['wakeupId'] THEN RAISE EXCEPTION 'Wake-up contains unexpected data'; END IF;
  wake_id := (request_body->>'wakeupId')::uuid;
  IF public.consume_push_wakeup(wake_id) IS DISTINCT FROM 'delivery' OR public.consume_push_wakeup(wake_id) IS NOT NULL THEN RAISE EXCEPTION 'Wake-up must be single use'; END IF;
  IF EXISTS (SELECT 1 FROM net.http_request_queue WHERE url = 'https://example.test/functions/v1/process-push-receipts' AND (headers ? 'Authorization' OR headers ? 'apikey')) THEN RAISE EXCEPTION 'Wake-up includes privileged credentials'; END IF;
  PERFORM private.request_push_worker(true);
  SELECT convert_from(body, 'UTF8')::jsonb INTO request_body FROM net.http_request_queue
    WHERE url = 'https://example.test/functions/v1/process-push-receipts' ORDER BY id DESC LIMIT 1;
  IF public.consume_push_wakeup((request_body->>'wakeupId')::uuid) IS DISTINCT FROM 'scheduled' THEN RAISE EXCEPTION 'Scheduled wake-up did not request receipt checks'; END IF;
  original_requests := original_requests + 1;
  INSERT INTO private.push_wakeups(id, created_at) VALUES ('ac400000-0000-0000-0000-000000000001', clock_timestamp() - interval '6 minutes');
  IF public.consume_push_wakeup('ac400000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'Expired wake-up was accepted'; END IF;
  BEGIN
    INSERT INTO public.push_notification_events(event_type, subject_id) VALUES ('expense_added', 'ac300000-0000-0000-0000-000000000002');
    INSERT INTO public.push_notification_outbox(event_type, subject_id, actor_id, recipient_id)
    VALUES ('expense_added', 'ac300000-0000-0000-0000-000000000002', 'ac100000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'simulate rollback';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF (SELECT count(*) FROM net.http_request_queue WHERE url = 'https://example.test/functions/v1/process-push-receipts') <> original_requests THEN RAISE EXCEPTION 'Rolled-back event left a wake-up'; END IF;
  DELETE FROM private.push_wakeup_config;
  INSERT INTO public.push_notification_events(event_type, subject_id) VALUES ('expense_added', 'ac300000-0000-0000-0000-000000000003');
  INSERT INTO public.push_notification_outbox(event_type, subject_id, actor_id, recipient_id)
  VALUES ('expense_added', 'ac300000-0000-0000-0000-000000000003', 'ac100000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000002');
  IF NOT EXISTS (SELECT 1 FROM public.push_notification_outbox WHERE subject_id = 'ac300000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Missing configuration prevented enqueue'; END IF;
  IF (SELECT count(*) FROM net.http_request_queue WHERE url = 'https://example.test/functions/v1/process-push-receipts') <> original_requests THEN RAISE EXCEPTION 'Unconfigured wake-up queued a request'; END IF;
  IF has_function_privilege('authenticated', 'public.consume_push_wakeup(uuid)', 'EXECUTE') OR has_table_privilege('authenticated', 'private.push_wakeups', 'SELECT') THEN RAISE EXCEPTION 'Untrusted role can read or consume wake-ups'; END IF;
END $$;
ROLLBACK;
