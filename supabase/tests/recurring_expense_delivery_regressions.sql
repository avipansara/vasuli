-- Run after all migrations against a disposable local database.
-- psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recurring_expense_delivery_regressions.sql
-- Fixtures and commands are rolled back at the end.

BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

INSERT INTO public.users (id, name, email, push_token) VALUES
  ('a5100000-0000-0000-0000-000000000001', 'Recurring owner', 'recurring-owner@example.test', NULL),
  ('a5100000-0000-0000-0000-000000000002', 'Recurring friend', 'recurring-friend@example.test', 'ExponentPushToken[delivery-test]');
INSERT INTO public.friendships (id, user_id, friend_id, status) VALUES
  ('a5700000-0000-0000-0000-000000000001',
   'a5100000-0000-0000-0000-000000000001',
   'a5100000-0000-0000-0000-000000000002', 'accepted');

INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone, first_due_on, next_due_on
) VALUES (
  'a5300000-0000-0000-0000-000000000001',
  'a5100000-0000-0000-0000-000000000001', 'friends', NULL, 'Monthly rent', 120,
  'USD', 'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly', 29,
  'UTC', current_date - 1, current_date - 1
);
INSERT INTO public.recurring_expense_rule_participants(rule_id, user_id, share_amount) VALUES
  ('a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 60),
  ('a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000002', 60);

DO $$
DECLARE due_rows record;
  expense_id uuid := 'a5400000-0000-0000-0000-000000000001';
  first_claim integer;
  activity_id uuid;
  v_delivery_id uuid;
  v_notice_delivery_id uuid;
BEGIN
  SELECT * INTO due_rows
  FROM public.claim_due_recurring_expense_rules(10)
  WHERE rule_id = 'a5300000-0000-0000-0000-000000000001';
  IF due_rows.rule_id IS NULL THEN
    RAISE EXCEPTION 'A rule past its local 9 a.m. deadline was not selected';
  END IF;

  INSERT INTO public.expenses(
    id, group_id, description, amount, currency, paid_by, date, created_by,
    recurring_rule_id, scheduled_for
  ) VALUES (
    expense_id, NULL, 'Monthly rent', 120, 'USD',
    'a5100000-0000-0000-0000-000000000001', now(),
    'a5100000-0000-0000-0000-000000000001',
    'a5300000-0000-0000-0000-000000000001', current_date - 1
  );
  INSERT INTO public.recurring_expense_occurrence_outbox(
    expense_id, rule_id, scheduled_for, recipient_id, payload
  ) VALUES (
    expense_id, 'a5300000-0000-0000-0000-000000000001', current_date - 1,
    'a5100000-0000-0000-0000-000000000001', '{}'::jsonb
  ), (
    expense_id, 'a5300000-0000-0000-0000-000000000001', current_date - 1,
    'a5100000-0000-0000-0000-000000000002', '{}'::jsonb
  );

  first_claim := public.deliver_recurring_expense_activities(10);
  IF first_claim <> 1 OR public.deliver_recurring_expense_activities(10) <> 0 THEN
    RAISE EXCEPTION 'Activity outbox retry was not idempotent';
  END IF;
  SELECT id INTO activity_id FROM public.activities WHERE recurring_occurrence_id = expense_id;
  IF activity_id IS NULL OR NOT (
    SELECT metadata @> jsonb_build_object('recurring', true, 'scheduled_for', current_date - 1)
    FROM public.activities WHERE id = activity_id AND type = 'expense_created'
      AND target_id = expense_id AND user_id = 'a5100000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Automated occurrence activity is missing its normal shape or marker';
  END IF;

  SELECT c.delivery_id INTO v_delivery_id
  FROM public.claim_recurring_expense_push_deliveries(10) c
  WHERE c.recipient_id = 'a5100000-0000-0000-0000-000000000002';
  IF v_delivery_id IS NULL THEN RAISE EXCEPTION 'Push outbox did not expose the participant'; END IF;
  IF EXISTS (SELECT 1 FROM public.claim_recurring_expense_push_deliveries(10)) THEN
    RAISE EXCEPTION 'A leased push row was claimed by a concurrent worker';
  END IF;

  PERFORM public.finish_recurring_expense_push_delivery(v_delivery_id, 'failed', 'Expo unavailable');
  SELECT c.delivery_id INTO v_delivery_id
  FROM public.claim_recurring_expense_push_deliveries(10) c
  WHERE c.recipient_id = 'a5100000-0000-0000-0000-000000000002';
  IF v_delivery_id IS NULL THEN RAISE EXCEPTION 'Failed push row was not retryable'; END IF;
  PERFORM public.finish_recurring_expense_push_delivery(v_delivery_id, 'sent', NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.recurring_expense_occurrence_outbox
    WHERE recipient_id = 'a5100000-0000-0000-0000-000000000002'
      AND delivery_status = 'sent' AND delivered_at IS NOT NULL
      AND attempt_count = 2 AND last_error IS NULL
  ) THEN RAISE EXCEPTION 'Successful push retry did not clear delivery diagnostics'; END IF;

  INSERT INTO public.recurring_expense_rule_notification_outbox(
    rule_id, rule_revision, recipient_id, event_type, payload
  ) VALUES (
    'a5300000-0000-0000-0000-000000000001', 1,
    'a5100000-0000-0000-0000-000000000002', 'rule_created',
    jsonb_build_object('description', 'Monthly rent', 'amount', 120, 'currency', 'USD',
      'cadence', 'monthly', 'next_due_on', current_date + 1)
  );
  SELECT n.delivery_id INTO v_notice_delivery_id
  FROM public.claim_recurring_expense_rule_notifications(10) n
  WHERE n.rule_id = 'a5300000-0000-0000-0000-000000000001'
    AND n.recipient_id = 'a5100000-0000-0000-0000-000000000002';
  IF v_notice_delivery_id IS NULL THEN RAISE EXCEPTION 'Rule notice outbox was not claimable'; END IF;
  IF EXISTS (SELECT 1 FROM public.claim_recurring_expense_rule_notifications(10)) THEN
    RAISE EXCEPTION 'A leased rule notice was claimed by a concurrent worker';
  END IF;
  PERFORM public.finish_recurring_expense_rule_notification(v_notice_delivery_id, 'failed', 'Expo unavailable');
  SELECT n.delivery_id INTO v_notice_delivery_id
  FROM public.claim_recurring_expense_rule_notifications(10) n
  WHERE n.rule_id = 'a5300000-0000-0000-0000-000000000001'
    AND n.recipient_id = 'a5100000-0000-0000-0000-000000000002';
  IF v_notice_delivery_id IS NULL THEN RAISE EXCEPTION 'Failed rule notice was not retryable'; END IF;
  PERFORM public.finish_recurring_expense_rule_notification(v_notice_delivery_id, 'sent', NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.recurring_expense_rule_notification_outbox
    WHERE rule_id = 'a5300000-0000-0000-0000-000000000001'
      AND recipient_id = 'a5100000-0000-0000-0000-000000000002'
      AND delivery_status = 'sent' AND delivered_at IS NOT NULL
      AND attempt_count = 2 AND last_error IS NULL
  ) THEN RAISE EXCEPTION 'Successful rule notice retry did not clear diagnostics'; END IF;
END;
$$;

RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.claim_due_recurring_expense_rules(10);
    RAISE EXCEPTION 'Authenticated callers must not claim scheduler work';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.claim_recurring_expense_rule_notifications(10);
    RAISE EXCEPTION 'Authenticated callers must not claim rule notifications';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

ROLLBACK;
