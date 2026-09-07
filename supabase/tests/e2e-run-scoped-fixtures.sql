-- Supabase database regression test.
-- Run with: supabase test db
--
-- The test is transactional and uses only the local Supabase database. It
-- installs the development fixture boundary into the test transaction, uses
-- synthetic local auth users, and rolls every row back at the end.
--
-- The fixture bodies below are inlined (byte-identical copies of
-- supabase/fixtures/e2e-run-scoped-fixtures.sql x2 and
-- supabase/fixtures/e2e-purge-groups.sql x1) because `supabase test db`
-- executes each test file inside a container where only that file is
-- visible, so `\ir ../fixtures/...` cannot resolve. Keep them in sync with
-- the fixture sources; services/e2e-fixture-contract.test.ts fails if they
-- drift.

BEGIN;

-- BEGIN inlined supabase/fixtures/e2e-run-scoped-fixtures.sql (copy 1 of 2)
-- Run-scoped E2E fixtures. Development SQL editor only.
--
-- This file is intentionally not a migration. The settings and account rows
-- below are the deployment boundary: until a developer enables this fixture
-- for the development project and explicitly allowlists an E2E account, the
-- security-definer functions refuse every request. Never run this file on a
-- production project.

CREATE TABLE IF NOT EXISTS public.e2e_fixture_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  environment text NOT NULL CHECK (environment = 'development'),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.e2e_fixture_accounts (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.e2e_fixture_runs (
  run_id text NOT NULL,
  worker_id text NOT NULL,
  test_key text NOT NULL,
  scenario text NOT NULL CHECK (scenario IN ('accepted_friendship', 'group_membership', 'outstanding_group_balance', 'settlement_reversal')),
  marker text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  settlement_operation_id uuid REFERENCES public.settlement_operations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, worker_id, test_key, scenario),
  UNIQUE (marker),
  CHECK (run_id <> '' AND worker_id <> '' AND test_key <> ''),
  CHECK (actor_user_id <> friend_user_id)
);

-- Keep an already-installed Ticket 03 fixture compatible with the later
-- membership and settlement-reversal scenarios.
ALTER TABLE public.e2e_fixture_runs
  DROP CONSTRAINT IF EXISTS e2e_fixture_runs_scenario_check;
ALTER TABLE public.e2e_fixture_runs
  ADD CONSTRAINT e2e_fixture_runs_scenario_check
  CHECK (scenario IN ('accepted_friendship', 'group_membership', 'outstanding_group_balance', 'settlement_reversal'));

ALTER TABLE public.e2e_fixture_runs
  ADD COLUMN IF NOT EXISTS settlement_operation_id uuid
  REFERENCES public.settlement_operations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_e2e_fixture_runs_actor_run
  ON public.e2e_fixture_runs(actor_user_id, run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_e2e_fixture_runs_created_at
  ON public.e2e_fixture_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_e2e_fixture_runs_group
  ON public.e2e_fixture_runs(group_id);
CREATE INDEX IF NOT EXISTS idx_e2e_fixture_runs_expense
  ON public.e2e_fixture_runs(expense_id);

ALTER TABLE public.e2e_fixture_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_fixture_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_fixture_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.e2e_fixture_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.e2e_fixture_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.e2e_fixture_runs FROM PUBLIC, anon, authenticated;

-- The install portion above is executable without placeholders. Enable the
-- boundary and allowlist an account separately with the setup file after
-- verifying the SQL Editor is connected to the development project.

CREATE OR REPLACE FUNCTION public.configure_e2e_fixture_account(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_user_id uuid;
  v_app_user_id uuid;
BEGIN
  IF p_email IS NULL OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
     OR p_email LIKE 'REPLACE_%' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_ACCOUNT_EMAIL_REQUIRED';
  END IF;

  SELECT au.id, u.id
    INTO v_auth_user_id, v_app_user_id
  FROM auth.users au
  JOIN public.users u ON u.auth_user_id = au.id
  WHERE lower(btrim(au.email)) = lower(btrim(p_email))
  LIMIT 1;

  IF v_auth_user_id IS NULL OR v_app_user_id IS NULL THEN
    RAISE EXCEPTION 'Expected an existing authenticated E2E account profile';
  END IF;

  INSERT INTO public.e2e_fixture_accounts (auth_user_id, app_user_id, enabled)
  VALUES (v_auth_user_id, v_app_user_id, true)
  ON CONFLICT (auth_user_id) DO UPDATE
  SET app_user_id = EXCLUDED.app_user_id,
      enabled = true;
END $$;

CREATE OR REPLACE FUNCTION public.e2e_fixture_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_UNAUTHENTICATED';
  END IF;

  SELECT account.app_user_id
    INTO v_actor
  FROM public.e2e_fixture_accounts account
  WHERE account.auth_user_id = (SELECT auth.uid())
    AND account.enabled;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_ACCOUNT_NOT_APPROVED';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.e2e_fixture_require_development()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.e2e_fixture_settings settings
    WHERE settings.id
      AND settings.enabled
      AND settings.environment = 'development'
  ) THEN
    RAISE EXCEPTION 'E2E_FIXTURE_DEVELOPMENT_ONLY';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_e2e_outstanding_group(
  p_run_id text,
  p_worker_id text,
  p_test_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_friend_id uuid;
  v_group_id uuid;
  v_expense_id uuid;
  v_existing public.e2e_fixture_runs%ROWTYPE;
  v_friend_name text;
  v_group_name text;
  v_expense_description text;
  v_marker text;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_test_key IS NULL OR p_test_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  v_marker := format('e2e:%s:%s:%s', p_run_id, p_worker_id, p_test_key);
  -- Serialize a repeated request and a concurrent request for the same
  -- scenario key before the idempotent row lookup/creation.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  SELECT * INTO v_existing
  FROM public.e2e_fixture_runs run
  WHERE run.run_id = p_run_id
    AND run.worker_id = p_worker_id
    AND run.test_key = p_test_key
    AND run.scenario = 'outstanding_group_balance'
  FOR UPDATE;

  IF v_existing.run_id IS NOT NULL THEN
    IF v_existing.group_id IS NULL OR v_existing.expense_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.groups WHERE id = v_existing.group_id)
       OR NOT EXISTS (SELECT 1 FROM public.expenses WHERE id = v_existing.expense_id) THEN
      RAISE EXCEPTION 'E2E_FIXTURE_INCOMPLETE';
    END IF;

    SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_existing.friend_user_id;
    SELECT g.name INTO v_group_name FROM public.groups g WHERE g.id = v_existing.group_id;
    SELECT e.description INTO v_expense_description FROM public.expenses e WHERE e.id = v_existing.expense_id;
    RETURN jsonb_build_object(
      'runId', v_existing.run_id, 'workerId', v_existing.worker_id,
      'testKey', v_existing.test_key, 'scenario', v_existing.scenario,
      'marker', v_existing.marker,
      'actorId', v_existing.actor_user_id, 'friendId', v_existing.friend_user_id,
      'friendName', v_friend_name, 'groupId', v_existing.group_id,
      'groupName', v_group_name, 'expenseId', v_existing.expense_id,
      'expenseDescription', v_expense_description,
      'expectedBalance', 12, 'expectedBalanceDirection', 'friend_owes_you', 'paymentAmount', 12
    );
  END IF;

  WITH accepted_friends AS (
    SELECT CASE WHEN f.user_id = v_actor_id THEN f.friend_id ELSE f.user_id END AS candidate_id,
           f.created_at,
           f.id AS friendship_id
    FROM public.friendships f
    JOIN public.users friend
      ON friend.id = CASE WHEN f.user_id = v_actor_id THEN f.friend_id ELSE f.user_id END
    WHERE f.status = 'accepted'
      AND (f.user_id = v_actor_id OR f.friend_id = v_actor_id)
  )
  SELECT candidate.candidate_id
    INTO v_friend_id
  FROM accepted_friends candidate
  WHERE NOT EXISTS (
      SELECT 1
      FROM public.expenses direct_expense
      WHERE direct_expense.group_id IS NULL
        AND direct_expense.deleted_at IS NULL
        AND (
          (direct_expense.paid_by = v_actor_id AND EXISTS (
            SELECT 1 FROM public.expense_splits candidate_split
            WHERE candidate_split.expense_id = direct_expense.id
              AND candidate_split.user_id = candidate.candidate_id
              AND candidate_split.amount > 0
          ))
          OR (direct_expense.paid_by = candidate.candidate_id AND EXISTS (
            SELECT 1 FROM public.expense_splits actor_split
            WHERE actor_split.expense_id = direct_expense.id
              AND actor_split.user_id = v_actor_id
              AND actor_split.amount > 0
          ))
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.group_members actor_member
      JOIN public.group_members candidate_member
        ON candidate_member.group_id = actor_member.group_id
       AND candidate_member.user_id = candidate.candidate_id
      JOIN public.expenses group_expense
        ON group_expense.group_id = actor_member.group_id
       AND group_expense.deleted_at IS NULL
      WHERE actor_member.user_id = v_actor_id
        AND (
          group_expense.paid_by = candidate.candidate_id
          OR EXISTS (
            SELECT 1 FROM public.expense_splits candidate_split
            WHERE candidate_split.expense_id = group_expense.id
              AND candidate_split.user_id = candidate.candidate_id
              AND candidate_split.amount > 0
          )
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlements pair_settlement
      WHERE (pair_settlement.from_user_id = v_actor_id
             AND pair_settlement.to_user_id = candidate.candidate_id)
         OR (pair_settlement.from_user_id = candidate.candidate_id
             AND pair_settlement.to_user_id = v_actor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlement_operations operation
      WHERE (operation.actor_user_id = v_actor_id
             AND operation.friend_user_id = candidate.candidate_id)
         OR (operation.actor_user_id = candidate.candidate_id
             AND operation.friend_user_id = v_actor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlement_scope_transfers transfer
      JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
      WHERE (operation.actor_user_id = v_actor_id
             AND operation.friend_user_id = candidate.candidate_id)
         OR (operation.actor_user_id = candidate.candidate_id
             AND operation.friend_user_id = v_actor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlement_cancellations cancellation
      JOIN public.settlement_operations operation ON operation.id = cancellation.operation_id
      WHERE (operation.actor_user_id = v_actor_id
             AND operation.friend_user_id = candidate.candidate_id)
         OR (operation.actor_user_id = candidate.candidate_id
             AND operation.friend_user_id = v_actor_id)
    )
  ORDER BY candidate.created_at, candidate.friendship_id
  LIMIT 1;
  IF v_friend_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_CLEAN_FRIEND_NOT_FOUND';
  END IF;

  v_group_name := format('Detox Group %s %s %s', p_run_id, p_worker_id, p_test_key);
  v_expense_description := format('Detox Expense %s %s %s', p_run_id, p_worker_id, p_test_key);

  INSERT INTO public.groups (name, description, created_at, updated_at)
  VALUES (v_group_name, v_marker, now(), now())
  RETURNING id INTO v_group_id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, v_actor_id, 'admin'), (v_group_id, v_friend_id, 'member');

  INSERT INTO public.expenses (
    group_id, description, amount, currency, paid_by, created_by, date, notes
  )
  VALUES (
    v_group_id, v_expense_description, 12.00, 'USD', v_actor_id, v_actor_id, now(), v_marker
  )
  RETURNING id INTO v_expense_id;

  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (v_expense_id, v_actor_id, 0.00, 'exact'), (v_expense_id, v_friend_id, 12.00, 'exact');

  INSERT INTO public.e2e_fixture_runs (
    run_id, worker_id, test_key, scenario, marker,
    actor_user_id, friend_user_id, group_id, expense_id
  )
  VALUES (
    p_run_id, p_worker_id, p_test_key, 'outstanding_group_balance', v_marker,
    v_actor_id, v_friend_id, v_group_id, v_expense_id
  );

  SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_friend_id;
  RETURN jsonb_build_object(
    'runId', p_run_id, 'workerId', p_worker_id, 'testKey', p_test_key,
    'scenario', 'outstanding_group_balance', 'marker', v_marker,
    'actorId', v_actor_id, 'friendId', v_friend_id, 'friendName', v_friend_name,
    'groupId', v_group_id, 'groupName', v_group_name,
    'expenseId', v_expense_id, 'expenseDescription', v_expense_description,
    'expectedBalance', 12, 'expectedBalanceDirection', 'friend_owes_you', 'paymentAmount', 12
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_e2e_group_membership(
  p_run_id text,
  p_worker_id text,
  p_test_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_friend_id uuid;
  v_group_id uuid;
  v_existing public.e2e_fixture_runs%ROWTYPE;
  v_friend_name text;
  v_group_name text;
  v_marker text;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_test_key IS NULL OR p_test_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  v_marker := format('e2e:%s:%s:%s', p_run_id, p_worker_id, p_test_key);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  SELECT * INTO v_existing
  FROM public.e2e_fixture_runs run
  WHERE run.run_id = p_run_id
    AND run.worker_id = p_worker_id
    AND run.test_key = p_test_key
    AND run.scenario = 'group_membership'
  FOR UPDATE;

  IF v_existing.run_id IS NOT NULL THEN
    IF v_existing.group_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.groups WHERE id = v_existing.group_id)
       OR NOT EXISTS (
         SELECT 1
         FROM public.group_members member
         WHERE member.group_id = v_existing.group_id
           AND member.user_id = v_existing.friend_user_id
       ) THEN
      RAISE EXCEPTION 'E2E_FIXTURE_INCOMPLETE';
    END IF;

    SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_existing.friend_user_id;
    SELECT g.name INTO v_group_name FROM public.groups g WHERE g.id = v_existing.group_id;
    RETURN jsonb_build_object(
      'runId', v_existing.run_id, 'workerId', v_existing.worker_id,
      'testKey', v_existing.test_key, 'scenario', v_existing.scenario,
      'marker', v_existing.marker,
      'actorId', v_existing.actor_user_id, 'friendId', v_existing.friend_user_id,
      'friendName', v_friend_name, 'groupId', v_existing.group_id,
      'groupName', v_group_name
    );
  END IF;

  SELECT CASE WHEN f.user_id = v_actor_id THEN f.friend_id ELSE f.user_id END
    INTO v_friend_id
  FROM public.friendships f
  JOIN public.users friend ON friend.id = CASE WHEN f.user_id = v_actor_id THEN f.friend_id ELSE f.user_id END
  WHERE f.status = 'accepted'
    AND (f.user_id = v_actor_id OR f.friend_id = v_actor_id)
  ORDER BY f.created_at, f.id
  LIMIT 1;
  IF v_friend_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_FRIEND_NOT_FOUND';
  END IF;

  v_group_name := format('Detox Group %s %s %s', p_run_id, p_worker_id, p_test_key);

  INSERT INTO public.groups (name, description, created_at, updated_at)
  VALUES (v_group_name, v_marker, now(), now())
  RETURNING id INTO v_group_id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, v_actor_id, 'admin'), (v_group_id, v_friend_id, 'member');

  INSERT INTO public.e2e_fixture_runs (
    run_id, worker_id, test_key, scenario, marker,
    actor_user_id, friend_user_id, group_id, expense_id
  )
  VALUES (
    p_run_id, p_worker_id, p_test_key, 'group_membership', v_marker,
    v_actor_id, v_friend_id, v_group_id, NULL
  );

  SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_friend_id;
  RETURN jsonb_build_object(
    'runId', p_run_id, 'workerId', p_worker_id, 'testKey', p_test_key,
    'scenario', 'group_membership', 'marker', v_marker,
    'actorId', v_actor_id, 'friendId', v_friend_id, 'friendName', v_friend_name,
    'groupId', v_group_id, 'groupName', v_group_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_e2e_friendship(
  p_run_id text,
  p_worker_id text,
  p_test_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_friend_id uuid;
  v_existing public.e2e_fixture_runs%ROWTYPE;
  v_friend_name text;
  v_marker text;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_test_key IS NULL OR p_test_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  v_marker := format('e2e:%s:%s:%s', p_run_id, p_worker_id, p_test_key);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  SELECT * INTO v_existing
  FROM public.e2e_fixture_runs run
  WHERE run.run_id = p_run_id
    AND run.worker_id = p_worker_id
    AND run.test_key = p_test_key
    AND run.scenario = 'accepted_friendship'
  FOR UPDATE;

  IF v_existing.run_id IS NOT NULL THEN
    IF v_existing.group_id IS NOT NULL
       OR v_existing.expense_id IS NOT NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.friendships friendship
         WHERE friendship.status = 'accepted'
           AND (
             (friendship.user_id = v_existing.actor_user_id AND friendship.friend_id = v_existing.friend_user_id)
             OR (friendship.user_id = v_existing.friend_user_id AND friendship.friend_id = v_existing.actor_user_id)
           )
       ) THEN
      RAISE EXCEPTION 'E2E_FIXTURE_INCOMPLETE';
    END IF;

    SELECT u.name INTO v_friend_name
    FROM public.users u
    WHERE u.id = v_existing.friend_user_id;
    RETURN jsonb_build_object(
      'runId', v_existing.run_id,
      'workerId', v_existing.worker_id,
      'testKey', v_existing.test_key,
      'scenario', v_existing.scenario,
      'marker', v_existing.marker,
      'actorId', v_existing.actor_user_id,
      'friendId', v_existing.friend_user_id,
      'friendName', v_friend_name,
      'groupId', NULL,
      'expenseId', NULL
    );
  END IF;

  SELECT CASE WHEN friendship.user_id = v_actor_id THEN friendship.friend_id ELSE friendship.user_id END
    INTO v_friend_id
  FROM public.friendships friendship
  JOIN public.users friend
    ON friend.id = CASE WHEN friendship.user_id = v_actor_id THEN friendship.friend_id ELSE friendship.user_id END
  WHERE friendship.status = 'accepted'
    AND (friendship.user_id = v_actor_id OR friendship.friend_id = v_actor_id)
  ORDER BY friendship.created_at, friendship.id
  LIMIT 1;
  IF v_friend_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_FRIEND_NOT_FOUND';
  END IF;

  INSERT INTO public.e2e_fixture_runs (
    run_id, worker_id, test_key, scenario, marker,
    actor_user_id, friend_user_id, group_id, expense_id
  )
  VALUES (
    p_run_id, p_worker_id, p_test_key, 'accepted_friendship', v_marker,
    v_actor_id, v_friend_id, NULL, NULL
  );

  SELECT u.name INTO v_friend_name
  FROM public.users u
  WHERE u.id = v_friend_id;
  RETURN jsonb_build_object(
    'runId', p_run_id,
    'workerId', p_worker_id,
    'testKey', p_test_key,
    'scenario', 'accepted_friendship',
    'marker', v_marker,
    'actorId', v_actor_id,
    'friendId', v_friend_id,
    'friendName', v_friend_name,
    'groupId', NULL,
    'expenseId', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_e2e_settlement_reversal(
  p_run_id text,
  p_worker_id text,
  p_test_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_existing public.e2e_fixture_runs%ROWTYPE;
  v_base jsonb;
  v_group_id uuid;
  v_expense_id uuid;
  v_friend_id uuid;
  v_friend_name text;
  v_group_name text;
  v_expense_description text;
  v_marker text;
  v_payment_intent_id uuid;
  v_receipt jsonb;
  v_operation_id uuid;
  v_direct_expense_id uuid;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_test_key IS NULL OR p_test_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  v_marker := format('e2e:%s:%s:%s', p_run_id, p_worker_id, p_test_key);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  SELECT * INTO v_existing
  FROM public.e2e_fixture_runs run
  WHERE run.run_id = p_run_id
    AND run.worker_id = p_worker_id
    AND run.test_key = p_test_key
    AND run.scenario = 'settlement_reversal'
    AND run.actor_user_id = v_actor_id
  FOR UPDATE;

  IF v_existing.run_id IS NOT NULL THEN
    IF v_existing.group_id IS NULL
       OR v_existing.expense_id IS NULL
       OR v_existing.settlement_operation_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.groups WHERE id = v_existing.group_id)
       OR NOT EXISTS (SELECT 1 FROM public.expenses WHERE id = v_existing.expense_id)
       OR NOT EXISTS (
         SELECT 1 FROM public.settlement_operations operation
         WHERE operation.id = v_existing.settlement_operation_id
           AND operation.status = 'committed'
       ) THEN
      RAISE EXCEPTION 'E2E_FIXTURE_INCOMPLETE';
    END IF;

    SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_existing.friend_user_id;
    SELECT g.name INTO v_group_name FROM public.groups g WHERE g.id = v_existing.group_id;
    SELECT e.description INTO v_expense_description FROM public.expenses e WHERE e.id = v_existing.expense_id;
    RETURN jsonb_build_object(
      'runId', v_existing.run_id, 'workerId', v_existing.worker_id,
      'testKey', v_existing.test_key, 'scenario', v_existing.scenario,
      'marker', v_existing.marker, 'actorId', v_existing.actor_user_id,
      'friendId', v_existing.friend_user_id, 'friendName', v_friend_name,
      'groupId', v_existing.group_id, 'groupName', v_group_name,
      'expenseId', v_existing.expense_id, 'expenseDescription', v_expense_description,
      'operationId', v_existing.settlement_operation_id,
      'expectedBalanceBeforeReversal', 0, 'expectedBalanceAfterReversal', 12
    );
  END IF;

  v_base := public.seed_e2e_outstanding_group(p_run_id, p_worker_id, p_test_key);
  v_group_id := (v_base->>'groupId')::uuid;
  v_expense_id := (v_base->>'expenseId')::uuid;
  v_friend_id := (v_base->>'friendId')::uuid;

  UPDATE public.e2e_fixture_runs
  SET scenario = 'settlement_reversal'
  WHERE run_id = p_run_id
    AND worker_id = p_worker_id
    AND test_key = p_test_key
    AND scenario = 'outstanding_group_balance'
    AND actor_user_id = v_actor_id;

  -- A deterministic UUID makes a repeated request reuse the same canonical
  -- settlement operation while retaining the fixture's run isolation.
  v_payment_intent_id := format('%s-%s-%s-%s-%s',
    substr(md5(v_marker || ':payment'), 1, 8),
    substr(md5(v_marker || ':payment'), 9, 4),
    substr(md5(v_marker || ':payment'), 13, 4),
    substr(md5(v_marker || ':payment'), 17, 4),
    substr(md5(v_marker || ':payment'), 21, 12)
  )::uuid;

  -- Dedicated cancellation surface: the server owns the allocation plan.
  -- The direct scope is zero here, so the full 12.00 payment allocates
  -- in-group (friend pays actor) with no residual and therefore no
  -- cancellation legs; p_transfers stays frozen-empty. Reversal restores
  -- the 12.00 group balance.
  v_receipt := public.commit_settlement_operation(
    v_payment_intent_id,
    v_friend_id,
    NULL,
    'all_balances',
    12.00,
    'USD',
    now(),
    12.00,
    jsonb_build_array(jsonb_build_object(
      'groupId', v_group_id,
      'fromUserId', v_friend_id,
      'toUserId', v_actor_id,
      'amount', 12.00,
      'currency', 'USD'
    )),
    '[]'::jsonb,
    '[]'::jsonb
  );
  v_operation_id := NULLIF(v_receipt->>'operationId', '')::uuid;
  IF v_operation_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_SETTLEMENT_OPERATION_MISSING';
  END IF;

  UPDATE public.e2e_fixture_runs
  SET settlement_operation_id = v_operation_id
  WHERE run_id = p_run_id
    AND worker_id = p_worker_id
    AND test_key = p_test_key
    AND scenario = 'settlement_reversal'
    AND actor_user_id = v_actor_id;

  SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_friend_id;
  RETURN jsonb_build_object(
    'runId', p_run_id, 'workerId', p_worker_id, 'testKey', p_test_key,
    'scenario', 'settlement_reversal', 'marker', v_marker,
    'actorId', v_actor_id, 'friendId', v_friend_id, 'friendName', v_friend_name,
    'groupId', v_group_id, 'groupName', v_base->>'groupName',
    'expenseId', v_expense_id, 'expenseDescription', v_base->>'expenseDescription',
    'operationId', v_operation_id,
    'expectedBalanceBeforeReversal', 0, 'expectedBalanceAfterReversal', 12
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_e2e_fixture_run(
  p_run_id text,
  p_worker_id text DEFAULT NULL,
  p_test_key text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_run_ids text[];
  v_group_ids uuid[];
  v_expense_ids uuid[];
  v_operation_ids uuid[];
  v_ui_operation_ids uuid[];
  v_legacy_settlement_ids uuid[];
  v_legacy_activity_ids uuid[];
  v_payment_intent_ids uuid[];
  v_deleted integer := 0;
  v_scenario_count integer := 0;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();
  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  SELECT count(*)::integer,
         coalesce(array_agg(run.run_id), '{}'),
         coalesce(array_agg(run.group_id) FILTER (WHERE run.group_id IS NOT NULL), '{}'),
         coalesce(array_agg(run.expense_id) FILTER (WHERE run.expense_id IS NOT NULL), '{}'),
         coalesce(array_agg(run.settlement_operation_id) FILTER (WHERE run.settlement_operation_id IS NOT NULL), '{}')
    INTO v_scenario_count, v_run_ids, v_group_ids, v_expense_ids
         , v_operation_ids
  FROM public.e2e_fixture_runs run
  WHERE run.actor_user_id = v_actor_id
    AND run.run_id = p_run_id
    AND (p_worker_id IS NULL OR run.worker_id = p_worker_id)
    AND (p_test_key IS NULL OR run.test_key = p_test_key);

  -- The UI creates its operation after the seed RPC returns, so its ID is not
  -- available in e2e_fixture_runs.settlement_operation_id. Discover only
  -- operations tied to this run's unique group and actor/friend pair.
  SELECT coalesce(array_agg(DISTINCT operation.id), '{}')
    INTO v_ui_operation_ids
  FROM public.settlement_operations operation
  WHERE EXISTS (
    SELECT 1
    FROM public.e2e_fixture_runs run
    WHERE run.actor_user_id = v_actor_id
      AND run.run_id = p_run_id
      AND (p_worker_id IS NULL OR run.worker_id = p_worker_id)
      AND (p_test_key IS NULL OR run.test_key = p_test_key)
      AND (
        (operation.actor_user_id = run.actor_user_id
         AND operation.friend_user_id = run.friend_user_id)
        OR (operation.actor_user_id = run.friend_user_id
            AND operation.friend_user_id = run.actor_user_id)
      )
      AND (
        operation.group_id = run.group_id
        OR EXISTS (
          SELECT 1
          FROM public.settlement_scope_transfers transfer
          WHERE transfer.operation_id = operation.id
            AND transfer.group_id = run.group_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.settlement_cancellations cancellation
          WHERE cancellation.operation_id = operation.id
            AND cancellation.group_id = run.group_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.settlements settlement
          WHERE settlement.operation_id = operation.id
            AND settlement.group_id = run.group_id
        )
      )
  );
  v_operation_ids := v_operation_ids || v_ui_operation_ids;

  -- The legacy group-settle UI writes a direct settlement without the newer
  -- operation/group/commitment links. Its only fixture-owned link is the
  -- settlement_created Activity, so discover exactly those rows before the
  -- fixture Group is removed (activities.group_id would otherwise be nulled).
  SELECT coalesce(array_agg(DISTINCT settlement.id), '{}'),
         coalesce(array_agg(DISTINCT activity.id), '{}')
    INTO v_legacy_settlement_ids, v_legacy_activity_ids
  FROM public.e2e_fixture_runs run
  JOIN public.groups fixture_group
    ON fixture_group.id = run.group_id
  JOIN public.activities activity
    ON (
      activity.group_id = run.group_id
      OR activity.group_name = fixture_group.name
    )
   AND activity.type = 'settlement_created'
  JOIN public.settlements settlement
    ON settlement.id = activity.target_id
  WHERE run.actor_user_id = v_actor_id
    AND run.run_id = p_run_id
    AND (p_worker_id IS NULL OR run.worker_id = p_worker_id)
    AND (p_test_key IS NULL OR run.test_key = p_test_key)
    AND (
      settlement.group_id = run.group_id
      OR settlement.group_id IS NULL
    )
    AND settlement.operation_id IS NULL
    AND settlement.commitment_id IS NULL
    AND (
      (settlement.from_user_id = run.actor_user_id
       AND settlement.to_user_id = run.friend_user_id)
      OR (settlement.from_user_id = run.friend_user_id
          AND settlement.to_user_id = run.actor_user_id)
    );

  -- Activities do not own their target settlement, so remove the activity
  -- first and then the legacy settlement while the fixture pair is known.
  IF coalesce(array_length(v_legacy_activity_ids, 1), 0) > 0 THEN
    DELETE FROM public.activities
    WHERE id = ANY(v_legacy_activity_ids);
  END IF;
  IF coalesce(array_length(v_legacy_settlement_ids, 1), 0) > 0 THEN
    DELETE FROM public.settlements
    WHERE id = ANY(v_legacy_settlement_ids);
  END IF;

  IF coalesce(array_length(v_operation_ids, 1), 0) > 0 THEN
    SELECT coalesce(array_agg(operation.payment_intent_id), '{}')
      INTO v_payment_intent_ids
    FROM public.settlement_operations operation
    WHERE operation.id = ANY(v_operation_ids);

    DELETE FROM public.settlement_operation_reversals
    WHERE operation_id = ANY(v_operation_ids);
    DELETE FROM public.settlement_scope_transfers
    WHERE operation_id = ANY(v_operation_ids);
    DELETE FROM public.settlement_cancellations
    WHERE operation_id = ANY(v_operation_ids);
    DELETE FROM public.settlements
    WHERE operation_id = ANY(v_operation_ids);
    DELETE FROM public.settlement_operations
    WHERE id = ANY(v_operation_ids);
    IF coalesce(array_length(v_payment_intent_ids, 1), 0) > 0 THEN
      DELETE FROM public.settlement_commitments
      WHERE payment_intent_id = ANY(v_payment_intent_ids);
    END IF;
  END IF;

  IF coalesce(array_length(v_expense_ids, 1), 0) > 0 THEN
    DELETE FROM public.expense_splits WHERE expense_id = ANY(v_expense_ids);
    DELETE FROM public.expenses WHERE id = ANY(v_expense_ids);
  END IF;
  IF coalesce(array_length(v_group_ids, 1), 0) > 0 THEN
    DELETE FROM public.group_members WHERE group_id = ANY(v_group_ids);
    DELETE FROM public.groups WHERE id = ANY(v_group_ids);
  END IF;
  DELETE FROM public.e2e_fixture_runs
  WHERE actor_user_id = v_actor_id
    AND run_id = ANY(v_run_ids)
    AND (p_worker_id IS NULL OR worker_id = p_worker_id)
    AND (p_test_key IS NULL OR test_key = p_test_key);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_scenario_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_e2e_stale_fixture_runs(
  p_before timestamptz,
  p_run_id text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_deleted integer;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();
  IF p_before IS NULL OR p_before >= now() - interval '1 hour'
     OR p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_STALE_RUN_REQUIRES_EXPLICIT_OLD_RUN';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.e2e_fixture_runs run
    WHERE run.actor_user_id = v_actor_id
      AND run.run_id = p_run_id
      AND run.created_at < p_before
  ) THEN
    RAISE EXCEPTION 'E2E_FIXTURE_STALE_RUN_NOT_FOUND';
  END IF;
  -- Stale cleanup is never a broad sweep: the caller must name one old run.
  SELECT public.purge_e2e_fixture_run(p_run_id) INTO v_deleted;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_fixture_actor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.e2e_fixture_require_development() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.configure_e2e_fixture_account(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seed_e2e_outstanding_group(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.seed_e2e_group_membership(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.seed_e2e_friendship(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.seed_e2e_settlement_reversal(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.purge_e2e_fixture_run(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.purge_e2e_stale_fixture_runs(timestamptz, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.seed_e2e_outstanding_group(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_e2e_group_membership(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_e2e_friendship(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_e2e_settlement_reversal(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_e2e_fixture_run(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_e2e_stale_fixture_runs(timestamptz, text) TO authenticated;
-- END inlined supabase/fixtures/e2e-run-scoped-fixtures.sql (copy 1 of 2)
-- Re-running the install must preserve the same grants and revocations.
-- BEGIN inlined supabase/fixtures/e2e-run-scoped-fixtures.sql (copy 2 of 2)
-- Run-scoped E2E fixtures. Development SQL editor only.
--
-- This file is intentionally not a migration. The settings and account rows
-- below are the deployment boundary: until a developer enables this fixture
-- for the development project and explicitly allowlists an E2E account, the
-- security-definer functions refuse every request. Never run this file on a
-- production project.

CREATE TABLE IF NOT EXISTS public.e2e_fixture_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  environment text NOT NULL CHECK (environment = 'development'),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.e2e_fixture_accounts (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.e2e_fixture_runs (
  run_id text NOT NULL,
  worker_id text NOT NULL,
  test_key text NOT NULL,
  scenario text NOT NULL CHECK (scenario IN ('accepted_friendship', 'group_membership', 'outstanding_group_balance', 'settlement_reversal')),
  marker text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  settlement_operation_id uuid REFERENCES public.settlement_operations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, worker_id, test_key, scenario),
  UNIQUE (marker),
  CHECK (run_id <> '' AND worker_id <> '' AND test_key <> ''),
  CHECK (actor_user_id <> friend_user_id)
);

-- Keep an already-installed Ticket 03 fixture compatible with the later
-- membership and settlement-reversal scenarios.
ALTER TABLE public.e2e_fixture_runs
  DROP CONSTRAINT IF EXISTS e2e_fixture_runs_scenario_check;
ALTER TABLE public.e2e_fixture_runs
  ADD CONSTRAINT e2e_fixture_runs_scenario_check
  CHECK (scenario IN ('accepted_friendship', 'group_membership', 'outstanding_group_balance', 'settlement_reversal'));

ALTER TABLE public.e2e_fixture_runs
  ADD COLUMN IF NOT EXISTS settlement_operation_id uuid
  REFERENCES public.settlement_operations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_e2e_fixture_runs_actor_run
  ON public.e2e_fixture_runs(actor_user_id, run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_e2e_fixture_runs_created_at
  ON public.e2e_fixture_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_e2e_fixture_runs_group
  ON public.e2e_fixture_runs(group_id);
CREATE INDEX IF NOT EXISTS idx_e2e_fixture_runs_expense
  ON public.e2e_fixture_runs(expense_id);

ALTER TABLE public.e2e_fixture_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_fixture_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_fixture_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.e2e_fixture_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.e2e_fixture_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.e2e_fixture_runs FROM PUBLIC, anon, authenticated;

-- The install portion above is executable without placeholders. Enable the
-- boundary and allowlist an account separately with the setup file after
-- verifying the SQL Editor is connected to the development project.

CREATE OR REPLACE FUNCTION public.configure_e2e_fixture_account(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_user_id uuid;
  v_app_user_id uuid;
BEGIN
  IF p_email IS NULL OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
     OR p_email LIKE 'REPLACE_%' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_ACCOUNT_EMAIL_REQUIRED';
  END IF;

  SELECT au.id, u.id
    INTO v_auth_user_id, v_app_user_id
  FROM auth.users au
  JOIN public.users u ON u.auth_user_id = au.id
  WHERE lower(btrim(au.email)) = lower(btrim(p_email))
  LIMIT 1;

  IF v_auth_user_id IS NULL OR v_app_user_id IS NULL THEN
    RAISE EXCEPTION 'Expected an existing authenticated E2E account profile';
  END IF;

  INSERT INTO public.e2e_fixture_accounts (auth_user_id, app_user_id, enabled)
  VALUES (v_auth_user_id, v_app_user_id, true)
  ON CONFLICT (auth_user_id) DO UPDATE
  SET app_user_id = EXCLUDED.app_user_id,
      enabled = true;
END $$;

CREATE OR REPLACE FUNCTION public.e2e_fixture_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_UNAUTHENTICATED';
  END IF;

  SELECT account.app_user_id
    INTO v_actor
  FROM public.e2e_fixture_accounts account
  WHERE account.auth_user_id = (SELECT auth.uid())
    AND account.enabled;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_ACCOUNT_NOT_APPROVED';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.e2e_fixture_require_development()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.e2e_fixture_settings settings
    WHERE settings.id
      AND settings.enabled
      AND settings.environment = 'development'
  ) THEN
    RAISE EXCEPTION 'E2E_FIXTURE_DEVELOPMENT_ONLY';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_e2e_outstanding_group(
  p_run_id text,
  p_worker_id text,
  p_test_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_friend_id uuid;
  v_group_id uuid;
  v_expense_id uuid;
  v_existing public.e2e_fixture_runs%ROWTYPE;
  v_friend_name text;
  v_group_name text;
  v_expense_description text;
  v_marker text;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_test_key IS NULL OR p_test_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  v_marker := format('e2e:%s:%s:%s', p_run_id, p_worker_id, p_test_key);
  -- Serialize a repeated request and a concurrent request for the same
  -- scenario key before the idempotent row lookup/creation.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  SELECT * INTO v_existing
  FROM public.e2e_fixture_runs run
  WHERE run.run_id = p_run_id
    AND run.worker_id = p_worker_id
    AND run.test_key = p_test_key
    AND run.scenario = 'outstanding_group_balance'
  FOR UPDATE;

  IF v_existing.run_id IS NOT NULL THEN
    IF v_existing.group_id IS NULL OR v_existing.expense_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.groups WHERE id = v_existing.group_id)
       OR NOT EXISTS (SELECT 1 FROM public.expenses WHERE id = v_existing.expense_id) THEN
      RAISE EXCEPTION 'E2E_FIXTURE_INCOMPLETE';
    END IF;

    SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_existing.friend_user_id;
    SELECT g.name INTO v_group_name FROM public.groups g WHERE g.id = v_existing.group_id;
    SELECT e.description INTO v_expense_description FROM public.expenses e WHERE e.id = v_existing.expense_id;
    RETURN jsonb_build_object(
      'runId', v_existing.run_id, 'workerId', v_existing.worker_id,
      'testKey', v_existing.test_key, 'scenario', v_existing.scenario,
      'marker', v_existing.marker,
      'actorId', v_existing.actor_user_id, 'friendId', v_existing.friend_user_id,
      'friendName', v_friend_name, 'groupId', v_existing.group_id,
      'groupName', v_group_name, 'expenseId', v_existing.expense_id,
      'expenseDescription', v_expense_description,
      'expectedBalance', 12, 'expectedBalanceDirection', 'friend_owes_you', 'paymentAmount', 12
    );
  END IF;

  WITH accepted_friends AS (
    SELECT CASE WHEN f.user_id = v_actor_id THEN f.friend_id ELSE f.user_id END AS candidate_id,
           f.created_at,
           f.id AS friendship_id
    FROM public.friendships f
    JOIN public.users friend
      ON friend.id = CASE WHEN f.user_id = v_actor_id THEN f.friend_id ELSE f.user_id END
    WHERE f.status = 'accepted'
      AND (f.user_id = v_actor_id OR f.friend_id = v_actor_id)
  )
  SELECT candidate.candidate_id
    INTO v_friend_id
  FROM accepted_friends candidate
  WHERE NOT EXISTS (
      SELECT 1
      FROM public.expenses direct_expense
      WHERE direct_expense.group_id IS NULL
        AND direct_expense.deleted_at IS NULL
        AND (
          (direct_expense.paid_by = v_actor_id AND EXISTS (
            SELECT 1 FROM public.expense_splits candidate_split
            WHERE candidate_split.expense_id = direct_expense.id
              AND candidate_split.user_id = candidate.candidate_id
              AND candidate_split.amount > 0
          ))
          OR (direct_expense.paid_by = candidate.candidate_id AND EXISTS (
            SELECT 1 FROM public.expense_splits actor_split
            WHERE actor_split.expense_id = direct_expense.id
              AND actor_split.user_id = v_actor_id
              AND actor_split.amount > 0
          ))
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.group_members actor_member
      JOIN public.group_members candidate_member
        ON candidate_member.group_id = actor_member.group_id
       AND candidate_member.user_id = candidate.candidate_id
      JOIN public.expenses group_expense
        ON group_expense.group_id = actor_member.group_id
       AND group_expense.deleted_at IS NULL
      WHERE actor_member.user_id = v_actor_id
        AND (
          group_expense.paid_by = candidate.candidate_id
          OR EXISTS (
            SELECT 1 FROM public.expense_splits candidate_split
            WHERE candidate_split.expense_id = group_expense.id
              AND candidate_split.user_id = candidate.candidate_id
              AND candidate_split.amount > 0
          )
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlements pair_settlement
      WHERE (pair_settlement.from_user_id = v_actor_id
             AND pair_settlement.to_user_id = candidate.candidate_id)
         OR (pair_settlement.from_user_id = candidate.candidate_id
             AND pair_settlement.to_user_id = v_actor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlement_operations operation
      WHERE (operation.actor_user_id = v_actor_id
             AND operation.friend_user_id = candidate.candidate_id)
         OR (operation.actor_user_id = candidate.candidate_id
             AND operation.friend_user_id = v_actor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlement_scope_transfers transfer
      JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
      WHERE (operation.actor_user_id = v_actor_id
             AND operation.friend_user_id = candidate.candidate_id)
         OR (operation.actor_user_id = candidate.candidate_id
             AND operation.friend_user_id = v_actor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlement_cancellations cancellation
      JOIN public.settlement_operations operation ON operation.id = cancellation.operation_id
      WHERE (operation.actor_user_id = v_actor_id
             AND operation.friend_user_id = candidate.candidate_id)
         OR (operation.actor_user_id = candidate.candidate_id
             AND operation.friend_user_id = v_actor_id)
    )
  ORDER BY candidate.created_at, candidate.friendship_id
  LIMIT 1;
  IF v_friend_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_CLEAN_FRIEND_NOT_FOUND';
  END IF;

  v_group_name := format('Detox Group %s %s %s', p_run_id, p_worker_id, p_test_key);
  v_expense_description := format('Detox Expense %s %s %s', p_run_id, p_worker_id, p_test_key);

  INSERT INTO public.groups (name, description, created_at, updated_at)
  VALUES (v_group_name, v_marker, now(), now())
  RETURNING id INTO v_group_id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, v_actor_id, 'admin'), (v_group_id, v_friend_id, 'member');

  INSERT INTO public.expenses (
    group_id, description, amount, currency, paid_by, created_by, date, notes
  )
  VALUES (
    v_group_id, v_expense_description, 12.00, 'USD', v_actor_id, v_actor_id, now(), v_marker
  )
  RETURNING id INTO v_expense_id;

  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (v_expense_id, v_actor_id, 0.00, 'exact'), (v_expense_id, v_friend_id, 12.00, 'exact');

  INSERT INTO public.e2e_fixture_runs (
    run_id, worker_id, test_key, scenario, marker,
    actor_user_id, friend_user_id, group_id, expense_id
  )
  VALUES (
    p_run_id, p_worker_id, p_test_key, 'outstanding_group_balance', v_marker,
    v_actor_id, v_friend_id, v_group_id, v_expense_id
  );

  SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_friend_id;
  RETURN jsonb_build_object(
    'runId', p_run_id, 'workerId', p_worker_id, 'testKey', p_test_key,
    'scenario', 'outstanding_group_balance', 'marker', v_marker,
    'actorId', v_actor_id, 'friendId', v_friend_id, 'friendName', v_friend_name,
    'groupId', v_group_id, 'groupName', v_group_name,
    'expenseId', v_expense_id, 'expenseDescription', v_expense_description,
    'expectedBalance', 12, 'expectedBalanceDirection', 'friend_owes_you', 'paymentAmount', 12
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_e2e_group_membership(
  p_run_id text,
  p_worker_id text,
  p_test_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_friend_id uuid;
  v_group_id uuid;
  v_existing public.e2e_fixture_runs%ROWTYPE;
  v_friend_name text;
  v_group_name text;
  v_marker text;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_test_key IS NULL OR p_test_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  v_marker := format('e2e:%s:%s:%s', p_run_id, p_worker_id, p_test_key);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  SELECT * INTO v_existing
  FROM public.e2e_fixture_runs run
  WHERE run.run_id = p_run_id
    AND run.worker_id = p_worker_id
    AND run.test_key = p_test_key
    AND run.scenario = 'group_membership'
  FOR UPDATE;

  IF v_existing.run_id IS NOT NULL THEN
    IF v_existing.group_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.groups WHERE id = v_existing.group_id)
       OR NOT EXISTS (
         SELECT 1
         FROM public.group_members member
         WHERE member.group_id = v_existing.group_id
           AND member.user_id = v_existing.friend_user_id
       ) THEN
      RAISE EXCEPTION 'E2E_FIXTURE_INCOMPLETE';
    END IF;

    SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_existing.friend_user_id;
    SELECT g.name INTO v_group_name FROM public.groups g WHERE g.id = v_existing.group_id;
    RETURN jsonb_build_object(
      'runId', v_existing.run_id, 'workerId', v_existing.worker_id,
      'testKey', v_existing.test_key, 'scenario', v_existing.scenario,
      'marker', v_existing.marker,
      'actorId', v_existing.actor_user_id, 'friendId', v_existing.friend_user_id,
      'friendName', v_friend_name, 'groupId', v_existing.group_id,
      'groupName', v_group_name
    );
  END IF;

  SELECT CASE WHEN f.user_id = v_actor_id THEN f.friend_id ELSE f.user_id END
    INTO v_friend_id
  FROM public.friendships f
  JOIN public.users friend ON friend.id = CASE WHEN f.user_id = v_actor_id THEN f.friend_id ELSE f.user_id END
  WHERE f.status = 'accepted'
    AND (f.user_id = v_actor_id OR f.friend_id = v_actor_id)
  ORDER BY f.created_at, f.id
  LIMIT 1;
  IF v_friend_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_FRIEND_NOT_FOUND';
  END IF;

  v_group_name := format('Detox Group %s %s %s', p_run_id, p_worker_id, p_test_key);

  INSERT INTO public.groups (name, description, created_at, updated_at)
  VALUES (v_group_name, v_marker, now(), now())
  RETURNING id INTO v_group_id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, v_actor_id, 'admin'), (v_group_id, v_friend_id, 'member');

  INSERT INTO public.e2e_fixture_runs (
    run_id, worker_id, test_key, scenario, marker,
    actor_user_id, friend_user_id, group_id, expense_id
  )
  VALUES (
    p_run_id, p_worker_id, p_test_key, 'group_membership', v_marker,
    v_actor_id, v_friend_id, v_group_id, NULL
  );

  SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_friend_id;
  RETURN jsonb_build_object(
    'runId', p_run_id, 'workerId', p_worker_id, 'testKey', p_test_key,
    'scenario', 'group_membership', 'marker', v_marker,
    'actorId', v_actor_id, 'friendId', v_friend_id, 'friendName', v_friend_name,
    'groupId', v_group_id, 'groupName', v_group_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_e2e_friendship(
  p_run_id text,
  p_worker_id text,
  p_test_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_friend_id uuid;
  v_existing public.e2e_fixture_runs%ROWTYPE;
  v_friend_name text;
  v_marker text;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_test_key IS NULL OR p_test_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  v_marker := format('e2e:%s:%s:%s', p_run_id, p_worker_id, p_test_key);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  SELECT * INTO v_existing
  FROM public.e2e_fixture_runs run
  WHERE run.run_id = p_run_id
    AND run.worker_id = p_worker_id
    AND run.test_key = p_test_key
    AND run.scenario = 'accepted_friendship'
  FOR UPDATE;

  IF v_existing.run_id IS NOT NULL THEN
    IF v_existing.group_id IS NOT NULL
       OR v_existing.expense_id IS NOT NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.friendships friendship
         WHERE friendship.status = 'accepted'
           AND (
             (friendship.user_id = v_existing.actor_user_id AND friendship.friend_id = v_existing.friend_user_id)
             OR (friendship.user_id = v_existing.friend_user_id AND friendship.friend_id = v_existing.actor_user_id)
           )
       ) THEN
      RAISE EXCEPTION 'E2E_FIXTURE_INCOMPLETE';
    END IF;

    SELECT u.name INTO v_friend_name
    FROM public.users u
    WHERE u.id = v_existing.friend_user_id;
    RETURN jsonb_build_object(
      'runId', v_existing.run_id,
      'workerId', v_existing.worker_id,
      'testKey', v_existing.test_key,
      'scenario', v_existing.scenario,
      'marker', v_existing.marker,
      'actorId', v_existing.actor_user_id,
      'friendId', v_existing.friend_user_id,
      'friendName', v_friend_name,
      'groupId', NULL,
      'expenseId', NULL
    );
  END IF;

  SELECT CASE WHEN friendship.user_id = v_actor_id THEN friendship.friend_id ELSE friendship.user_id END
    INTO v_friend_id
  FROM public.friendships friendship
  JOIN public.users friend
    ON friend.id = CASE WHEN friendship.user_id = v_actor_id THEN friendship.friend_id ELSE friendship.user_id END
  WHERE friendship.status = 'accepted'
    AND (friendship.user_id = v_actor_id OR friendship.friend_id = v_actor_id)
  ORDER BY friendship.created_at, friendship.id
  LIMIT 1;
  IF v_friend_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_FRIEND_NOT_FOUND';
  END IF;

  INSERT INTO public.e2e_fixture_runs (
    run_id, worker_id, test_key, scenario, marker,
    actor_user_id, friend_user_id, group_id, expense_id
  )
  VALUES (
    p_run_id, p_worker_id, p_test_key, 'accepted_friendship', v_marker,
    v_actor_id, v_friend_id, NULL, NULL
  );

  SELECT u.name INTO v_friend_name
  FROM public.users u
  WHERE u.id = v_friend_id;
  RETURN jsonb_build_object(
    'runId', p_run_id,
    'workerId', p_worker_id,
    'testKey', p_test_key,
    'scenario', 'accepted_friendship',
    'marker', v_marker,
    'actorId', v_actor_id,
    'friendId', v_friend_id,
    'friendName', v_friend_name,
    'groupId', NULL,
    'expenseId', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_e2e_settlement_reversal(
  p_run_id text,
  p_worker_id text,
  p_test_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_existing public.e2e_fixture_runs%ROWTYPE;
  v_base jsonb;
  v_group_id uuid;
  v_expense_id uuid;
  v_friend_id uuid;
  v_friend_name text;
  v_group_name text;
  v_expense_description text;
  v_marker text;
  v_payment_intent_id uuid;
  v_receipt jsonb;
  v_operation_id uuid;
  v_direct_expense_id uuid;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     OR p_test_key IS NULL OR p_test_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  v_marker := format('e2e:%s:%s:%s', p_run_id, p_worker_id, p_test_key);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  SELECT * INTO v_existing
  FROM public.e2e_fixture_runs run
  WHERE run.run_id = p_run_id
    AND run.worker_id = p_worker_id
    AND run.test_key = p_test_key
    AND run.scenario = 'settlement_reversal'
    AND run.actor_user_id = v_actor_id
  FOR UPDATE;

  IF v_existing.run_id IS NOT NULL THEN
    IF v_existing.group_id IS NULL
       OR v_existing.expense_id IS NULL
       OR v_existing.settlement_operation_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.groups WHERE id = v_existing.group_id)
       OR NOT EXISTS (SELECT 1 FROM public.expenses WHERE id = v_existing.expense_id)
       OR NOT EXISTS (
         SELECT 1 FROM public.settlement_operations operation
         WHERE operation.id = v_existing.settlement_operation_id
           AND operation.status = 'committed'
       ) THEN
      RAISE EXCEPTION 'E2E_FIXTURE_INCOMPLETE';
    END IF;

    SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_existing.friend_user_id;
    SELECT g.name INTO v_group_name FROM public.groups g WHERE g.id = v_existing.group_id;
    SELECT e.description INTO v_expense_description FROM public.expenses e WHERE e.id = v_existing.expense_id;
    RETURN jsonb_build_object(
      'runId', v_existing.run_id, 'workerId', v_existing.worker_id,
      'testKey', v_existing.test_key, 'scenario', v_existing.scenario,
      'marker', v_existing.marker, 'actorId', v_existing.actor_user_id,
      'friendId', v_existing.friend_user_id, 'friendName', v_friend_name,
      'groupId', v_existing.group_id, 'groupName', v_group_name,
      'expenseId', v_existing.expense_id, 'expenseDescription', v_expense_description,
      'operationId', v_existing.settlement_operation_id,
      'expectedBalanceBeforeReversal', 0, 'expectedBalanceAfterReversal', 12
    );
  END IF;

  v_base := public.seed_e2e_outstanding_group(p_run_id, p_worker_id, p_test_key);
  v_group_id := (v_base->>'groupId')::uuid;
  v_expense_id := (v_base->>'expenseId')::uuid;
  v_friend_id := (v_base->>'friendId')::uuid;

  UPDATE public.e2e_fixture_runs
  SET scenario = 'settlement_reversal'
  WHERE run_id = p_run_id
    AND worker_id = p_worker_id
    AND test_key = p_test_key
    AND scenario = 'outstanding_group_balance'
    AND actor_user_id = v_actor_id;

  -- A deterministic UUID makes a repeated request reuse the same canonical
  -- settlement operation while retaining the fixture's run isolation.
  v_payment_intent_id := format('%s-%s-%s-%s-%s',
    substr(md5(v_marker || ':payment'), 1, 8),
    substr(md5(v_marker || ':payment'), 9, 4),
    substr(md5(v_marker || ':payment'), 13, 4),
    substr(md5(v_marker || ':payment'), 17, 4),
    substr(md5(v_marker || ':payment'), 21, 12)
  )::uuid;

  -- Dedicated cancellation surface: the server owns the allocation plan.
  -- The direct scope is zero here, so the full 12.00 payment allocates
  -- in-group (friend pays actor) with no residual and therefore no
  -- cancellation legs; p_transfers stays frozen-empty. Reversal restores
  -- the 12.00 group balance.
  v_receipt := public.commit_settlement_operation(
    v_payment_intent_id,
    v_friend_id,
    NULL,
    'all_balances',
    12.00,
    'USD',
    now(),
    12.00,
    jsonb_build_array(jsonb_build_object(
      'groupId', v_group_id,
      'fromUserId', v_friend_id,
      'toUserId', v_actor_id,
      'amount', 12.00,
      'currency', 'USD'
    )),
    '[]'::jsonb,
    '[]'::jsonb
  );
  v_operation_id := NULLIF(v_receipt->>'operationId', '')::uuid;
  IF v_operation_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FIXTURE_SETTLEMENT_OPERATION_MISSING';
  END IF;

  UPDATE public.e2e_fixture_runs
  SET settlement_operation_id = v_operation_id
  WHERE run_id = p_run_id
    AND worker_id = p_worker_id
    AND test_key = p_test_key
    AND scenario = 'settlement_reversal'
    AND actor_user_id = v_actor_id;

  SELECT u.name INTO v_friend_name FROM public.users u WHERE u.id = v_friend_id;
  RETURN jsonb_build_object(
    'runId', p_run_id, 'workerId', p_worker_id, 'testKey', p_test_key,
    'scenario', 'settlement_reversal', 'marker', v_marker,
    'actorId', v_actor_id, 'friendId', v_friend_id, 'friendName', v_friend_name,
    'groupId', v_group_id, 'groupName', v_base->>'groupName',
    'expenseId', v_expense_id, 'expenseDescription', v_base->>'expenseDescription',
    'operationId', v_operation_id,
    'expectedBalanceBeforeReversal', 0, 'expectedBalanceAfterReversal', 12
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_e2e_fixture_run(
  p_run_id text,
  p_worker_id text DEFAULT NULL,
  p_test_key text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_run_ids text[];
  v_group_ids uuid[];
  v_expense_ids uuid[];
  v_operation_ids uuid[];
  v_ui_operation_ids uuid[];
  v_legacy_settlement_ids uuid[];
  v_legacy_activity_ids uuid[];
  v_payment_intent_ids uuid[];
  v_deleted integer := 0;
  v_scenario_count integer := 0;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();
  IF p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_INVALID_KEY';
  END IF;

  SELECT count(*)::integer,
         coalesce(array_agg(run.run_id), '{}'),
         coalesce(array_agg(run.group_id) FILTER (WHERE run.group_id IS NOT NULL), '{}'),
         coalesce(array_agg(run.expense_id) FILTER (WHERE run.expense_id IS NOT NULL), '{}'),
         coalesce(array_agg(run.settlement_operation_id) FILTER (WHERE run.settlement_operation_id IS NOT NULL), '{}')
    INTO v_scenario_count, v_run_ids, v_group_ids, v_expense_ids
         , v_operation_ids
  FROM public.e2e_fixture_runs run
  WHERE run.actor_user_id = v_actor_id
    AND run.run_id = p_run_id
    AND (p_worker_id IS NULL OR run.worker_id = p_worker_id)
    AND (p_test_key IS NULL OR run.test_key = p_test_key);

  -- The UI creates its operation after the seed RPC returns, so its ID is not
  -- available in e2e_fixture_runs.settlement_operation_id. Discover only
  -- operations tied to this run's unique group and actor/friend pair.
  SELECT coalesce(array_agg(DISTINCT operation.id), '{}')
    INTO v_ui_operation_ids
  FROM public.settlement_operations operation
  WHERE EXISTS (
    SELECT 1
    FROM public.e2e_fixture_runs run
    WHERE run.actor_user_id = v_actor_id
      AND run.run_id = p_run_id
      AND (p_worker_id IS NULL OR run.worker_id = p_worker_id)
      AND (p_test_key IS NULL OR run.test_key = p_test_key)
      AND (
        (operation.actor_user_id = run.actor_user_id
         AND operation.friend_user_id = run.friend_user_id)
        OR (operation.actor_user_id = run.friend_user_id
            AND operation.friend_user_id = run.actor_user_id)
      )
      AND (
        operation.group_id = run.group_id
        OR EXISTS (
          SELECT 1
          FROM public.settlement_scope_transfers transfer
          WHERE transfer.operation_id = operation.id
            AND transfer.group_id = run.group_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.settlement_cancellations cancellation
          WHERE cancellation.operation_id = operation.id
            AND cancellation.group_id = run.group_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.settlements settlement
          WHERE settlement.operation_id = operation.id
            AND settlement.group_id = run.group_id
        )
      )
  );
  v_operation_ids := v_operation_ids || v_ui_operation_ids;

  -- The legacy group-settle UI writes a direct settlement without the newer
  -- operation/group/commitment links. Its only fixture-owned link is the
  -- settlement_created Activity, so discover exactly those rows before the
  -- fixture Group is removed (activities.group_id would otherwise be nulled).
  SELECT coalesce(array_agg(DISTINCT settlement.id), '{}'),
         coalesce(array_agg(DISTINCT activity.id), '{}')
    INTO v_legacy_settlement_ids, v_legacy_activity_ids
  FROM public.e2e_fixture_runs run
  JOIN public.groups fixture_group
    ON fixture_group.id = run.group_id
  JOIN public.activities activity
    ON (
      activity.group_id = run.group_id
      OR activity.group_name = fixture_group.name
    )
   AND activity.type = 'settlement_created'
  JOIN public.settlements settlement
    ON settlement.id = activity.target_id
  WHERE run.actor_user_id = v_actor_id
    AND run.run_id = p_run_id
    AND (p_worker_id IS NULL OR run.worker_id = p_worker_id)
    AND (p_test_key IS NULL OR run.test_key = p_test_key)
    AND (
      settlement.group_id = run.group_id
      OR settlement.group_id IS NULL
    )
    AND settlement.operation_id IS NULL
    AND settlement.commitment_id IS NULL
    AND (
      (settlement.from_user_id = run.actor_user_id
       AND settlement.to_user_id = run.friend_user_id)
      OR (settlement.from_user_id = run.friend_user_id
          AND settlement.to_user_id = run.actor_user_id)
    );

  -- Activities do not own their target settlement, so remove the activity
  -- first and then the legacy settlement while the fixture pair is known.
  IF coalesce(array_length(v_legacy_activity_ids, 1), 0) > 0 THEN
    DELETE FROM public.activities
    WHERE id = ANY(v_legacy_activity_ids);
  END IF;
  IF coalesce(array_length(v_legacy_settlement_ids, 1), 0) > 0 THEN
    DELETE FROM public.settlements
    WHERE id = ANY(v_legacy_settlement_ids);
  END IF;

  IF coalesce(array_length(v_operation_ids, 1), 0) > 0 THEN
    SELECT coalesce(array_agg(operation.payment_intent_id), '{}')
      INTO v_payment_intent_ids
    FROM public.settlement_operations operation
    WHERE operation.id = ANY(v_operation_ids);

    DELETE FROM public.settlement_operation_reversals
    WHERE operation_id = ANY(v_operation_ids);
    DELETE FROM public.settlement_scope_transfers
    WHERE operation_id = ANY(v_operation_ids);
    DELETE FROM public.settlement_cancellations
    WHERE operation_id = ANY(v_operation_ids);
    DELETE FROM public.settlements
    WHERE operation_id = ANY(v_operation_ids);
    DELETE FROM public.settlement_operations
    WHERE id = ANY(v_operation_ids);
    IF coalesce(array_length(v_payment_intent_ids, 1), 0) > 0 THEN
      DELETE FROM public.settlement_commitments
      WHERE payment_intent_id = ANY(v_payment_intent_ids);
    END IF;
  END IF;

  IF coalesce(array_length(v_expense_ids, 1), 0) > 0 THEN
    DELETE FROM public.expense_splits WHERE expense_id = ANY(v_expense_ids);
    DELETE FROM public.expenses WHERE id = ANY(v_expense_ids);
  END IF;
  IF coalesce(array_length(v_group_ids, 1), 0) > 0 THEN
    DELETE FROM public.group_members WHERE group_id = ANY(v_group_ids);
    DELETE FROM public.groups WHERE id = ANY(v_group_ids);
  END IF;
  DELETE FROM public.e2e_fixture_runs
  WHERE actor_user_id = v_actor_id
    AND run_id = ANY(v_run_ids)
    AND (p_worker_id IS NULL OR worker_id = p_worker_id)
    AND (p_test_key IS NULL OR test_key = p_test_key);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_scenario_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_e2e_stale_fixture_runs(
  p_before timestamptz,
  p_run_id text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_deleted integer;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();
  IF p_before IS NULL OR p_before >= now() - interval '1 hour'
     OR p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'E2E_FIXTURE_STALE_RUN_REQUIRES_EXPLICIT_OLD_RUN';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.e2e_fixture_runs run
    WHERE run.actor_user_id = v_actor_id
      AND run.run_id = p_run_id
      AND run.created_at < p_before
  ) THEN
    RAISE EXCEPTION 'E2E_FIXTURE_STALE_RUN_NOT_FOUND';
  END IF;
  -- Stale cleanup is never a broad sweep: the caller must name one old run.
  SELECT public.purge_e2e_fixture_run(p_run_id) INTO v_deleted;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_fixture_actor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.e2e_fixture_require_development() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.configure_e2e_fixture_account(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seed_e2e_outstanding_group(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.seed_e2e_group_membership(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.seed_e2e_friendship(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.seed_e2e_settlement_reversal(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.purge_e2e_fixture_run(text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.purge_e2e_stale_fixture_runs(timestamptz, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.seed_e2e_outstanding_group(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_e2e_group_membership(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_e2e_friendship(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_e2e_settlement_reversal(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_e2e_fixture_run(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_e2e_stale_fixture_runs(timestamptz, text) TO authenticated;
-- END inlined supabase/fixtures/e2e-run-scoped-fixtures.sql (copy 2 of 2)
-- Legacy cleanup depends on the run-scoped development and actor helpers.
-- BEGIN inlined supabase/fixtures/e2e-purge-groups.sql
-- Development E2E fixture only.
-- Install supabase/fixtures/e2e-run-scoped-fixtures.sql first. This file
-- reuses its development and allowlisted-actor checks so legacy cleanup cannot
-- delete another account's groups. Do not run against production.

CREATE OR REPLACE FUNCTION public.purge_e2e_groups(group_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_group_ids uuid[];
  v_operation_ids uuid[];
  v_commitment_ids uuid[];
  v_deleted integer;
BEGIN
  PERFORM public.e2e_fixture_require_development();
  v_actor_id := public.e2e_fixture_actor();

  IF group_prefix IS NULL OR group_prefix NOT LIKE 'Detox Group %' THEN
    RAISE EXCEPTION 'Refusing to purge groups outside the E2E prefix';
  END IF;

  SELECT coalesce(array_agg(fixture_group.id), '{}')
    INTO v_group_ids
  FROM public.groups fixture_group
  JOIN public.group_members member
    ON member.group_id = fixture_group.id
   AND member.user_id = v_actor_id
  WHERE fixture_group.name LIKE group_prefix || '%';

  IF coalesce(array_length(v_group_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Capture every operation linked to the selected Groups before deleting any
  -- child rows. All-balance operations may have a NULL group_id, so include
  -- links through transfers and settlements as well.
  SELECT coalesce(array_agg(DISTINCT operation.id), '{}')
    INTO v_operation_ids
  FROM public.settlement_operations operation
  WHERE operation.group_id = ANY(v_group_ids)
     OR EXISTS (
       SELECT 1
       FROM public.settlement_scope_transfers transfer
       WHERE transfer.operation_id = operation.id
         AND transfer.group_id = ANY(v_group_ids)
     )
     OR EXISTS (
       SELECT 1
       FROM public.settlement_cancellations cancellation
       WHERE cancellation.operation_id = operation.id
         AND cancellation.group_id = ANY(v_group_ids)
     )
     OR EXISTS (
       SELECT 1
       FROM public.settlements settlement
       WHERE settlement.operation_id = operation.id
         AND settlement.group_id = ANY(v_group_ids)
     );

  SELECT coalesce(array_agg(DISTINCT settlement.commitment_id)
                 FILTER (WHERE settlement.commitment_id IS NOT NULL), '{}')
    INTO v_commitment_ids
  FROM public.settlements settlement
  WHERE settlement.group_id = ANY(v_group_ids)
     OR settlement.operation_id = ANY(v_operation_ids);

  IF coalesce(array_length(v_operation_ids, 1), 0) > 0 THEN
    DELETE FROM public.settlement_operation_reversals
     WHERE operation_id = ANY(v_operation_ids);

    DELETE FROM public.settlement_scope_transfers
     WHERE operation_id = ANY(v_operation_ids);

    DELETE FROM public.settlement_cancellations
     WHERE operation_id = ANY(v_operation_ids);

    DELETE FROM public.settlements
     WHERE group_id = ANY(v_group_ids)
        OR operation_id = ANY(v_operation_ids);

    DELETE FROM public.settlement_operations
     WHERE id = ANY(v_operation_ids);
  ELSE
    DELETE FROM public.settlements
     WHERE group_id = ANY(v_group_ids);
  END IF;

  -- A commitment can be shared by legacy settlement rows. Delete only the
  -- commitments made orphaned by this group purge.
  DELETE FROM public.settlement_commitments commitment
   WHERE commitment.id = ANY(v_commitment_ids)
     AND NOT EXISTS (
       SELECT 1
       FROM public.settlements settlement
       WHERE settlement.commitment_id = commitment.id
     );

  DELETE FROM public.groups
   WHERE id = ANY(v_group_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Ticket 11 removed the old broad history RPC. Dropping it here also fixes
-- development projects that installed an earlier copy of this fixture.
DROP FUNCTION IF EXISTS public.purge_e2e_history(uuid);

REVOKE EXECUTE ON FUNCTION public.purge_e2e_groups(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.purge_e2e_groups(text) TO authenticated;
-- END inlined supabase/fixtures/e2e-purge-groups.sql

SELECT plan(87);

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
   WHERE run.run_id = 'run-f' AND settlement.operation_id IS NOT NULL AND settlement.group_id = run.group_id),
  1,
  'settlement-reversal scenario prepares one in-group settlement allocation'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_scope_transfers transfer
   JOIN public.e2e_fixture_runs run ON run.settlement_operation_id = transfer.operation_id
   WHERE run.run_id = 'run-f' AND NOT transfer.is_reversal),
  0,
  'settlement-reversal scenario writes no transfer legs on the dedicated surface'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_cancellations cancellation
   JOIN public.e2e_fixture_runs run ON run.settlement_operation_id = cancellation.operation_id
   WHERE run.run_id = 'run-f' AND NOT cancellation.is_reversal),
  0,
  'settlement-reversal scenario writes no cancellation legs when the payment covers the group'
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

  -- Legacy shape with a signed-convention transfer leg: the row-level
  -- validator reads the committer's group balance (+12.00 actor view, no
  -- operation cash yet), so from friend the delta is +12.00
  -- (participant-relative orientation). The transfer is inserted before the
  -- settlement below: settlement-first would zero the helper balance and
  -- leave no nonzero delta valid (SETTLEMENT_TRANSFER_BALANCE_MISMATCH).
  INSERT INTO public.settlement_scope_transfers (
    operation_id, group_id, from_user_id, to_user_id, currency,
    signed_group_balance_delta, note, is_reversal
  )
  VALUES (
    v_operation_id, v_group_id, v_friend_id, v_actor_id, 'USD',
    12.00, 'UI-style fixture scope transfer', false
  );

  INSERT INTO public.settlements (
    group_id, from_user_id, to_user_id, amount, currency, date, notes, operation_id
  )
  VALUES (
    v_group_id, v_friend_id, v_actor_id, 12.00, 'USD', now(), 'UI-style fixture settlement', v_operation_id
  );

  INSERT INTO public.settlement_cancellations (
    operation_id, group_id, amount, signed_group_balance_delta, currency, note
  )
  VALUES (
    v_operation_id, v_group_id, 12.00, -12.00, 'USD', 'UI-style fixture cancellation'
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
  v_actor_id uuid := (SELECT app_id FROM fixture_test_users LIMIT 1);
  v_friend_id uuid := (SELECT clean_friend_id FROM fixture_test_users LIMIT 1);
  v_group_id uuid := ((SELECT payload->>'groupId' FROM fixture_results WHERE key = 'run-a-first'))::uuid;
  v_operation_id uuid;
BEGIN
  -- Model a cancellation-only full settlement: the operation carries no
  -- group link and has no transfer or settlement legs, so run-scoped
  -- cleanup can only discover it through its cancellation row.
  INSERT INTO public.settlement_operations (
    actor_user_id, friend_user_id, group_id, mode, currency,
    expected_balance, requested_payment_amount, payment_intent_id, status
  )
  VALUES (
    v_actor_id, v_friend_id, NULL, 'all_balances', 'USD',
    12.00, 12.00, gen_random_uuid(), 'committed'
  )
  RETURNING id INTO v_operation_id;

  INSERT INTO public.settlement_cancellations (
    operation_id, group_id, amount, signed_group_balance_delta, currency, note
  )
  VALUES (
    v_operation_id, v_group_id, 12.00, -12.00, 'USD', 'cancellation-only fixture cancellation'
  );

  INSERT INTO fixture_results
  VALUES ('run-a-cancel-only', jsonb_build_object('cancelOnlyOperationId', v_operation_id));
END $$;
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_cancellations
   WHERE operation_id = ((SELECT payload->>'cancelOnlyOperationId' FROM fixture_results WHERE key = 'run-a-cancel-only'))::uuid),
  1,
  'cancellation-only operation stores its cancellation before deletion'
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
  (SELECT count(*)::integer FROM public.settlement_cancellations
   WHERE operation_id = ((SELECT payload->>'uiOperationId' FROM fixture_results WHERE key = 'run-a-first'))::uuid),
  0,
  'cleanup removes UI-style cancellation rows before deleting the group'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_operations
   WHERE id = ((SELECT payload->>'cancelOnlyOperationId' FROM fixture_results WHERE key = 'run-a-cancel-only'))::uuid),
  0,
  'cleanup discovers a cancellation-only operation through its cancellation link'
);
SELECT is(
  (SELECT count(*)::integer FROM public.settlement_cancellations
   WHERE operation_id = ((SELECT payload->>'cancelOnlyOperationId' FROM fixture_results WHERE key = 'run-a-cancel-only'))::uuid),
  0,
  'cleanup removes cancellation-only rows before deleting the group'
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
