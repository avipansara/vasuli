-- Run after all migrations against a disposable local database.
-- Lifecycle writes, including account deletion, are rolled back at the end.

BEGIN;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous) VALUES
  ('b5100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lifecycle-owner@example.test', now(), now(), false, false),
  ('b5100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'lifecycle-member@example.test', now(), now(), false, false),
  ('b5100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'lifecycle-other@example.test', now(), now(), false, false),
  ('b5100000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'lifecycle-failed@example.test', now(), now(), false, false);
INSERT INTO public.users (id, auth_user_id, name, email) VALUES
  ('a5100000-0000-0000-0000-000000000001', 'b5100000-0000-0000-0000-000000000001', 'Lifecycle owner', 'lifecycle-owner@example.test'),
  ('a5100000-0000-0000-0000-000000000002', 'b5100000-0000-0000-0000-000000000002', 'Lifecycle member', 'lifecycle-member@example.test'),
  ('a5100000-0000-0000-0000-000000000003', 'b5100000-0000-0000-0000-000000000003', 'Other member', 'lifecycle-other@example.test'),
  ('a5100000-0000-0000-0000-000000000004', 'b5100000-0000-0000-0000-000000000004', 'Failed deletion', 'lifecycle-failed@example.test');

INSERT INTO public.groups (id, name) VALUES
  ('a5200000-0000-0000-0000-000000000001', 'Lifecycle group'),
  ('a5200000-0000-0000-0000-000000000002', 'Unrelated group');
INSERT INTO public.group_members (group_id, user_id) VALUES
  ('a5200000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001'),
  ('a5200000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000002'),
  ('a5200000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000003'),
  ('a5200000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000001'),
  ('a5200000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000004');
INSERT INTO public.friendships (id, user_id, friend_id, status) VALUES
  ('a5700000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000002', 'accepted'),
  ('a5700000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000003', 'accepted');

INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone, first_due_on, next_due_on
) VALUES
  ('a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 'group', 'a5200000-0000-0000-0000-000000000001', 'Deleted group rule', 100, 'USD', 'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly', 1, 'UTC', current_date, current_date),
  ('a5300000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000001', 'group', 'a5200000-0000-0000-0000-000000000001', 'Stopped matching group rule', 100, 'USD', 'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly', 1, 'UTC', current_date, current_date),
  ('a5300000-0000-0000-0000-000000000003', 'a5100000-0000-0000-0000-000000000001', 'friends', NULL, 'Deleted friendship rule', 100, 'USD', 'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly', 1, 'UTC', current_date, current_date),
  ('a5300000-0000-0000-0000-000000000004', 'a5100000-0000-0000-0000-000000000001', 'friends', NULL, 'Transition friendship rule', 100, 'USD', 'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly', 1, 'UTC', current_date, current_date),
  ('a5300000-0000-0000-0000-000000000005', 'a5100000-0000-0000-0000-000000000001', 'group', 'a5200000-0000-0000-0000-000000000001', 'Removed member rule', 100, 'USD', 'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly', 1, 'UTC', current_date, current_date),
  ('a5300000-0000-0000-0000-000000000006', 'a5100000-0000-0000-0000-000000000001', 'friends', NULL, 'Owner deletion rule', 100, 'USD', 'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly', 1, 'UTC', current_date, current_date),
  ('a5300000-0000-0000-0000-000000000007', 'a5100000-0000-0000-0000-000000000004', 'group', 'a5200000-0000-0000-0000-000000000002', 'Failed deletion rule', 100, 'USD', 'a5100000-0000-0000-0000-000000000004', 'equal', 'equal', 'monthly', 1, 'UTC', current_date, current_date);

UPDATE public.recurring_expense_rules SET status = 'stopped', next_due_on = NULL
WHERE id = 'a5300000-0000-0000-0000-000000000002';
INSERT INTO public.recurring_expense_rule_participants (rule_id, user_id, share_amount) VALUES
  ('a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 50),
  ('a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000002', 50),
  ('a5300000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000001', 50),
  ('a5300000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000002', 50),
  ('a5300000-0000-0000-0000-000000000003', 'a5100000-0000-0000-0000-000000000001', 50),
  ('a5300000-0000-0000-0000-000000000003', 'a5100000-0000-0000-0000-000000000002', 50),
  ('a5300000-0000-0000-0000-000000000004', 'a5100000-0000-0000-0000-000000000001', 50),
  ('a5300000-0000-0000-0000-000000000004', 'a5100000-0000-0000-0000-000000000003', 50),
  ('a5300000-0000-0000-0000-000000000005', 'a5100000-0000-0000-0000-000000000001', 50),
  ('a5300000-0000-0000-0000-000000000005', 'a5100000-0000-0000-0000-000000000003', 50),
  ('a5300000-0000-0000-0000-000000000006', 'a5100000-0000-0000-0000-000000000001', 50),
  ('a5300000-0000-0000-0000-000000000006', 'a5100000-0000-0000-0000-000000000002', 50),
  ('a5300000-0000-0000-0000-000000000007', 'a5100000-0000-0000-0000-000000000001', 50),
  ('a5300000-0000-0000-0000-000000000007', 'a5100000-0000-0000-0000-000000000004', 50);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

-- Group deletion pauses only active rules in that group and records a reason.
UPDATE public.groups SET deleted_at = now() WHERE id = 'a5200000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000001') IS DISTINCT FROM 'paused'
    OR COALESCE((SELECT paused_reason FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000001'), '') NOT LIKE 'The associated group has been deleted%'
    OR (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000002') IS DISTINCT FROM 'stopped'
    OR (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000007') IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'group deletion did not pause only its matching active rules with a reason';
  END IF;
END;
$$;

-- A non-accepted transition pauses matching direct rules; deleting another
-- friendship pauses only its rule. Unrelated and terminal rules stay intact.
UPDATE public.friendships SET status = 'pending' WHERE id = 'a5700000-0000-0000-0000-000000000002';
DELETE FROM public.friendships WHERE id = 'a5700000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000003') IS DISTINCT FROM 'paused'
    OR COALESCE((SELECT paused_reason FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000003'), '') NOT LIKE 'A saved friendship is no longer accepted%'
    OR (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000004') IS DISTINCT FROM 'paused'
    OR COALESCE((SELECT paused_reason FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000004'), '') NOT LIKE 'A saved friendship is no longer accepted%'
    OR (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000002') IS DISTINCT FROM 'stopped' THEN
    RAISE EXCEPTION 'friendship removal or accepted-to-pending change did not pause matching active rules';
  END IF;
END;
$$;

-- Removing one saved participant pauses affected group rules and retains a
-- clear repair reason. The unrelated active group rule remains active.
INSERT INTO public.group_members (group_id, user_id)
VALUES ('a5200000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000003');
INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone, first_due_on, next_due_on
) VALUES (
  'a5300000-0000-0000-0000-000000000008', 'a5100000-0000-0000-0000-000000000001',
  'group', 'a5200000-0000-0000-0000-000000000002', 'Removed member in live group', 100,
  'USD', 'a5100000-0000-0000-0000-000000000001', 'equal', 'equal', 'monthly',
  1, 'UTC', current_date, current_date
);
INSERT INTO public.recurring_expense_rule_participants (rule_id, user_id, share_amount)
VALUES ('a5300000-0000-0000-0000-000000000008', 'a5100000-0000-0000-0000-000000000001', 50),
       ('a5300000-0000-0000-0000-000000000008', 'a5100000-0000-0000-0000-000000000003', 50);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DELETE FROM public.group_members
WHERE group_id = 'a5200000-0000-0000-0000-000000000002'
  AND user_id = 'a5100000-0000-0000-0000-000000000003';
DO $$
BEGIN
  IF (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000008') IS DISTINCT FROM 'paused'
    OR COALESCE((SELECT paused_reason FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000008'), '') NOT LIKE 'A saved participant is no longer a member%'
    OR (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000007') IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'member removal did not pause only affected group rules';
  END IF;
END;
$$;

-- A failed account deletion leaves the account and its rule unchanged.
INSERT INTO public.expenses (id, group_id, description, amount, currency, paid_by, created_by, date)
VALUES ('a5400000-0000-0000-0000-000000000001', 'a5200000-0000-0000-0000-000000000002', 'Unsettled expense', 100, 'USD', 'a5100000-0000-0000-0000-000000000004', 'a5100000-0000-0000-0000-000000000004', now());
INSERT INTO public.expense_splits (expense_id, user_id, amount)
VALUES ('a5400000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 50),
       ('a5400000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000004', 50);
DO $$
DECLARE error_message text; error_state text;
BEGIN
  BEGIN
    PERFORM public.delete_account_data('b5100000-0000-0000-0000-000000000004', NULL);
    RAISE EXCEPTION 'account deletion unexpectedly ignored an outstanding balance';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT, error_state = RETURNED_SQLSTATE;
    IF error_state <> 'P0001' OR error_message <> 'ACCOUNT_HAS_OUTSTANDING_BALANCES' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000007') IS DISTINCT FROM 'active'
    OR (SELECT is_active FROM public.users WHERE id = 'a5100000-0000-0000-0000-000000000004') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'failed account deletion changed its rule or profile';
  END IF;
END;
$$;
DELETE FROM public.expense_splits WHERE expense_id = 'a5400000-0000-0000-0000-000000000001';
DELETE FROM public.expenses WHERE id = 'a5400000-0000-0000-0000-000000000001';

-- Settled shared history remains while all future rules owned by the deleted
-- account stop and lose their next due date.
INSERT INTO public.expenses (id, group_id, description, amount, currency, paid_by, created_by, date)
VALUES ('a5400000-0000-0000-0000-000000000002', 'a5200000-0000-0000-0000-000000000002', 'Settled shared history', 100, 'USD', 'a5100000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', now());
INSERT INTO public.expense_splits (expense_id, user_id, amount)
VALUES ('a5400000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000001', 50),
       ('a5400000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000004', 50);
INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency, date)
VALUES ('a5200000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000004', 'a5100000-0000-0000-0000-000000000001', 50, 'USD', now());
SELECT public.delete_account_data('b5100000-0000-0000-0000-000000000001', NULL);
DO $$
BEGIN
  IF (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000006') IS DISTINCT FROM 'stopped'
    OR (SELECT next_due_on FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000006') IS NOT NULL
    OR (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000001') IS DISTINCT FROM 'stopped'
    OR (SELECT count(*) FROM public.expenses WHERE id = 'a5400000-0000-0000-0000-000000000002') <> 1
    OR (SELECT count(*) FROM public.expense_splits WHERE expense_id = 'a5400000-0000-0000-0000-000000000002') <> 2
    OR (SELECT name FROM public.users WHERE id = 'a5100000-0000-0000-0000-000000000001') IS DISTINCT FROM 'Deleted User' THEN
    RAISE EXCEPTION 'account deletion result mismatch: rule %, next %, paused %, expenses %, splits %, profile %',
      (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000006'),
      (SELECT next_due_on FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000006'),
      (SELECT status FROM public.recurring_expense_rules WHERE id = 'a5300000-0000-0000-0000-000000000001'),
      (SELECT count(*) FROM public.expenses WHERE id = 'a5400000-0000-0000-0000-000000000002'),
      (SELECT count(*) FROM public.expense_splits WHERE expense_id = 'a5400000-0000-0000-0000-000000000002'),
      (SELECT name FROM public.users WHERE id = 'a5100000-0000-0000-0000-000000000001');
  END IF;
END;
$$;

ROLLBACK;
