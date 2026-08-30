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
      'groupId', NULL,
      'fromUserId', v_friend_id,
      'toUserId', v_actor_id,
      'amount', 12.00,
      'currency', 'USD'
    )),
    jsonb_build_array(jsonb_build_object(
      'groupId', v_group_id,
      'fromUserId', v_friend_id,
      'toUserId', v_actor_id,
      'currency', 'USD',
      'signedGroupBalanceDelta', -12.00,
      'note', 'E2E fixture settlement reversal'
    ))
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

REVOKE ALL ON FUNCTION public.e2e_fixture_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.e2e_fixture_require_development() FROM PUBLIC, anon, authenticated;
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
