-- Run after all migrations against a disposable local database:
--   psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recurring_expense_command_regressions.sql
-- Fixtures and command results are rolled back at the end.

BEGIN;

INSERT INTO public.users (id, name, email) VALUES
  ('a1100000-0000-0000-0000-000000000001', 'Rule owner', 'rule-owner@example.test'),
  ('a1100000-0000-0000-0000-000000000002', 'Rule participant', 'rule-participant@example.test'),
  ('a1100000-0000-0000-0000-000000000003', 'Unrelated', 'rule-unrelated@example.test');

INSERT INTO public.groups (id, name)
VALUES ('a2100000-0000-0000-0000-000000000001', 'Command group');
INSERT INTO public.group_members (group_id, user_id) VALUES
  ('a2100000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001'),
  ('a2100000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000002');
INSERT INTO public.friendships (id, user_id, friend_id, status)
VALUES ('a3100000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000002', 'accepted');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b1100000-0000-0000-0000-000000000001","email":"rule-owner@example.test","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

CREATE TEMP TABLE command_results AS
SELECT public.create_recurring_expense_rule(
  '{"scope_type":"group","group_id":"a2100000-0000-0000-0000-000000000001","description":"Monthly utilities","amount":100,"currency":"USD","split_method":"equal","split_type":"equal","cadence":"monthly","anchor_day":1,"time_zone":"America/Chicago","first_due_on":"2099-01-01","last_due_on":"2099-12-01"}'::jsonb,
  '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":50},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":50}]'::jsonb,
  false
) AS created;
GRANT SELECT ON command_results TO service_role;

DO $$
DECLARE v_rule_id uuid;
BEGIN
  SELECT (created->>'rule_id')::uuid INTO v_rule_id FROM command_results;
  BEGIN
    UPDATE public.recurring_expense_rules SET amount = 999 WHERE id = v_rule_id;
    RAISE EXCEPTION 'owner bypassed the validated command API with a direct table update';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

DO $$
DECLARE v_rule_id uuid;
BEGIN
  SELECT (created->>'rule_id')::uuid INTO v_rule_id FROM command_results;
  IF v_rule_id IS NULL THEN RAISE EXCEPTION 'rule creation did not return its ID'; END IF;
  IF (SELECT created->>'next_due_on' FROM command_results) <> '2099-01-01' THEN
    RAISE EXCEPTION 'new rule did not return its first due date';
  END IF;
  IF (SELECT last_due_on FROM public.recurring_expense_rules r WHERE r.id = v_rule_id) <> '2099-12-01'::date THEN
    RAISE EXCEPTION 'optional last due date was not retained';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE v_rule_id uuid;
BEGIN
  SELECT (created->>'rule_id')::uuid INTO v_rule_id FROM command_results;
  IF (SELECT count(*) FROM public.recurring_expense_rule_notification_outbox n WHERE n.rule_id = v_rule_id) <> 1 THEN
    RAISE EXCEPTION 'create did not queue exactly one notice per affected participant';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE warning jsonb; duplicate_id uuid;
BEGIN
  warning := public.create_recurring_expense_rule(
    '{"scope_type":"group","group_id":"a2100000-0000-0000-0000-000000000001","description":"Monthly utilities","amount":100,"currency":"USD","split_method":"equal","split_type":"equal","cadence":"monthly","anchor_day":1,"time_zone":"America/Chicago","first_due_on":"2099-01-01"}'::jsonb,
    '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":50},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":50}]'::jsonb,
    false
  );
  IF warning->>'duplicate_warning' <> 'true' OR warning->>'existing_rule_id' IS NULL THEN
    RAISE EXCEPTION 'likely duplicate did not return an inspectable warning';
  END IF;
  duplicate_id := (public.create_recurring_expense_rule(
    '{"scope_type":"group","group_id":"a2100000-0000-0000-0000-000000000001","description":"Monthly utilities","amount":100,"currency":"USD","split_method":"equal","split_type":"equal","cadence":"monthly","anchor_day":1,"time_zone":"America/Chicago","first_due_on":"2099-01-01"}'::jsonb,
    '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":50},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":50}]'::jsonb,
    true
  )->>'rule_id')::uuid;
  IF duplicate_id IS NULL THEN RAISE EXCEPTION 'owner could not confirm a legitimate similar rule'; END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.create_recurring_expense_rule(
      '{"scope_type":"group","group_id":"a2100000-0000-0000-0000-000000000001","description":"Mismatched weekly anchor","amount":100,"currency":"USD","split_method":"equal","split_type":"equal","cadence":"weekly","anchor_day":1,"time_zone":"America/Chicago","first_due_on":"2099-01-01"}'::jsonb,
      '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":50},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":50}]'::jsonb,
      false
    );
    RAISE EXCEPTION 'mismatched weekly anchor unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;

CREATE TEMP TABLE rule_to_edit AS
SELECT (created->>'rule_id')::uuid AS id FROM command_results;
GRANT SELECT ON rule_to_edit TO service_role;

DO $$
DECLARE v_rule_id uuid;
BEGIN
  SELECT id INTO v_rule_id FROM rule_to_edit;
  BEGIN
    PERFORM public.edit_recurring_expense_rule(
      v_rule_id,
      '{"first_due_on":"2099-02-01"}'::jsonb,
      '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":50},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":50}]'::jsonb
    );
    RAISE EXCEPTION 'first due date edit was silently ignored';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;

DO $$
DECLARE v_rule_id uuid;
BEGIN
  SELECT id INTO v_rule_id FROM rule_to_edit;
  BEGIN
    PERFORM public.edit_recurring_expense_rule(
      v_rule_id,
      '{"paid_by":"a1100000-0000-0000-0000-000000000002"}'::jsonb,
      '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":50},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":50}]'::jsonb
    );
    RAISE EXCEPTION 'edit accepted a payer other than the owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE result jsonb; v_rule_id uuid;
BEGIN
  SELECT id INTO v_rule_id FROM rule_to_edit;
  result := public.edit_recurring_expense_rule(
    v_rule_id,
    '{"amount":120,"split_method":"equal","split_type":"equal"}'::jsonb,
    '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":60},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":60}]'::jsonb
  );
  IF result->>'applies_from' <> '2099-01-01' OR result->>'material_change' <> 'true' THEN
    RAISE EXCEPTION 'edit did not report the first unposted date and material change';
  END IF;
  IF (SELECT amount FROM public.recurring_expense_rules r WHERE r.id = v_rule_id) <> 120 THEN
    RAISE EXCEPTION 'future rule amount was not edited';
  END IF;
  IF (SELECT count(*) FROM public.recurring_expense_rule_notification_outbox n WHERE n.rule_id = v_rule_id) <> 2 THEN
    RAISE EXCEPTION 'material edit did not queue one notice per affected participant';
  END IF;
  PERFORM public.edit_recurring_expense_rule(
    v_rule_id,
    '{"amount":120,"split_method":"equal","split_type":"equal"}'::jsonb,
    '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":60},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":60}]'::jsonb
  );
  IF (SELECT count(*) FROM public.recurring_expense_rule_notification_outbox n WHERE n.rule_id = v_rule_id) <> 2 THEN
    RAISE EXCEPTION 'unchanged edit sent a duplicate notice';
  END IF;
  result := public.edit_recurring_expense_rule(
    v_rule_id,
    '{"scope_type":"friends","group_id":null}'::jsonb,
    '[{"user_id":"a1100000-0000-0000-0000-000000000001","share_amount":60},{"user_id":"a1100000-0000-0000-0000-000000000002","share_amount":60}]'::jsonb
  );
  IF result->>'material_change' <> 'true'
     OR (SELECT count(*) FROM public.recurring_expense_rule_notification_outbox n WHERE n.rule_id = v_rule_id) <> 3
     OR (SELECT scope_type FROM public.recurring_expense_rules r WHERE r.id = v_rule_id) <> 'friends' THEN
    RAISE EXCEPTION 'scope edit did not advance revision and notify affected participants';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_rule_id uuid; result jsonb;
BEGIN
  SELECT id INTO v_rule_id FROM rule_to_edit;
  result := public.pause_recurring_expense_rule(v_rule_id);
  IF result->>'status' <> 'paused' THEN RAISE EXCEPTION 'pause did not pause the rule'; END IF;
  result := public.resume_recurring_expense_rule(v_rule_id);
  IF result->>'status' <> 'active' OR result->>'next_due_on' <> '2099-01-01' THEN
    RAISE EXCEPTION 'resume did not keep the first future due date';
  END IF;
  result := public.stop_recurring_expense_rule(v_rule_id);
  IF result->>'status' <> 'stopped' OR result->>'stopped_after_due_on' <> '2099-01-01' THEN
    RAISE EXCEPTION 'stop was not final or did not report the schedule boundary';
  END IF;
  IF (SELECT next_due_on FROM public.recurring_expense_rules r WHERE r.id = v_rule_id) IS NOT NULL THEN
    RAISE EXCEPTION 'stopped rule retained a next due date';
  END IF;
  BEGIN
    PERFORM public.resume_recurring_expense_rule(v_rule_id);
    RAISE EXCEPTION 'stopped rule unexpectedly resumed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;

SELECT set_config('request.jwt.claims',
  '{"sub":"b1100000-0000-0000-0000-000000000002","email":"rule-participant@example.test","role":"authenticated"}', true);
DO $$
DECLARE v_rule_id uuid; details jsonb;
BEGIN
  SELECT id INTO v_rule_id FROM rule_to_edit;
  details := public.get_recurring_expense_rule(v_rule_id);
  IF jsonb_array_length(details->'participants') <> 1
     OR details->'participants'->0->>'user_id' <> 'a1100000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'participant read exposed another participant share';
  END IF;
  BEGIN
    PERFORM public.pause_recurring_expense_rule(v_rule_id);
    RAISE EXCEPTION 'participant unexpectedly paused the owner rule';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config('request.jwt.claims',
  '{"sub":"b1100000-0000-0000-0000-000000000003","email":"rule-unrelated@example.test","role":"authenticated"}', true);
DO $$
DECLARE v_rule_id uuid;
BEGIN
  SELECT id INTO v_rule_id FROM rule_to_edit;
  BEGIN
    PERFORM public.get_recurring_expense_rule(v_rule_id);
    RAISE EXCEPTION 'unrelated user unexpectedly read a recurring rule';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
