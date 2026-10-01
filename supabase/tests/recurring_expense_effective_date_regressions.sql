-- Run after all migrations against the isolated local recurring-expense database.
--   psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recurring_expense_effective_date_regressions.sql
-- All fixture rows and auth claims are rolled back.
BEGIN;

INSERT INTO public.users (id, name, email) VALUES
  ('a5100000-0000-0000-0000-000000000001', 'Date owner', 'date-owner@example.test'),
  ('a5100000-0000-0000-0000-000000000002', 'Date friend', 'date-friend@example.test'),
  ('a5100000-0000-0000-0000-000000000003', 'Authorized payer', 'date-payer@example.test');
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('a5200000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'date-owner-auth@example.test', '', now(), '{}', '{}', now(), now()),
  ('a5200000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'date-payer-auth@example.test', '', now(), '{}', '{}', now(), now());
UPDATE public.users
SET auth_user_id = 'a5200000-0000-0000-0000-000000000001'
WHERE id = 'a5100000-0000-0000-0000-000000000001';
UPDATE public.users
SET auth_user_id = 'a5200000-0000-0000-0000-000000000002'
WHERE id = 'a5100000-0000-0000-0000-000000000003';
INSERT INTO public.groups (id, name) VALUES
  ('a5300000-0000-0000-0000-000000000001', 'Date projection group');
INSERT INTO public.group_members (id, group_id, user_id, role) VALUES
  ('a5310000-0000-0000-0000-000000000001', 'a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 'admin'),
  ('a5310000-0000-0000-0000-000000000002', 'a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000002', 'member'),
  ('a5310000-0000-0000-0000-000000000003', 'a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000003', 'member');
INSERT INTO public.friendships (id, user_id, friend_id, status) VALUES
  ('a5400000-0000-0000-0000-000000000001',
   'a5100000-0000-0000-0000-000000000001',
   'a5100000-0000-0000-0000-000000000002', 'accepted');
INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone, first_due_on, next_due_on
) VALUES (
  'a5500000-0000-0000-0000-000000000001',
  'a5100000-0000-0000-0000-000000000001', 'group',
  'a5300000-0000-0000-0000-000000000001', 'Monthly rent', 100, 'USD',
  'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly', 2,
  'Asia/Kolkata', '2026-01-02', '2026-02-02'
);
INSERT INTO public.recurring_expense_rule_participants (rule_id, user_id, share_amount) VALUES
  ('a5500000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 50),
  ('a5500000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000002', 50);

DO $$
DECLARE
  occurrence_id uuid := 'a5600000-0000-0000-0000-000000000001';
  occurrence_row public.expenses%ROWTYPE;
BEGIN
  IF private.resolve_recurring_effective_date(
    '2026-01-02 03:30:00+00', '2026-01-02', 'Asia/Kolkata'
  ) <> '2026-01-02'::date THEN
    RAISE EXCEPTION 'Original saved-zone 9:00 AM posting did not resolve to scheduled date';
  END IF;
  IF private.resolve_recurring_effective_date(
    '2026-01-04 00:00:00+00', '2026-01-02', 'Asia/Kolkata'
  ) <> '2026-01-04'::date THEN
    RAISE EXCEPTION 'Historical edited timestamp did not retain its saved-zone calendar date';
  END IF;

  SELECT private.insert_recurring_occurrence(r, '2026-01-02') INTO occurrence_id
  FROM public.recurring_expense_rules r
  WHERE r.id = 'a5500000-0000-0000-0000-000000000001';

  UPDATE public.expenses SET amount = 125 WHERE id = occurrence_id;
  SELECT * INTO occurrence_row FROM public.expenses WHERE id = occurrence_id;
  IF occurrence_row.date IS DISTINCT FROM '2026-01-02 03:30:00+00'::timestamptz
    OR occurrence_row.effective_date IS DISTINCT FROM '2026-01-02'::date
    OR occurrence_row.scheduled_for IS DISTINCT FROM '2026-01-02'::date THEN
    RAISE EXCEPTION 'Amount-only edit moved the occurrence date or scheduled identity';
  END IF;


END;
$$;

-- Transfer payer role to a group member who is not a saved rule participant.
-- They can edit the occurrence as payer but cannot select its recurring rule.
UPDATE public.expenses SET paid_by = 'a5100000-0000-0000-0000-000000000003'
WHERE recurring_rule_id = 'a5500000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub', 'a5200000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;

-- A non-owner payer can edit the expense; the trigger must read the rule's zone
-- through its SECURITY DEFINER boundary while the rule itself remains hidden.
UPDATE public.expenses SET date = '2026-01-04 00:00:00+00'
WHERE id = (SELECT id FROM public.expenses WHERE recurring_rule_id = 'a5500000-0000-0000-0000-000000000001');
DO $$
DECLARE occurrence_row public.expenses%ROWTYPE;
BEGIN
  SELECT * INTO occurrence_row FROM public.expenses
  WHERE recurring_rule_id = 'a5500000-0000-0000-0000-000000000001';
  IF occurrence_row.effective_date IS DISTINCT FROM '2026-01-04'::date
    OR occurrence_row.scheduled_for IS DISTINCT FROM '2026-01-02'::date THEN
    RAISE EXCEPTION 'Non-owner payer date edit changed schedule identity or lost saved-zone calendar date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recurring_expense_rules
    WHERE id = 'a5500000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Non-owner payer unexpectedly gained rule visibility';
  END IF;
END;
$$;

-- The current editor stores both the selected instant and explicit calendar day.
UPDATE public.expenses
SET date = '2026-01-05 00:00:00+00', effective_date = '2026-01-05'
WHERE recurring_rule_id = 'a5500000-0000-0000-0000-000000000001';
DO $$
DECLARE occurrence_row public.expenses%ROWTYPE;
BEGIN
  SELECT * INTO occurrence_row FROM public.expenses
  WHERE recurring_rule_id = 'a5500000-0000-0000-0000-000000000001';
  IF occurrence_row.effective_date IS DISTINCT FROM '2026-01-05'::date
    OR occurrence_row.scheduled_for IS DISTINCT FROM '2026-01-02'::date THEN
    RAISE EXCEPTION 'Explicit date edit changed the scheduled identity';
  END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'a5200000-0000-0000-0000-000000000001', true);

DO $$
DECLARE
  projection jsonb;
  projected_occurrence jsonb;
BEGIN
  projection := public.get_friend_detail_read_model('a5100000-0000-0000-0000-000000000002');
  SELECT value INTO projected_occurrence
  FROM jsonb_array_elements(projection->'groupExpenses') AS value
  WHERE value->>'id' = (SELECT id::text FROM public.expenses WHERE recurring_rule_id = 'a5500000-0000-0000-0000-000000000001');
  IF projected_occurrence->>'effectiveDate' IS DISTINCT FROM '2026-01-05'
    OR projected_occurrence->>'scheduledFor' IS DISTINCT FROM '2026-01-02' THEN
    RAISE EXCEPTION 'Friend RPC omitted occurrence effective calendar metadata';
  END IF;
  IF position('backfilledTransferId' IN pg_get_functiondef(
    'public.get_friend_detail_read_model(uuid)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'Date projection patch replaced the later backfilled transfer field';
  END IF;
END;
$$;

INSERT INTO public.expenses (
  id, group_id, description, amount, currency, paid_by, created_by, date
) VALUES (
  'a5600000-0000-0000-0000-000000000002',
  'a5300000-0000-0000-0000-000000000001', 'One-time cost', 20,
  'USD', 'a5100000-0000-0000-0000-000000000001',
  'a5100000-0000-0000-0000-000000000001', '2026-01-03 00:00:00+00'
);
DO $$
BEGIN
  IF (SELECT effective_date FROM public.expenses WHERE id = 'a5600000-0000-0000-0000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'Ordinary expense acquired recurring calendar metadata';
  END IF;
END;
$$;

ROLLBACK;
