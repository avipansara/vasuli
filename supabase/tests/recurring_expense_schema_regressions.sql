-- Run against a database with migrations applied:
--   psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recurring_expense_schema_regressions.sql
-- All fixture writes are rolled back at the end.

BEGIN;

INSERT INTO public.users (id, name, email) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Recurring owner', 'recurring-owner@example.test'),
  ('a1000000-0000-0000-0000-000000000002', 'Recurring participant', 'recurring-participant@example.test'),
  ('a1000000-0000-0000-0000-000000000003', 'Second friend', 'recurring-second-friend@example.test'),
  ('a1000000-0000-0000-0000-000000000004', 'Unrelated user', 'recurring-unrelated@example.test');

INSERT INTO public.groups (id, name)
VALUES ('a2000000-0000-0000-0000-000000000001', 'Recurring group');

INSERT INTO public.group_members (group_id, user_id)
VALUES
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');

INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone,
  first_due_on, next_due_on, last_due_on
) VALUES (
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'group',
  'a2000000-0000-0000-0000-000000000001',
  'Monthly utilities', 100.00, 'USD',
  'a1000000-0000-0000-0000-000000000001',
  'percentage', 'percentage', 'monthly', 31, 'America/Chicago',
  '2026-01-31', '2026-01-31', '2026-12-31'
);

INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone,
  first_due_on, next_due_on
) VALUES (
  'a3000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  'friends', NULL, 'Shared direct expense', 90.00, 'USD',
  'a1000000-0000-0000-0000-000000000001',
  'shares', 'exact', 'weekly', 5, 'America/Chicago',
  '2026-02-01', '2026-02-01'
);

INSERT INTO public.recurring_expense_rule_participants (
  rule_id, user_id, share_amount, percentage
) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 60.00, 60.00),
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 40.00, 40.00),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 15.00, NULL),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 30.00, NULL),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 45.00, NULL);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.recurring_expense_rules (
      owner_id, scope_type, group_id, description, amount, currency, paid_by,
      split_method, split_type, cadence, anchor_day, time_zone,
      first_due_on, next_due_on
    ) VALUES (
      'a1000000-0000-0000-0000-000000000001', 'group', NULL,
      'Group scope without group', 10.00, 'USD',
      'a1000000-0000-0000-0000-000000000001',
      'equal', 'equal', 'weekly', 5, 'America/Chicago',
      '2026-02-01', '2026-02-01'
    );
    RAISE EXCEPTION 'group rule without group_id unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.recurring_expense_rules (
      owner_id, scope_type, group_id, description, amount, currency, paid_by,
      split_method, split_type, cadence, anchor_day, time_zone,
      first_due_on, next_due_on
    ) VALUES (
      'a1000000-0000-0000-0000-000000000001', 'friends',
      'a2000000-0000-0000-0000-000000000001', 'Friend scope with group',
      10.00, 'USD', 'a1000000-0000-0000-0000-000000000001',
      'equal', 'equal', 'weekly', 5, 'America/Chicago',
      '2026-02-01', '2026-02-01'
    );
    RAISE EXCEPTION 'friend scope with group_id unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF (SELECT split_method FROM public.recurring_expense_rules
      WHERE id = 'a3000000-0000-0000-0000-000000000002') <> 'shares'
     OR (SELECT split_type FROM public.recurring_expense_rules
         WHERE id = 'a3000000-0000-0000-0000-000000000002') <> 'exact' THEN
    RAISE EXCEPTION 'selected Shares method was not preserved separately';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
BEGIN
  INSERT INTO public.expenses (
    id, group_id, description, amount, currency, paid_by, created_by, date,
    recurring_rule_id, scheduled_for
  ) VALUES (
    'a4000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001',
    'First utilities occurrence', 100.00, 'USD',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    '2026-01-31 12:00:00+00',
    'a3000000-0000-0000-0000-000000000001', '2026-01-31'
  );
  UPDATE public.expenses SET deleted_at = now()
  WHERE id = 'a4000000-0000-0000-0000-000000000001';

  BEGIN
    INSERT INTO public.expenses (
      id, group_id, description, amount, currency, paid_by, created_by, date,
      recurring_rule_id, scheduled_for
    ) VALUES (
      'a4000000-0000-0000-0000-000000000002',
      'a2000000-0000-0000-0000-000000000001',
      'Duplicate utilities occurrence', 100.00, 'USD',
      'a1000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      '2026-01-31 12:00:00+00',
      'a3000000-0000-0000-0000-000000000001', '2026-01-31'
    );
    RAISE EXCEPTION 'duplicate occurrence unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.recurring_expense_rules (
      id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
      split_method, split_type, cadence, anchor_day, time_zone,
      first_due_on, next_due_on
    ) VALUES (
      'a3000000-0000-0000-0000-000000000003',
      'a1000000-0000-0000-0000-000000000001',
      'group',
      'a2000000-0000-0000-0000-000000000001',
      'Invalid split', 10.00, 'USD',
      'a1000000-0000-0000-0000-000000000001',
      'unequal', 'exact', 'weekly', 5, 'America/Chicago',
      '2026-02-01', '2026-02-01'
    );
    INSERT INTO public.recurring_expense_rule_participants (rule_id, user_id, share_amount)
    VALUES (
      'a3000000-0000-0000-0000-000000000003',
      'a1000000-0000-0000-0000-000000000001', 9.99
    );
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'unbalanced split unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.recurring_expense_rules
    SET currency = 'CAD'
    WHERE id = 'a3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'rule currency unexpectedly changed';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF (SELECT currency FROM public.recurring_expense_rules
      WHERE id = 'a3000000-0000-0000-0000-000000000001') <> 'USD' THEN
    RAISE EXCEPTION 'immutable currency was changed';
  END IF;
END;
$$;

-- An owner sees full rule state; a participant sees only their share through
-- the safe view and their own row in the base participant table.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000001","email":"recurring-owner@example.test","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.recurring_expense_rules) <> 2 THEN
    RAISE EXCEPTION 'owner could not read their recurring rule';
  END IF;
  IF (SELECT count(*) FROM public.recurring_expense_rule_participants) <> 5 THEN
    RAISE EXCEPTION 'owner could not read all split rows';
  END IF;
  BEGIN
    INSERT INTO public.expenses (
      group_id, description, amount, currency, paid_by, created_by, date,
      recurring_rule_id, scheduled_for
    ) VALUES (
      'a2000000-0000-0000-0000-000000000001', 'Forged occurrence', 100.00,
      'USD', 'a1000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', now(),
      'a3000000-0000-0000-0000-000000000001', '2026-02-28'
    );
    RAISE EXCEPTION 'authenticated owner forged a scheduled occurrence';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000002","email":"recurring-participant@example.test","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.recurring_expense_rules) <> 0 THEN
    RAISE EXCEPTION 'participant can read private rule columns directly';
  END IF;
  IF (SELECT count(*) FROM public.recurring_expense_rule_shares) <> 2
     OR (SELECT share_amount FROM public.recurring_expense_rule_shares
         WHERE scope_type = 'group') <> 40.00
     OR (SELECT share_amount FROM public.recurring_expense_rule_shares
         WHERE scope_type = 'friends') <> 30.00 THEN
    RAISE EXCEPTION 'participant cannot read only their schedule and share';
  END IF;
  IF (SELECT count(*) FROM public.recurring_expense_rule_participants) <> 2
     OR (SELECT sum(share_amount) FROM public.recurring_expense_rule_participants) <> 70.00 THEN
    RAISE EXCEPTION 'participant can read another participant share';
  END IF;
  UPDATE public.recurring_expense_rules SET status = 'paused'
  WHERE id = 'a3000000-0000-0000-0000-000000000001';
END;
$$;

SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000003","email":"recurring-second-friend@example.test","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.recurring_expense_rule_shares) <> 1
     OR (SELECT share_amount FROM public.recurring_expense_rule_shares) <> 45.00 THEN
    RAISE EXCEPTION 'second direct friend cannot read only their share';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000004","email":"recurring-unrelated@example.test","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.recurring_expense_rules) <> 0
     OR (SELECT count(*) FROM public.recurring_expense_rule_shares) <> 0
     OR (SELECT count(*) FROM public.recurring_expense_rule_participants) <> 0 THEN
    RAISE EXCEPTION 'unrelated user can discover a recurring rule';
  END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.recurring_expense_rules
      WHERE id = 'a3000000-0000-0000-0000-000000000001') <> 'active' THEN
    RAISE EXCEPTION 'participant changed someone else''s rule';
  END IF;
END;
$$;
ROLLBACK;
