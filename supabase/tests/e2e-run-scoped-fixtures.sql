-- Supabase database regression test.
-- Run with: supabase test db
--
-- The test is transactional and uses only the local Supabase database. It
-- installs the development fixture boundary into the test transaction, uses
-- synthetic local auth users, and rolls every row back at the end.

BEGIN;

\ir ../fixtures/e2e-run-scoped-fixtures.sql
-- Re-running the install must preserve the same grants and revocations.
\ir ../fixtures/e2e-run-scoped-fixtures.sql
-- Legacy cleanup depends on the run-scoped development and actor helpers.
\ir ../fixtures/e2e-purge-groups.sql

SELECT plan(82);

CREATE TEMP TABLE fixture_test_users (
  auth_id uuid PRIMARY KEY,
  app_id uuid NOT NULL,
  friend_id uuid NOT NULL,
  clean_friend_id uuid NOT NULL,
  clean_friend_2_id uuid NOT NULL,
  clean_friend_3_id uuid NOT NULL
);

DO $$
DECLARE
  v_auth_id uuid := '00000000-0000-0000-0000-000000000101';
  v_friend_auth_id uuid := '00000000-0000-0000-0000-000000000102';
  v_clean_friend_auth_id uuid := '00000000-0000-0000-0000-000000000103';
  v_clean_friend_2_auth_id uuid := '00000000-0000-0000-0000-000000000104';
  v_clean_friend_3_auth_id uuid := '00000000-0000-0000-0000-000000000105';
  v_app_id uuid := '00000000-0000-0000-0000-000000000201';
  v_friend_id uuid := '00000000-0000-0000-0000-000000000202';
  v_clean_friend_id uuid := '00000000-0000-0000-0000-000000000203';
  v_clean_friend_2_id uuid := '00000000-0000-0000-0000-000000000204';
  v_clean_friend_3_id uuid := '00000000-0000-0000-0000-000000000205';
  v_dirty_group_id uuid;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_auth_id, 'authenticated', 'authenticated', 'fixture-actor@local.test', '', now(), '{}', '{}'),
    (v_friend_auth_id, 'authenticated', 'authenticated', 'fixture-friend@local.test', '', now(), '{}', '{}'),
    (v_clean_friend_auth_id, 'authenticated', 'authenticated', 'fixture-clean-friend@local.test', '', now(), '{}', '{}'),
    (v_clean_friend_2_auth_id, 'authenticated', 'authenticated', 'fixture-clean-friend-2@local.test', '', now(), '{}', '{}'),
    (v_clean_friend_3_auth_id, 'authenticated', 'authenticated', 'fixture-clean-friend-3@local.test', '', now(), '{}', '{}');

  INSERT INTO public.users (id, auth_user_id, name, email)
  VALUES
    (v_app_id, v_auth_id, 'Fixture Actor', 'fixture-actor@local.test'),
    (v_friend_id, v_friend_auth_id, 'Fixture Friend', 'fixture-friend@local.test'),
    (v_clean_friend_id, v_clean_friend_auth_id, 'Fixture Clean Friend', 'fixture-clean-friend@local.test'),
    (v_clean_friend_2_id, v_clean_friend_2_auth_id, 'Fixture Clean Friend 2', 'fixture-clean-friend-2@local.test'),
    (v_clean_friend_3_id, v_clean_friend_3_auth_id, 'Fixture Clean Friend 3', 'fixture-clean-friend-3@local.test');

  INSERT INTO public.e2e_fixture_accounts (auth_user_id, app_user_id)
  VALUES (v_auth_id, v_app_id);
  INSERT INTO public.friendships (user_id, friend_id, status, created_at)
  VALUES
    (v_app_id, v_friend_id, 'accepted', now()),
    (v_app_id, v_clean_friend_id, 'accepted', now() + interval '1 second'),
    (v_app_id, v_clean_friend_2_id, 'accepted', now() + interval '2 seconds'),
    (v_app_id, v_clean_friend_3_id, 'accepted', now() + interval '3 seconds');

  -- The older accepted friend is intentionally dirty. The fixture must skip
  -- it and choose the newer clean friend rather than relying on an ORDER BY
  -- fallback that could make the seeded balance stale.
  INSERT INTO public.groups (name, description)
  VALUES ('Dirty Fixture Group', 'fixture dirty-friend coverage')
  RETURNING id INTO v_dirty_group_id;
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_dirty_group_id, v_app_id, 'admin'), (v_dirty_group_id, v_friend_id, 'member');
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date, notes)
  VALUES (v_dirty_group_id, 'Dirty fixture expense', 9.00, 'USD', v_app_id, v_app_id, now(), 'dirty-friend coverage')
  RETURNING id INTO v_dirty_group_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (v_dirty_group_id, v_app_id, 0.00, 'exact'), (v_dirty_group_id, v_friend_id, 9.00, 'exact');
  INSERT INTO public.e2e_fixture_settings (id, environment, enabled)
  VALUES (true, 'development', true);

  INSERT INTO fixture_test_users (auth_id, app_id, friend_id, clean_friend_id, clean_friend_2_id, clean_friend_3_id)
  VALUES (v_auth_id, v_app_id, v_friend_id, v_clean_friend_id, v_clean_friend_2_id, v_clean_friend_3_id);
END $$;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"sub":null}', true);
SELECT throws_ok(
  $$SELECT public.seed_e2e_outstanding_group('unauth-run', 'worker-a', 'auth')$$,
  'E2E_FIXTURE_UNAUTHENTICATED',
  'unauthenticated fixture calls are rejected'
);

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', (SELECT auth_id FROM fixture_test_users LIMIT 1))::text,
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_id::text FROM fixture_test_users LIMIT 1),
  true
);
DELETE FROM public.e2e_fixture_settings;
SELECT throws_ok(
  $$SELECT public.seed_e2e_outstanding_group('guard-run', 'worker-a', 'environment')$$,
  'E2E_FIXTURE_DEVELOPMENT_ONLY',
  'fixture calls are rejected when development mode is disabled'
);
INSERT INTO public.e2e_fixture_settings (id, environment, enabled)
VALUES (true, 'development', true);

SELECT is(has_function_privilege('anon', 'public.configure_e2e_fixture_account(text)', 'EXECUTE'), false, 'anon cannot self-allowlist an E2E account');
SELECT is(has_function_privilege('authenticated', 'public.configure_e2e_fixture_account(text)', 'EXECUTE'), false, 'authenticated cannot self-allowlist an E2E account');
SELECT is(has_function_privilege('service_role', 'public.configure_e2e_fixture_account(text)', 'EXECUTE'), false, 'service role cannot self-allowlist an E2E account');
SELECT is(has_function_privilege('anon', 'public.e2e_fixture_actor()', 'EXECUTE'), false, 'anon cannot execute the fixture actor helper');
SELECT is(has_function_privilege('authenticated', 'public.e2e_fixture_actor()', 'EXECUTE'), false, 'authenticated cannot execute the fixture actor helper directly');
SELECT is(has_function_privilege('service_role', 'public.e2e_fixture_actor()', 'EXECUTE'), false, 'service role cannot execute the fixture actor helper');
SELECT is(has_function_privilege('anon', 'public.e2e_fixture_require_development()', 'EXECUTE'), false, 'anon cannot execute the environment helper');
SELECT is(has_function_privilege('authenticated', 'public.e2e_fixture_require_development()', 'EXECUTE'), false, 'authenticated cannot execute the environment helper directly');
SELECT is(has_function_privilege('service_role', 'public.e2e_fixture_require_development()', 'EXECUTE'), false, 'service role cannot execute the environment helper');
SELECT is(has_function_privilege('authenticated', 'public.seed_e2e_outstanding_group(text,text,text)', 'EXECUTE'), true, 'authenticated can execute the seed RPC');
SELECT is(has_function_privilege('authenticated', 'public.seed_e2e_group_membership(text,text,text)', 'EXECUTE'), true, 'authenticated can execute the membership seed RPC');
SELECT is(has_function_privilege('authenticated', 'public.seed_e2e_friendship(text,text,text)', 'EXECUTE'), true, 'authenticated can execute the friendship seed RPC');
SELECT is(has_function_privilege('authenticated', 'public.seed_e2e_settlement_reversal(text,text,text)', 'EXECUTE'), true, 'authenticated can execute the settlement-reversal seed RPC');
SELECT is(has_function_privilege('authenticated', 'public.purge_e2e_fixture_run(text,text,text)', 'EXECUTE'), true, 'authenticated can execute selected-run cleanup');
SELECT is(has_function_privilege('authenticated', 'public.purge_e2e_stale_fixture_runs(timestamp with time zone,text)', 'EXECUTE'), true, 'authenticated can execute stale-run cleanup');
SELECT is(has_function_privilege('anon', 'public.seed_e2e_outstanding_group(text,text,text)', 'EXECUTE'), false, 'anon cannot execute the seed RPC');
SELECT is(has_function_privilege('anon', 'public.purge_e2e_fixture_run(text,text,text)', 'EXECUTE'), false, 'anon cannot execute selected-run cleanup');
SELECT is(has_function_privilege('anon', 'public.purge_e2e_stale_fixture_runs(timestamp with time zone,text)', 'EXECUTE'), false, 'anon cannot execute stale-run cleanup');
SELECT is(has_function_privilege('service_role', 'public.seed_e2e_outstanding_group(text,text,text)', 'EXECUTE'), false, 'service role cannot execute the seed RPC');
SELECT is(has_function_privilege('anon', 'public.seed_e2e_group_membership(text,text,text)', 'EXECUTE'), false, 'anon cannot execute the membership seed RPC');
SELECT is(has_function_privilege('service_role', 'public.seed_e2e_group_membership(text,text,text)', 'EXECUTE'), false, 'service role cannot execute the membership seed RPC');
SELECT is(has_function_privilege('anon', 'public.seed_e2e_friendship(text,text,text)', 'EXECUTE'), false, 'anon cannot execute the friendship seed RPC');
SELECT is(has_function_privilege('service_role', 'public.seed_e2e_friendship(text,text,text)', 'EXECUTE'), false, 'service role cannot execute the friendship seed RPC');
SELECT is(has_function_privilege('anon', 'public.seed_e2e_settlement_reversal(text,text,text)', 'EXECUTE'), false, 'anon cannot execute the settlement-reversal seed RPC');
SELECT is(has_function_privilege('service_role', 'public.seed_e2e_settlement_reversal(text,text,text)', 'EXECUTE'), false, 'service role cannot execute the settlement-reversal seed RPC');
SELECT is(has_function_privilege('service_role', 'public.purge_e2e_fixture_run(text,text,text)', 'EXECUTE'), false, 'service role cannot execute selected-run cleanup');
SELECT is(has_function_privilege('service_role', 'public.purge_e2e_stale_fixture_runs(timestamp with time zone,text)', 'EXECUTE'), false, 'service role cannot execute stale-run cleanup');
SELECT is(has_function_privilege('authenticated', 'public.purge_e2e_groups(text)', 'EXECUTE'), true, 'authenticated can execute legacy group cleanup');
SELECT is(has_function_privilege('anon', 'public.purge_e2e_groups(text)', 'EXECUTE'), false, 'anon cannot execute legacy group cleanup');
SELECT is(has_function_privilege('service_role', 'public.purge_e2e_groups(text)', 'EXECUTE'), false, 'service role cannot execute legacy group cleanup');
SELECT is(to_regprocedure('public.purge_e2e_history(uuid)') IS NULL, true, 'broad legacy history cleanup is removed');

CREATE TEMP TABLE legacy_cleanup_groups (
  owned_id uuid PRIMARY KEY,
  cross_actor_id uuid NOT NULL,
  unprefixed_id uuid NOT NULL
);

DO $$
DECLARE
  v_actor_id uuid := (SELECT app_id FROM fixture_test_users LIMIT 1);
  v_other_id uuid := (SELECT clean_friend_2_id FROM fixture_test_users LIMIT 1);
  v_owned_id uuid;
  v_cross_actor_id uuid;
  v_unprefixed_id uuid;
BEGIN
  INSERT INTO public.groups (name, description)
  VALUES ('Detox Group hardening-owned', 'legacy cleanup actor boundary')
  RETURNING id INTO v_owned_id;
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_owned_id, v_actor_id, 'admin');

  INSERT INTO public.groups (name, description)
  VALUES ('Detox Group hardening-cross-actor', 'legacy cleanup cross actor')
  RETURNING id INTO v_cross_actor_id;
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_cross_actor_id, v_other_id, 'admin');

  INSERT INTO public.groups (name, description)
  VALUES ('Other Group hardening-unprefixed', 'legacy cleanup prefix boundary')
  RETURNING id INTO v_unprefixed_id;
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_unprefixed_id, v_actor_id, 'admin');

  INSERT INTO legacy_cleanup_groups (owned_id, cross_actor_id, unprefixed_id)
  VALUES (v_owned_id, v_cross_actor_id, v_unprefixed_id);
END $$;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"sub":null}', true);
SELECT throws_ok(
  $$SELECT public.purge_e2e_groups('Detox Group hardening-')$$,
  'E2E_FIXTURE_UNAUTHENTICATED',
  'unauthenticated callers cannot invoke legacy group cleanup'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000104', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000104"}',
  true
);
SELECT throws_ok(
  $$SELECT public.purge_e2e_groups('Detox Group hardening-')$$,
  'E2E_FIXTURE_ACCOUNT_NOT_APPROVED',
  'non-allowlisted callers cannot invoke legacy group cleanup'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101"}',
  true
);
SELECT is(
  public.purge_e2e_groups('Detox Group hardening-'),
  1,
  'allowlisted actor can purge its prefixed Group'
);
SELECT is(
  (SELECT count(*)::integer FROM public.groups WHERE id = (SELECT owned_id FROM legacy_cleanup_groups)),
  0,
  'allowlisted actor cleanup deletes its Group'
);
SELECT is(
  (SELECT count(*)::integer FROM public.groups WHERE id = (SELECT cross_actor_id FROM legacy_cleanup_groups)),
  1,
  'legacy cleanup leaves a prefixed Group owned by another actor'
);
SELECT is(
  (SELECT count(*)::integer FROM public.groups WHERE id = (SELECT unprefixed_id FROM legacy_cleanup_groups)),
  1,
  'legacy cleanup leaves an unprefixed Group'
);

CREATE TEMP TABLE fixture_results (
  key text PRIMARY KEY,
  payload jsonb NOT NULL
);
INSERT INTO fixture_results
VALUES ('run-a-first', public.seed_e2e_outstanding_group('run-a', 'worker-a', 'guards'));
INSERT INTO fixture_results
VALUES ('run-a-repeat', public.seed_e2e_outstanding_group('run-a', 'worker-a', 'guards'));
INSERT INTO fixture_results
VALUES ('run-b', public.seed_e2e_outstanding_group('run-b', 'worker-a', 'guards'));
INSERT INTO fixture_results
VALUES ('run-c-first', public.seed_e2e_group_membership('run-c', 'worker-a', 'payer'));
INSERT INTO fixture_results
VALUES ('run-c-repeat', public.seed_e2e_group_membership('run-c', 'worker-a', 'payer'));
INSERT INTO fixture_results
VALUES ('run-d', public.seed_e2e_group_membership('run-d', 'worker-a', 'payer'));
INSERT INTO fixture_results
VALUES ('run-e-first', public.seed_e2e_friendship('run-e', 'worker-a', 'direct-expense'));
INSERT INTO fixture_results
VALUES ('run-e-repeat', public.seed_e2e_friendship('run-e', 'worker-a', 'direct-expense'));
INSERT INTO fixture_results
VALUES ('run-f-first', public.seed_e2e_settlement_reversal('run-f', 'worker-a', 'friend-reversal'));
INSERT INTO fixture_results
VALUES ('run-f-repeat', public.seed_e2e_settlement_reversal('run-f', 'worker-a', 'friend-reversal'));

SELECT is(
  (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-a-first'),
  (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-a-repeat'),
  'repeating a scenario returns the same group ID'
);
SELECT is(
  (SELECT payload->>'expenseId' FROM fixture_results WHERE key = 'run-a-first'),
  (SELECT payload->>'expenseId' FROM fixture_results WHERE key = 'run-a-repeat'),
  'repeating a scenario returns the same expense ID'
);
SELECT is(
  (SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id = 'run-a'),
  1,
  'repeating a scenario does not create a duplicate run row'
);
SELECT is(
  (SELECT payload->>'friendId' FROM fixture_results WHERE key = 'run-a-first'),
  (SELECT clean_friend_id::text FROM fixture_test_users LIMIT 1),
  'outstanding-balance fixture skips the older dirty friend'
);
SELECT is(
  (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-a-first')
    <> (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-b'),
  true,
  'distinct run IDs create isolated groups'
);
SELECT is(
  (SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id IN ('run-a', 'run-b')),
  2,
  'distinct run IDs coexist'
);
SELECT is(
  (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-c-first'),
  (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-c-repeat'),
  'repeating a membership scenario returns the same group ID'
);
SELECT is(
  (SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id = 'run-c'),
  1,
  'repeating a membership scenario does not create a duplicate row'
);
SELECT is(
  (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-c-first')
    <> (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-d'),
  true,
  'distinct membership run IDs create isolated groups'
);
SELECT is(
  (SELECT count(*)::integer FROM public.group_members member
   JOIN public.e2e_fixture_runs run ON run.group_id = member.group_id
   WHERE run.run_id = 'run-c'),
  2,
  'membership scenario seeds only actor and friend membership'
);
SELECT is(
  (SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-e-first'),
  NULL,
  'friendship scenario does not create a group'
);
SELECT is(
  (SELECT payload->>'expenseId' FROM fixture_results WHERE key = 'run-e-first'),
  NULL,
  'friendship scenario does not create an expense'
);
SELECT is(
  (SELECT payload->>'friendId' FROM fixture_results WHERE key = 'run-e-first'),
  (SELECT payload->>'friendId' FROM fixture_results WHERE key = 'run-e-repeat'),
  'repeating a friendship scenario returns the same friend ID'
);
SELECT is(
  (SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id = 'run-e'),
  1,
  'repeating a friendship scenario does not create a duplicate row'
);
SELECT is(
  (SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id = 'run-e' AND group_id IS NOT NULL),
  0,
  'friendship scenario metadata has no group ID'
);
SELECT is(
  (SELECT payload->>'operationId' FROM fixture_results WHERE key = 'run-f-first'),
  (SELECT payload->>'operationId' FROM fixture_results WHERE key = 'run-f-repeat'),
  'repeating a settlement-reversal scenario returns the same operation ID'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_operations operation
   JOIN public.e2e_fixture_runs run ON run.settlement_operation_id = operation.id
   WHERE run.run_id = 'run-f' AND operation.status = 'committed'),
  1,
  'settlement-reversal scenario prepares one committed operation'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlements settlement
   JOIN public.e2e_fixture_runs run ON run.settlement_operation_id = settlement.operation_id
   WHERE run.run_id = 'run-f' AND settlement.operation_id IS NOT NULL AND settlement.group_id IS NULL),
  1,
  'settlement-reversal scenario prepares one direct settlement allocation'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_scope_transfers transfer
   JOIN public.e2e_fixture_runs run ON run.settlement_operation_id = transfer.operation_id
   WHERE run.run_id = 'run-f' AND transfer.group_id = run.group_id
     AND transfer.signed_group_balance_delta = -12.00 AND NOT transfer.is_reversal),
  1,
  'settlement-reversal scenario prepares one group balance offset'
);

DO $$
DECLARE
  v_actor_id uuid := (SELECT app_id FROM fixture_test_users LIMIT 1);
  v_friend_id uuid := (SELECT clean_friend_id FROM fixture_test_users LIMIT 1);
  v_group_id uuid := ((SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-a-first'))::uuid;
  v_group_name text;
  v_operation_id uuid;
  v_legacy_settlement_id uuid;
  v_legacy_activity_id uuid;
BEGIN
  SELECT name INTO v_group_name FROM public.groups WHERE id = v_group_id;

  -- Model the UI commit: its operation is created after the fixture seed and
  -- therefore is intentionally absent from settlement_operation_id metadata.
  INSERT INTO public.settlement_operations (
    actor_user_id, friend_user_id, group_id, mode, currency,
    expected_balance, requested_payment_amount, payment_intent_id, status
  )
  VALUES (
    v_actor_id, v_friend_id, v_group_id, 'group', 'USD',
    12.00, 12.00, gen_random_uuid(), 'committed'
  )
  RETURNING id INTO v_operation_id;

  INSERT INTO public.settlements (
    group_id, from_user_id, to_user_id, amount, currency, date, notes, operation_id
  )
  VALUES (
    v_group_id, v_friend_id, v_actor_id, 12.00, 'USD', now(), 'UI-style fixture settlement', v_operation_id
  );

  INSERT INTO public.settlement_scope_transfers (
    operation_id, group_id, from_user_id, to_user_id, currency,
    signed_group_balance_delta, note, is_reversal
  )
  VALUES (
    v_operation_id, v_group_id, v_friend_id, v_actor_id, 'USD',
    -12.00, 'UI-style fixture scope transfer', false
  );

  UPDATE fixture_results
  SET payload = payload || jsonb_build_object('uiOperationId', v_operation_id)
  WHERE key = 'run-a-first';

  -- Model the legacy Group-settle path: the settlement has no modern
  -- operation/commitment links, while its group and activity retain the
  -- fixture Group and settlement target used by run-scoped cleanup.
  INSERT INTO public.settlements (
    group_id, from_user_id, to_user_id, amount, currency, date, notes
  )
  VALUES (
    v_group_id, v_friend_id, v_actor_id, 12.00, 'USD', now(), 'legacy UI fixture settlement'
  )
  RETURNING id INTO v_legacy_settlement_id;

  INSERT INTO public.activities (
    type, user_id, user_name, target_id, group_id, group_name, description, amount
  )
  VALUES (
    'settlement_created', v_actor_id, 'Fixture Actor', v_legacy_settlement_id,
    v_group_id, v_group_name, 'Legacy UI settlement', 12.00
  )
  RETURNING id INTO v_legacy_activity_id;

  UPDATE fixture_results
  SET payload = payload || jsonb_build_object(
    'legacySettlementId', v_legacy_settlement_id,
    'legacyActivityId', v_legacy_activity_id
  )
  WHERE key = 'run-a-first';
END $$;
SELECT is(
  (SELECT activity.group_id = fixture_group.id
      AND activity.group_name = fixture_group.name
      AND settlement.group_id = fixture_group.id
   FROM public.activities activity
   JOIN public.e2e_fixture_runs run
     ON run.run_id = 'run-a' AND run.test_key = 'guards'
   JOIN public.groups fixture_group ON fixture_group.id = run.group_id
   JOIN public.settlements settlement ON settlement.id = activity.target_id
   WHERE activity.id = ((SELECT payload->>'legacyActivityId' FROM fixture_results WHERE key = 'run-a-first'))::uuid),
  true,
  'legacy settlement and activity retain the exact fixture Group before deletion'
);
SELECT is(
  (SELECT settlement_operation_id IS NULL
   FROM public.e2e_fixture_runs
   WHERE run_id = 'run-a' AND worker_id = 'worker-a' AND test_key = 'guards'),
  true,
  'UI-style operation is not stored in fixture operation metadata'
);

DO $$
DECLARE
  v_expense_id uuid;
  v_actor_id uuid := (SELECT app_id FROM fixture_test_users LIMIT 1);
  v_clean_friend_id uuid := (SELECT clean_friend_id FROM fixture_test_users LIMIT 1);
BEGIN
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date, notes)
  VALUES (NULL, 'Dirty clean-friend coverage expense', 5.00, 'USD', v_actor_id, v_actor_id, now(), 'no-clean coverage')
  RETURNING id INTO v_expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (v_expense_id, v_actor_id, 0.00, 'exact'), (v_expense_id, v_clean_friend_id, 5.00, 'exact');
END $$;
SELECT throws_ok(
  $$SELECT public.seed_e2e_outstanding_group('no-clean-run', 'worker-a', 'no-clean')$$,
  'E2E_FIXTURE_CLEAN_FRIEND_NOT_FOUND',
  'outstanding-balance fixture rejects a run when every accepted friend is dirty'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.friendships friendship
   JOIN public.e2e_fixture_runs run
     ON ((friendship.user_id = run.actor_user_id AND friendship.friend_id = run.friend_user_id)
       OR (friendship.user_id = run.friend_user_id AND friendship.friend_id = run.actor_user_id))
   WHERE run.run_id = 'run-e' AND friendship.status = 'accepted'),
  1,
  'friendship scenario verifies an accepted relationship'
);
SELECT is(public.purge_e2e_fixture_run('run-e', 'worker-a', 'direct-expense'), 1, 'friendship cleanup reports one scenario');
SELECT is((SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id = 'run-e'), 0, 'friendship cleanup removes only its metadata');
SELECT is(public.purge_e2e_fixture_run('run-c', 'worker-a', 'payer'), 1, 'membership cleanup reports one scenario');
SELECT is((SELECT count(*)::integer FROM public.groups WHERE name LIKE 'Detox Group run-c%'), 0, 'membership cleanup removes its group');

SELECT is(public.purge_e2e_fixture_run('run-a', 'worker-a', 'guards'), 1, 'selected run cleanup reports one scenario');
SELECT is((SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id = 'run-a'), 0, 'selected run metadata is removed');
SELECT is((SELECT count(*)::integer FROM public.groups WHERE name LIKE 'Detox Group run-a%'), 0, 'selected run group is removed');
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_operations
   WHERE id = ((SELECT payload->>'uiOperationId' FROM fixture_results WHERE key = 'run-a-first'))::uuid),
  0,
  'cleanup removes a UI-style operation tied to the fixture group'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_scope_transfers
   WHERE operation_id = ((SELECT payload->>'uiOperationId' FROM fixture_results WHERE key = 'run-a-first'))::uuid),
  0,
  'cleanup removes UI-style scope transfers before deleting the group'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlements
   WHERE operation_id = ((SELECT payload->>'uiOperationId' FROM fixture_results WHERE key = 'run-a-first'))::uuid),
  0,
  'cleanup removes UI-style settlement allocations before deleting the group'
);
SELECT is(
  (SELECT count(*)::integer FROM public.activities
   WHERE id = ((SELECT payload->>'legacyActivityId' FROM fixture_results WHERE key = 'run-a-first'))::uuid),
  0,
  'cleanup removes the legacy settlement activity before deleting the fixture group'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlements
   WHERE id = ((SELECT payload->>'legacySettlementId' FROM fixture_results WHERE key = 'run-a-first'))::uuid),
  0,
  'cleanup removes the legacy settlement discovered through its fixture activity'
);
SELECT is((SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id = 'run-b'), 1, 'cleanup leaves the other run metadata intact');
SELECT is((SELECT count(*)::integer FROM public.groups WHERE name LIKE 'Detox Group run-b%'), 1, 'cleanup leaves the other run group intact');

SELECT is(public.purge_e2e_fixture_run('run-f', 'worker-a', 'friend-reversal'), 1, 'settlement-reversal cleanup reports one scenario');
SELECT is((SELECT count(*)::integer FROM public.e2e_fixture_runs WHERE run_id = 'run-f'), 0, 'settlement-reversal cleanup removes its metadata');
SELECT is((SELECT count(*)::integer FROM public.settlement_operations operation
           WHERE operation.id = (
             SELECT (payload->>'operationId')::uuid FROM fixture_results WHERE key = 'run-f-first'
           )), 0, 'settlement-reversal cleanup removes its operation history');
SELECT is((SELECT count(*)::integer FROM public.groups WHERE name LIKE 'Detox Group run-f%'), 0, 'settlement-reversal cleanup removes its group');

UPDATE public.e2e_fixture_runs
SET created_at = now() - interval '3 hours'
WHERE run_id = 'run-b';
SELECT is(public.purge_e2e_stale_fixture_runs(now() - interval '2 hours', 'run-b'), 1, 'stale cleanup requires and removes the selected old run');
SELECT throws_ok(
  $$SELECT public.purge_e2e_stale_fixture_runs(now() - interval '2 hours', 'missing-run')$$,
  'E2E_FIXTURE_STALE_RUN_NOT_FOUND',
  'stale cleanup rejects an unselected run'
);

SELECT * FROM finish();
ROLLBACK;
