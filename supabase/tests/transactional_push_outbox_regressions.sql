-- Run against a disposable database after all migrations; all fixtures roll back.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO public.users (id, name, push_token) VALUES
  ('ab100000-0000-0000-0000-000000000001', 'Alex', 'old-token'),
  ('ab100000-0000-0000-0000-000000000002', 'Sam', 'friend-token'),
  ('ab100000-0000-0000-0000-000000000003', 'Taylor', NULL);
INSERT INTO public.groups(id, name) VALUES ('ab200000-0000-0000-0000-000000000001', 'Trip');
INSERT INTO public.group_members(group_id, user_id) VALUES
  ('ab200000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001'),
  ('ab200000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000002'),
  ('ab200000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000003');
INSERT INTO public.expenses(id, group_id, created_by, paid_by, description, amount, currency, date)
VALUES ('ab300000-0000-0000-0000-000000000001', 'ab200000-0000-0000-0000-000000000001',
  'ab100000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 'Dinner', 20, 'GBP', now());
INSERT INTO public.expense_splits(expense_id, user_id, amount, split_type) VALUES
 ('ab300000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 10, 'equal'),
 ('ab300000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000002', 10, 'equal');
-- An edit must not generate a second creation event.
INSERT INTO public.expense_splits(expense_id, user_id, amount, split_type) VALUES
 ('ab300000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000003', 0, 'equal');
INSERT INTO public.expenses(id, group_id, created_by, paid_by, description, amount, currency, date)
VALUES ('ab300000-0000-0000-0000-000000000002', NULL,
  'ab100000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 'Coffee', 10, 'USD', now());
INSERT INTO public.expense_splits(expense_id, user_id, amount, split_type) VALUES
 ('ab300000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000001', 5, 'equal'),
 ('ab300000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000002', 5, 'equal');
INSERT INTO public.settlement_operations(id, actor_user_id, friend_user_id, group_id, mode, requested_payment_amount, expected_balance, currency, payment_intent_id)
VALUES ('ab400000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001',
  'ab100000-0000-0000-0000-000000000002', NULL, 'all_balances', 5, -5, 'GBP', 'ab500000-0000-0000-0000-000000000001');
INSERT INTO public.settlements(operation_id, from_user_id, to_user_id, amount, currency, date)
VALUES ('ab400000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001',
  'ab100000-0000-0000-0000-000000000002', 5, 'GBP', now());
INSERT INTO public.settlement_operation_reversals(id, operation_id, actor_user_id)
VALUES ('ab600000-0000-0000-0000-000000000001', 'ab400000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000002');
DO $$
DECLARE item record; token text;
BEGIN
  IF has_table_privilege('authenticated', 'public.push_notification_outbox', 'SELECT')
     OR has_function_privilege('authenticated', 'public.claim_push_notifications(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finish_push_notification(uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Untrusted role can access the notification queue';
  END IF;
  IF (SELECT count(*) FROM public.push_notification_outbox WHERE event_type = 'expense_added' AND subject_id = 'ab300000-0000-0000-0000-000000000001') <> 2 THEN RAISE EXCEPTION 'Group expense recipients or deduplication incorrect'; END IF;
  IF (SELECT count(*) FROM public.push_notification_outbox WHERE event_type = 'expense_added' AND subject_id = 'ab300000-0000-0000-0000-000000000002' AND recipient_id = 'ab100000-0000-0000-0000-000000000002') <> 1 THEN RAISE EXCEPTION 'Friend expense recipient incorrect'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_notification_outbox WHERE event_type = 'settlement_reversed' AND recipient_id = 'ab100000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Reversal recipient incorrect'; END IF;
  BEGIN
    INSERT INTO public.settlement_operations(id, actor_user_id, friend_user_id, group_id, mode, requested_payment_amount, expected_balance, currency, payment_intent_id)
    VALUES ('ab400000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000001',
      'ab100000-0000-0000-0000-000000000002', NULL, 'all_balances', 5, -5, 'GBP', 'ab500000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'simulate failed settlement';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.push_notification_outbox WHERE subject_id = 'ab400000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Rolled-back payment left a notification'; END IF;
  CREATE TEMP TABLE claimed_notices ON COMMIT DROP AS SELECT * FROM public.claim_push_notifications(50);
  IF NOT EXISTS (SELECT 1 FROM claimed_notices WHERE event_type = 'settlement_created' AND body = 'Alex recorded that Alex paid GBP 5.00 to Sam') THEN RAISE EXCEPTION 'Payment notice has the wrong payer or amount'; END IF;
  SELECT * INTO item FROM claimed_notices WHERE event_type = 'settlement_reversed';
  IF item.delivery_id IS NULL OR item.data->>'friendId' <> 'ab100000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'Reversal not claimable or link incorrect'; END IF;
  UPDATE public.users SET push_token = 'new-token' WHERE id = 'ab100000-0000-0000-0000-000000000001';
  PERFORM public.finish_push_notification(item.delivery_id, 'skipped', 'old-token', NULL, 'DeviceNotRegistered');
  SELECT push_token INTO token FROM public.users WHERE id = 'ab100000-0000-0000-0000-000000000001';
  IF token <> 'new-token' THEN RAISE EXCEPTION 'A refreshed token was cleared'; END IF;
  SELECT * INTO item FROM public.push_notification_outbox WHERE event_type = 'settlement_created';
  PERFORM public.finish_push_notification(item.id, 'sent', 'friend-token', 'receipt-test', NULL);
  IF NOT EXISTS (SELECT 1 FROM public.push_receipt_checks WHERE receipt_id = 'receipt-test' AND user_id = 'ab100000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Receipt not tracked'; END IF;
END $$;
SET LOCAL request.jwt.claim.role = 'authenticated';
DO $$ BEGIN
  BEGIN PERFORM public.claim_push_notifications(1); RAISE EXCEPTION 'Untrusted caller could claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
