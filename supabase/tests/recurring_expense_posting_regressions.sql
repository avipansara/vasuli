-- Run after all migrations against a disposable local database.
--   psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recurring_expense_posting_regressions.sql
-- Fixtures and commands are rolled back at the end.

BEGIN;

INSERT INTO public.users (id, name, email) VALUES
  ('a4100000-0000-0000-0000-000000000001', 'Poster', 'poster@example.test'),
  ('a4100000-0000-0000-0000-000000000002', 'Split one', 'split-one@example.test'),
  ('a4100000-0000-0000-0000-000000000003', 'Split two', 'split-two@example.test');
INSERT INTO public.groups (id, name) VALUES
  ('a4200000-0000-0000-0000-000000000001', 'Posting group');
INSERT INTO public.group_members (group_id, user_id) VALUES
  ('a4200000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000001'),
  ('a4200000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000002'),
  ('a4200000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000003');
INSERT INTO public.friendships (id, user_id, friend_id, status) VALUES
  ('a4700000-0000-0000-0000-000000000001',
   'a4100000-0000-0000-0000-000000000001',
   'a4100000-0000-0000-0000-000000000002', 'accepted');

-- Historical rules keep their anchored schedule; these dates make multiple
-- occurrences due without relying on machine wall-clock time.
INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone, first_due_on,
  next_due_on, last_due_on
) VALUES
  ('a4300000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000001',
   'group', 'a4200000-0000-0000-0000-000000000001', 'Utilities', 90, 'USD',
   'a4100000-0000-0000-0000-000000000001', 'unequal', 'exact', 'monthly', 31,
   'UTC', '2000-01-31', '2000-01-31', '2000-04-30'),
  ('a4300000-0000-0000-0000-000000000002', 'a4100000-0000-0000-0000-000000000001',
   'group', 'a4200000-0000-0000-0000-000000000001', 'Deleted group', 90, 'USD',
   'a4100000-0000-0000-0000-000000000001', 'unequal', 'exact', 'weekly',
   extract(dow FROM current_date - 2)::smallint, 'UTC', current_date - 2,
   current_date - 2, NULL),
  ('a4300000-0000-0000-0000-000000000003', 'a4100000-0000-0000-0000-000000000001',
   'group', 'a4200000-0000-0000-0000-000000000001', 'Departed participant', 90, 'USD',
   'a4100000-0000-0000-0000-000000000001', 'unequal', 'exact', 'weekly',
   extract(dow FROM current_date - 2)::smallint, 'UTC', current_date - 2,
   current_date - 2, NULL),
  ('a4300000-0000-0000-0000-000000000004', 'a4100000-0000-0000-0000-000000000001',
   'group', 'a4200000-0000-0000-0000-000000000001', 'Review dates', 90, 'USD',
   'a4100000-0000-0000-0000-000000000001', 'unequal', 'exact', 'weekly',
   extract(dow FROM current_date - 30)::smallint, 'UTC', current_date - 30,
   current_date - 30, NULL),
  ('a4300000-0000-0000-0000-000000000005', 'a4100000-0000-0000-0000-000000000001',
   'friends', NULL, 'Ended friendship', 90, 'USD',
   'a4100000-0000-0000-0000-000000000001', 'unequal', 'exact', 'weekly',
   extract(dow FROM current_date - 2)::smallint, 'UTC', current_date - 2,
   current_date - 2, NULL),
  ('a4300000-0000-0000-0000-000000000006', 'a4100000-0000-0000-0000-000000000001',
   'group', 'a4200000-0000-0000-0000-000000000001', 'Cutoff after occurrence', 90, 'USD',
   'a4100000-0000-0000-0000-000000000001', 'unequal', 'exact', 'monthly', 31,
   'UTC', '2000-01-31', '2000-01-31', '2000-02-15'),
  ('a4300000-0000-0000-0000-000000000007', 'a4100000-0000-0000-0000-000000000001',
   'group', 'a4200000-0000-0000-0000-000000000001', 'Review cutoff after occurrence', 90, 'USD',
   'a4100000-0000-0000-0000-000000000001', 'unequal', 'exact', 'monthly', 31,
   'UTC', '2000-01-31', '2000-01-31', '2000-02-15');
UPDATE public.recurring_expense_rules
SET status = 'paused', paused_reason = 'Missed dates require owner review'
WHERE id = 'a4300000-0000-0000-0000-000000000007';

INSERT INTO public.recurring_expense_rule_participants(rule_id, user_id, share_amount) VALUES
  ('a4300000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000001', 30),
  ('a4300000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000002', 30),
  ('a4300000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000003', 30),
  ('a4300000-0000-0000-0000-000000000002', 'a4100000-0000-0000-0000-000000000001', 30),
  ('a4300000-0000-0000-0000-000000000002', 'a4100000-0000-0000-0000-000000000002', 30),
  ('a4300000-0000-0000-0000-000000000002', 'a4100000-0000-0000-0000-000000000003', 30),
  ('a4300000-0000-0000-0000-000000000003', 'a4100000-0000-0000-0000-000000000001', 30),
  ('a4300000-0000-0000-0000-000000000003', 'a4100000-0000-0000-0000-000000000002', 30),
  ('a4300000-0000-0000-0000-000000000003', 'a4100000-0000-0000-0000-000000000003', 30),
  ('a4300000-0000-0000-0000-000000000004', 'a4100000-0000-0000-0000-000000000001', 30),
  ('a4300000-0000-0000-0000-000000000004', 'a4100000-0000-0000-0000-000000000002', 30),
  ('a4300000-0000-0000-0000-000000000004', 'a4100000-0000-0000-0000-000000000003', 30);
INSERT INTO public.recurring_expense_rule_participants(rule_id, user_id, share_amount) VALUES
  ('a4300000-0000-0000-0000-000000000005', 'a4100000-0000-0000-0000-000000000001', 40),
  ('a4300000-0000-0000-0000-000000000005', 'a4100000-0000-0000-0000-000000000002', 50),
  ('a4300000-0000-0000-0000-000000000006', 'a4100000-0000-0000-0000-000000000001', 30),
  ('a4300000-0000-0000-0000-000000000006', 'a4100000-0000-0000-0000-000000000002', 30),
  ('a4300000-0000-0000-0000-000000000006', 'a4100000-0000-0000-0000-000000000003', 30),
  ('a4300000-0000-0000-0000-000000000007', 'a4100000-0000-0000-0000-000000000001', 30),
  ('a4300000-0000-0000-0000-000000000007', 'a4100000-0000-0000-0000-000000000002', 30),
  ('a4300000-0000-0000-0000-000000000007', 'a4100000-0000-0000-0000-000000000003', 30);

-- More than two monthly dates are overdue. One call posts exactly two, pauses
-- for review, and retrying that same expected date does not post a third.
DO $$
BEGIN
  IF private.next_recurring_rule_date('2099-01-31', 'monthly', 31) <> '2099-02-28'::date
    OR private.next_recurring_rule_date('2099-02-28', 'monthly', 31) <> '2099-03-31'::date THEN
    RAISE EXCEPTION 'monthly posting did not preserve its anchor across a short month';
  END IF;
END;
$$;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
DECLARE result jsonb; initial_due date; occurrence_count integer; v_rule_id uuid := 'a4300000-0000-0000-0000-000000000001';
BEGIN
  SELECT next_due_on INTO initial_due FROM public.recurring_expense_rules WHERE id = v_rule_id;
  result := public.post_due_recurring_expenses(v_rule_id, initial_due);
  IF jsonb_array_length(result->'posted') <> 2 OR result->>'status' <> 'paused' THEN
    RAISE EXCEPTION 'outage catch-up must post two dates then pause for review: %', result;
  END IF;
  SELECT count(*) INTO occurrence_count FROM public.expenses WHERE recurring_rule_id = v_rule_id;
  IF occurrence_count <> 2 THEN RAISE EXCEPTION 'expected exactly two catch-up expenses'; END IF;
  result := public.post_due_recurring_expenses(v_rule_id, initial_due);
  SELECT count(*) INTO occurrence_count FROM public.expenses WHERE recurring_rule_id = v_rule_id;
  IF result->>'already_processed' <> 'true' OR occurrence_count <> 2 THEN
    RAISE EXCEPTION 'retry of a completed batch advanced or duplicated occurrences';
  END IF;
  IF (SELECT count(*) FROM public.expense_splits s JOIN public.expenses e ON e.id = s.expense_id
      WHERE e.recurring_rule_id = v_rule_id) <> 6 THEN
    RAISE EXCEPTION 'occurrence posting did not create complete split sets';
  END IF;
  IF (SELECT count(*) FROM public.recurring_expense_occurrence_outbox o
      JOIN public.expenses e ON e.id = o.expense_id WHERE e.recurring_rule_id = v_rule_id) <> 6 THEN
    RAISE EXCEPTION 'occurrence delivery events were not recorded per participant';
  END IF;
END;
$$;
RESET ROLE;

-- An owner cannot hide review dates by replacing the review pause or by
-- resuming the rule; each date must go through the explicit review command.
SELECT set_config('request.jwt.claims',
  '{"sub":"b4100000-0000-0000-0000-000000000001","email":"poster@example.test","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
-- The real owner edit command changes only future instructions. Then an
-- ordinary historical expense update changes that occurrence and its shares,
-- while the future rule remains unchanged.
DO $$
DECLARE
  v_rule_id uuid := 'a4300000-0000-0000-0000-000000000001';
  occurrence_id uuid;
  result jsonb;
BEGIN
  SELECT id INTO occurrence_id FROM public.expenses
  WHERE recurring_rule_id = v_rule_id ORDER BY scheduled_for LIMIT 1;
  result := public.edit_recurring_expense_rule(
    v_rule_id,
    '{"amount":105,"split_method":"equal","split_type":"equal"}'::jsonb,
    '[{"user_id":"a4100000-0000-0000-0000-000000000001","share_amount":35},{"user_id":"a4100000-0000-0000-0000-000000000002","share_amount":35},{"user_id":"a4100000-0000-0000-0000-000000000003","share_amount":35}]'::jsonb
  );
  SET CONSTRAINTS ALL IMMEDIATE;
  IF result->>'applies_from' IS DISTINCT FROM (SELECT next_due_on::text FROM public.recurring_expense_rules WHERE id = v_rule_id)
    OR (SELECT amount FROM public.recurring_expense_rules WHERE id = v_rule_id) IS DISTINCT FROM 105::numeric
    OR (SELECT sum(share_amount) FROM public.recurring_expense_rule_participants WHERE rule_id = v_rule_id) IS DISTINCT FROM 105::numeric
    OR (SELECT amount FROM public.expenses WHERE id = occurrence_id) IS DISTINCT FROM 90::numeric THEN
    RAISE EXCEPTION 'future rule edit did not preserve the posted occurrence: %', result;
  END IF;

  UPDATE public.expenses SET amount = 95 WHERE id = occurrence_id;
  UPDATE public.expense_splits
  SET amount = CASE user_id
    WHEN 'a4100000-0000-0000-0000-000000000001'::uuid THEN 31.67
    WHEN 'a4100000-0000-0000-0000-000000000002'::uuid THEN 31.67
    WHEN 'a4100000-0000-0000-0000-000000000003'::uuid THEN 31.66
  END
  WHERE expense_id = occurrence_id;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT amount FROM public.expenses WHERE id = occurrence_id) IS DISTINCT FROM 95::numeric
    OR (SELECT sum(amount) FROM public.expense_splits WHERE expense_id = occurrence_id) IS DISTINCT FROM 95::numeric
    OR (SELECT amount FROM public.recurring_expense_rules WHERE id = v_rule_id) IS DISTINCT FROM 105::numeric THEN
    RAISE EXCEPTION 'posted expense edit changed the future rule or did not balance its shares';
  END IF;
  SET CONSTRAINTS ALL DEFERRED;
END;
$$;
DO $$
DECLARE v_rule_id uuid := 'a4300000-0000-0000-0000-000000000001';
BEGIN
  BEGIN
    PERFORM public.pause_recurring_expense_rule(v_rule_id);
    RAISE EXCEPTION 'owner pause bypassed missed-date review';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.resume_recurring_expense_rule(v_rule_id);
    RAISE EXCEPTION 'owner resume bypassed missed-date review';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT status FROM public.recurring_expense_rules WHERE id = v_rule_id) <> 'paused'
    OR (SELECT paused_reason FROM public.recurring_expense_rules WHERE id = v_rule_id)
      NOT LIKE 'Missed dates require owner review%' THEN
    RAISE EXCEPTION 'pause/resume bypass altered the review barrier';
  END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

-- A cutoff date between recurrence dates includes the last in-range expense,
-- then ends without trying to store a next_due_on beyond that cutoff.
SET LOCAL ROLE service_role;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.post_due_recurring_expenses('a4300000-0000-0000-0000-000000000006', '2000-01-31');
  IF jsonb_array_length(result->'posted') <> 1 OR result->>'status' <> 'ended'
    OR result->>'next_due_on' IS NOT NULL THEN
    RAISE EXCEPTION 'automatic posting did not end at the cutoff between due dates: %', result;
  END IF;
END;
$$;
RESET ROLE;

-- A deleted occurrence retains its unique date identity and is not recreated.
DO $$
DECLARE v_rule_id uuid := 'a4300000-0000-0000-0000-000000000001'; first_occurrence uuid;
BEGIN
  SELECT id INTO first_occurrence FROM public.expenses
  WHERE recurring_rule_id = v_rule_id ORDER BY scheduled_for LIMIT 1;
  UPDATE public.expenses SET deleted_at = now() WHERE id = first_occurrence;
  IF (SELECT count(*) FROM public.expenses WHERE recurring_rule_id = v_rule_id AND deleted_at IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'soft-deleted occurrence did not retain its identity';
  END IF;
  BEGIN
    INSERT INTO public.expenses (group_id, description, amount, currency, paid_by,
      date, created_by, recurring_rule_id, scheduled_for)
    SELECT group_id, description, amount, currency, paid_by, date, created_by,
      recurring_rule_id, scheduled_for FROM public.expenses WHERE id = first_occurrence;
    RAISE EXCEPTION 'soft-deleted occurrence date was recreated';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

-- Invalid scope pauses without creating partial expenses.
UPDATE public.groups SET deleted_at = now() WHERE id = 'a4200000-0000-0000-0000-000000000001';
SET LOCAL ROLE service_role;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.post_due_recurring_expenses('a4300000-0000-0000-0000-000000000002', current_date - 2);
  IF result->>'status' IS DISTINCT FROM 'paused' OR result->>'already_processed' IS DISTINCT FROM 'true'
    OR jsonb_array_length(result->'posted') IS DISTINCT FROM 0
    OR COALESCE((SELECT paused_reason FROM public.recurring_expense_rules
        WHERE id = 'a4300000-0000-0000-0000-000000000002'), '')
      NOT LIKE 'The associated group has been deleted%' THEN
    RAISE EXCEPTION 'deleted group lifecycle pause did not persist its reason and prevent posting: %', result;
  END IF;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE recurring_rule_id = 'a4300000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'invalid group created a partial expense';
  END IF;
END;
$$;
RESET ROLE;

-- Exercise worker-side invalid-scope validation without a lifecycle trigger:
-- insert the active rule after its group has already been soft-deleted.
INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone, first_due_on, next_due_on
) VALUES (
  'a4300000-0000-0000-0000-000000000008', 'a4100000-0000-0000-0000-000000000001',
  'group', 'a4200000-0000-0000-0000-000000000001', 'Worker-only invalid group', 90,
  'USD', 'a4100000-0000-0000-0000-000000000001', 'unequal', 'exact', 'weekly',
  extract(dow FROM current_date - 2)::smallint, 'UTC', current_date - 2, current_date - 2
);
INSERT INTO public.recurring_expense_rule_participants(rule_id, user_id, share_amount) VALUES
  ('a4300000-0000-0000-0000-000000000008', 'a4100000-0000-0000-0000-000000000001', 30),
  ('a4300000-0000-0000-0000-000000000008', 'a4100000-0000-0000-0000-000000000002', 30),
  ('a4300000-0000-0000-0000-000000000008', 'a4100000-0000-0000-0000-000000000003', 30);
SET LOCAL ROLE service_role;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.post_due_recurring_expenses('a4300000-0000-0000-0000-000000000008', current_date - 2);
  IF result->>'status' IS DISTINCT FROM 'paused' OR COALESCE(result->>'reason', '') NOT ILIKE '%deleted%'
    OR jsonb_array_length(result->'posted') IS DISTINCT FROM 0
    OR COALESCE((SELECT paused_reason FROM public.recurring_expense_rules
        WHERE id = 'a4300000-0000-0000-0000-000000000008'), '') NOT LIKE '%deleted%' THEN
    RAISE EXCEPTION 'worker-side invalid-scope validation failed: %', result;
  END IF;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE recurring_rule_id = 'a4300000-0000-0000-0000-000000000008') THEN
    RAISE EXCEPTION 'worker-side invalid group created a partial expense';
  END IF;
END;
$$;
RESET ROLE;

DELETE FROM public.friendships WHERE id = 'a4700000-0000-0000-0000-000000000001';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
DECLARE result jsonb;
BEGIN
  result := public.post_due_recurring_expenses('a4300000-0000-0000-0000-000000000005', current_date - 2);
  IF result->>'status' IS DISTINCT FROM 'paused' OR result->>'already_processed' IS DISTINCT FROM 'true'
    OR jsonb_array_length(result->'posted') IS DISTINCT FROM 0
    OR COALESCE((SELECT paused_reason FROM public.recurring_expense_rules
        WHERE id = 'a4300000-0000-0000-0000-000000000005'), '')
      NOT LIKE 'A saved friendship is no longer accepted%' THEN
    RAISE EXCEPTION 'friendship lifecycle pause did not persist its reason and prevent posting: %', result;
  END IF;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE recurring_rule_id = 'a4300000-0000-0000-0000-000000000005') THEN
    RAISE EXCEPTION 'ended friendship created a partial expense';
  END IF;
END;
$$;
RESET ROLE;

-- Review actions are owner-only, locked, and advance one review date once.
UPDATE public.groups SET deleted_at = NULL WHERE id = 'a4200000-0000-0000-0000-000000000001';
UPDATE public.recurring_expense_rules SET status = 'paused', paused_reason = 'Missed dates require owner review'
WHERE id = 'a4300000-0000-0000-0000-000000000004';
SELECT set_config('request.jwt.claims',
  '{"sub":"b4100000-0000-0000-0000-000000000001","email":"poster@example.test","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb; due_date date := current_date - 30; safe_today date := current_date - 1;
BEGIN
  result := public.review_recurring_expense_date('a4300000-0000-0000-0000-000000000004', due_date, 'post');
  IF result->>'reviewed' <> due_date::text OR result->>'action' <> 'post'
    OR result->>'status' <> 'paused' THEN
    RAISE EXCEPTION 'review post did not consume one date while retaining remaining review dates';
  END IF;
  result := public.review_recurring_expense_date('a4300000-0000-0000-0000-000000000004', due_date, 'post');
  IF result->>'already_reviewed' <> 'true' THEN
    RAISE EXCEPTION 'review retry was not idempotent';
  END IF;
  due_date := due_date + 7;
  WHILE due_date <= safe_today LOOP
    result := public.review_recurring_expense_date(
      'a4300000-0000-0000-0000-000000000004', due_date, 'skip');
    IF result->>'reviewed' <> due_date::text THEN
      RAISE EXCEPTION 'review skip did not consume date %', due_date;
    END IF;
    due_date := due_date + 7;
  END LOOP;
  IF result->>'status' <> 'active' OR (result->>'next_due_on')::date <= safe_today THEN
    RAISE EXCEPTION 'review skip did not resume at the next future date';
  END IF;
  result := public.review_recurring_expense_date('a4300000-0000-0000-0000-000000000007', '2000-01-31', 'skip');
  IF result->>'status' <> 'ended' OR result->>'next_due_on' IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.expenses WHERE recurring_rule_id = 'a4300000-0000-0000-0000-000000000007') THEN
    RAISE EXCEPTION 'review skip did not end cleanly at the cutoff between due dates';
  END IF;
END;
$$;
RESET ROLE;

-- A participant who left a still-existing group pauses the schedule cleanly.
-- The earlier deleted-group case also pauses group rules; restore this one so
-- the member-removal trigger is the reason under test.
UPDATE public.recurring_expense_rules
SET status = 'active', paused_reason = NULL
WHERE id = 'a4300000-0000-0000-0000-000000000003';
DELETE FROM public.group_members WHERE group_id = 'a4200000-0000-0000-0000-000000000001'
  AND user_id = 'a4100000-0000-0000-0000-000000000003';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
DECLARE result jsonb;
BEGIN
  result := public.post_due_recurring_expenses('a4300000-0000-0000-0000-000000000003', current_date - 2);
  IF result->>'status' IS DISTINCT FROM 'paused' OR result->>'already_processed' IS DISTINCT FROM 'true'
    OR jsonb_array_length(result->'posted') IS DISTINCT FROM 0
    OR COALESCE((SELECT paused_reason FROM public.recurring_expense_rules
        WHERE id = 'a4300000-0000-0000-0000-000000000003'), '')
      NOT LIKE 'A saved participant is no longer a member%' THEN
    RAISE EXCEPTION 'member lifecycle pause did not persist its reason and prevent posting: %', result;
  END IF;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE recurring_rule_id = 'a4300000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'departed participant created a partial expense';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
