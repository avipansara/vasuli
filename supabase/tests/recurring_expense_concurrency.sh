#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DISPOSABLE_LOCAL_DATABASE_URL:-}" ]]; then
  echo 'Set DISPOSABLE_LOCAL_DATABASE_URL to a disposable local Supabase database.' >&2
  exit 2
fi

rule_id='a4400000-0000-0000-0000-000000000001'
group_id='a4500000-0000-0000-0000-000000000001'
owner_id='a4600000-0000-0000-0000-000000000001'
participant_id='a4600000-0000-0000-0000-000000000002'
setup_done=0
cleanup() {
  [[ "$setup_done" == 1 ]] || return 0
psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
DELETE FROM public.activities
WHERE recurring_occurrence_id IN (
  SELECT id FROM public.expenses WHERE recurring_rule_id = '$rule_id'
);
DELETE FROM public.recurring_expense_activity_outbox WHERE rule_id = '$rule_id';
DELETE FROM public.recurring_expense_occurrence_outbox WHERE rule_id = '$rule_id';
DELETE FROM public.expenses WHERE recurring_rule_id = '$rule_id';
DELETE FROM public.recurring_expense_rules WHERE id = '$rule_id';
DELETE FROM public.group_members WHERE group_id = '$group_id';
DELETE FROM public.groups WHERE id = '$group_id';
DELETE FROM public.users WHERE id IN ('$owner_id', '$participant_id');
SQL
}
trap cleanup EXIT

if psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -Atq -c \
  "SELECT EXISTS (SELECT 1 FROM public.recurring_expense_rules WHERE id = '$rule_id') OR EXISTS (SELECT 1 FROM public.groups WHERE id = '$group_id') OR EXISTS (SELECT 1 FROM public.users WHERE id IN ('$owner_id', '$participant_id'))" | grep -qx t; then
  echo 'Concurrency fixture IDs already exist; refusing to alter existing rows.' >&2
  exit 2
fi

psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
BEGIN;
INSERT INTO public.users (id, name, email) VALUES
  ('$owner_id', 'Concurrency owner', 'concurrency-owner@example.test'),
  ('$participant_id', 'Concurrency participant', 'concurrency-participant@example.test');
INSERT INTO public.groups (id, name) VALUES ('$group_id', 'Concurrency fixture');
INSERT INTO public.group_members (group_id, user_id) VALUES
  ('$group_id', '$owner_id'), ('$group_id', '$participant_id');
INSERT INTO public.recurring_expense_rules (
  id, owner_id, scope_type, group_id, description, amount, currency, paid_by,
  split_method, split_type, cadence, anchor_day, time_zone,
  first_due_on, next_due_on, last_due_on
) VALUES (
  '$rule_id', '$owner_id', 'group', '$group_id', 'Concurrency fixture', 20,
  'USD', '$owner_id', 'unequal', 'exact', 'weekly',
  extract(dow FROM current_date - 1)::smallint, 'UTC',
  current_date - 1, current_date - 1, current_date - 1
);
INSERT INTO public.recurring_expense_rule_participants (rule_id, user_id, share_amount)
VALUES ('$rule_id', '$owner_id', 10), ('$rule_id', '$participant_id', 10);
COMMIT;
SQL
setup_done=1

# Transaction one owns the exact same row lock that edit/stop/post use, then
# posts while transaction two is already waiting on that rule.
psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "BEGIN; SELECT 1 FROM public.recurring_expense_rules WHERE id = '$rule_id' FOR UPDATE; SELECT pg_sleep(2); SELECT set_config('request.jwt.claim.role', 'service_role', true); SELECT public.post_due_recurring_expenses('$rule_id', current_date - 1); COMMIT;" >/tmp/vasuli-recurring-post-a.log &
first_pid=$!
sleep 0.2
psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.post_due_recurring_expenses('$rule_id', current_date - 1);" >/tmp/vasuli-recurring-post-b.log &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

psql "$DISPOSABLE_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF (SELECT count(*) FROM public.expenses WHERE recurring_rule_id = '$rule_id') <> 1 THEN
    RAISE EXCEPTION 'Concurrent calls created more than one occurrence';
  END IF;
  IF (SELECT count(*) FROM public.expense_splits s JOIN public.expenses e ON e.id = s.expense_id
      WHERE e.recurring_rule_id = '$rule_id') <> 2 THEN
    RAISE EXCEPTION 'Concurrent calls did not leave a complete split set';
  END IF;
  IF (SELECT count(*) FROM public.recurring_expense_occurrence_outbox o
      WHERE o.rule_id = '$rule_id') <> 2 THEN
    RAISE EXCEPTION 'Concurrent calls did not leave one delivery event per participant';
  END IF;
  IF (SELECT status FROM public.recurring_expense_rules WHERE id = '$rule_id') <> 'ended' THEN
    RAISE EXCEPTION 'The final due date did not end the rule';
  END IF;
END
\$\$;
SQL

echo 'Concurrent posting serialized: one expense, two splits, two occurrence events, final rule ended.'
