-- Settlement zero-net + reversal direction regressions (ticket 06).
-- Run against LOCAL Supabase only, isolated transaction, rolls back.
-- docker cp supabase/tests/settlement_zero_net_reversal_regressions.sql supabase_db_vasuli:/tmp/regress.sql
-- docker exec supabase_db_vasuli psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/regress.sql
BEGIN;

CREATE TEMP TABLE _t06_ids (
  actor uuid, friend_zero uuid, friend_direct uuid, friend_opp uuid,
  friend_group uuid, friend_either uuid, friend_stale uuid, outsider uuid,
  group_zero uuid, group_opp uuid, group_normal uuid
) ON COMMIT DROP;
INSERT INTO _t06_ids VALUES (
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000003',
  '91000000-0000-0000-0000-000000000004',
  '91000000-0000-0000-0000-000000000005',
  '91000000-0000-0000-0000-000000000006',
  '91000000-0000-0000-0000-000000000007',
  '91000000-0000-0000-0000-000000000008',
  '92000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000003'
);

-- Synthetic auth + app users (actor == auth id, mirrors existing SQL tests).
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor,'authenticated','authenticated','t06-actor@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t06_ids
UNION ALL SELECT friend_zero,'authenticated','authenticated','t06-zero@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t06_ids
UNION ALL SELECT friend_direct,'authenticated','authenticated','t06-direct@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t06_ids
UNION ALL SELECT friend_opp,'authenticated','authenticated','t06-opp@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t06_ids
UNION ALL SELECT friend_group,'authenticated','authenticated','t06-group@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t06_ids
UNION ALL SELECT friend_either,'authenticated','authenticated','t06-either@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t06_ids
UNION ALL SELECT friend_stale,'authenticated','authenticated','t06-stale@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t06_ids
UNION ALL SELECT outsider,'authenticated','authenticated','t06-outsider@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t06_ids;

INSERT INTO public.users (id, name, auth_user_id, created_at)
SELECT actor,'T06 actor',actor,'2026-01-01'::timestamptz FROM _t06_ids
UNION ALL SELECT friend_zero,'T06 zero',friend_zero,'2026-01-01'::timestamptz FROM _t06_ids
UNION ALL SELECT friend_direct,'T06 direct',friend_direct,'2026-01-01'::timestamptz FROM _t06_ids
UNION ALL SELECT friend_opp,'T06 opp',friend_opp,'2026-01-01'::timestamptz FROM _t06_ids
UNION ALL SELECT friend_group,'T06 group',friend_group,'2026-01-01'::timestamptz FROM _t06_ids
UNION ALL SELECT friend_either,'T06 either',friend_either,'2026-01-01'::timestamptz FROM _t06_ids
UNION ALL SELECT friend_stale,'T06 stale',friend_stale,'2026-01-01'::timestamptz FROM _t06_ids
UNION ALL SELECT outsider,'T06 outsider',outsider,'2026-01-01'::timestamptz FROM _t06_ids;

INSERT INTO public.friendships (user_id, friend_id, status)
SELECT actor, friend_zero, 'accepted' FROM _t06_ids
UNION ALL SELECT actor, friend_direct, 'accepted' FROM _t06_ids
UNION ALL SELECT actor, friend_opp, 'accepted' FROM _t06_ids
UNION ALL SELECT actor, friend_group, 'accepted' FROM _t06_ids
UNION ALL SELECT actor, friend_either, 'accepted' FROM _t06_ids
UNION ALL SELECT actor, friend_stale, 'accepted' FROM _t06_ids;

INSERT INTO public.groups (id, name) SELECT group_zero, 'T06 zero' FROM _t06_ids
UNION ALL SELECT group_opp, 'T06 opp' FROM _t06_ids
UNION ALL SELECT group_normal, 'T06 normal' FROM _t06_ids;

INSERT INTO public.group_members (group_id, user_id, role)
SELECT group_zero, actor, 'admin' FROM _t06_ids
UNION ALL SELECT group_zero, friend_zero, 'member' FROM _t06_ids
UNION ALL SELECT group_opp, actor, 'admin' FROM _t06_ids
UNION ALL SELECT group_opp, friend_opp, 'member' FROM _t06_ids
UNION ALL SELECT group_normal, actor, 'admin' FROM _t06_ids
UNION ALL SELECT group_normal, friend_group, 'member' FROM _t06_ids;

-- Balances (actor perspective):
-- zero pair: direct +8 (friend owes actor), group -8 (actor owes friend) => net 0
-- direct pair: direct -20 (actor owes friend)
-- opp pair: direct +10, group -8 => net +2 (group cash opposes combined sign)
-- group pair: group -20, direct 0
-- either pair: direct -20
-- stale pair: direct -20
DO $$
DECLARE f _t06_ids%ROWTYPE; e uuid;
BEGIN
  SELECT * INTO f FROM _t06_ids;
  -- zero direct +8: paid by actor, friend split 8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't06 zero direct', 8, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 0, 'exact'), (e, f.friend_zero, 8, 'exact');
  -- zero group -8: paid by friend_zero, actor split 8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_zero, 't06 zero group', 16, 'USD', f.friend_zero, f.friend_zero, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 8, 'exact'), (e, f.friend_zero, 8, 'exact');

  -- direct -20: paid by friend_direct, actor split 20
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't06 direct', 20, 'USD', f.friend_direct, f.friend_direct, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 20, 'exact'), (e, f.friend_direct, 0, 'exact');

  -- opp direct +10: paid by actor, friend_opp split 10
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't06 opp direct', 10, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 0, 'exact'), (e, f.friend_opp, 10, 'exact');
  -- opp group -8: paid by friend_opp, actor split 8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_opp, 't06 opp group', 16, 'USD', f.friend_opp, f.friend_opp, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 8, 'exact'), (e, f.friend_opp, 8, 'exact');

  -- normal group -20: paid by friend_group, actor split 20
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_normal, 't06 group', 40, 'USD', f.friend_group, f.friend_group, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 20, 'exact'), (e, f.friend_group, 20, 'exact');

  -- either direct -20
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't06 either', 20, 'USD', f.friend_either, f.friend_either, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 20, 'exact'), (e, f.friend_either, 0, 'exact');

  -- stale direct -20
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't06 stale', 20, 'USD', f.friend_stale, f.friend_stale, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 20, 'exact'), (e, f.friend_stale, 0, 'exact');
END $$;

GRANT SELECT ON _t06_ids TO authenticated;
-- Workaround for pre-existing local drift (not ticket scope): the deployed
-- get_friend_home_relationships() selects users.push_token/is_active, which
-- the local users table lacks. Zero-net derives its stale check from that
-- read model, so expose the missing columns inside this rolled-back fixture.
-- Positive commits do not use that read model and are unaffected.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
SET LOCAL ROLE authenticated;

-- 1) Pre-guard zero-net history stays reusable: seed the legacy operation
-- directly (as committed history), then retrying the same payment intent
-- returns the original receipt with its transfer rows.
RESET ROLE;
DO $$
DECLARE
  f _t06_ids%ROWTYPE; transfers jsonb; fingerprint text; legacy_op uuid;
BEGIN
  SELECT * INTO f FROM _t06_ids;
  transfers := jsonb_build_array(jsonb_build_object(
    'groupId', f.group_zero::text, 'fromUserId', f.actor::text, 'toUserId', f.friend_zero::text,
    'currency', 'USD', 'signedGroupBalanceDelta', 8));
  fingerprint := md5(jsonb_build_object(
    'friendId', f.friend_zero, 'currency', 'USD', 'expectedBalance', 0, 'transfers', transfers)::TEXT);
  INSERT INTO public.settlement_operations (
    actor_user_id, friend_user_id, group_id, mode, currency,
    expected_balance, requested_payment_amount, payment_intent_id, request_fingerprint
  ) VALUES (
    f.actor, f.friend_zero, NULL, 'all_balances', 'USD',
    0, 0, '93000000-0000-0000-0000-000000000001'::uuid, fingerprint
  ) RETURNING id INTO legacy_op;
  INSERT INTO public.settlement_scope_transfers (
    operation_id, group_id, from_user_id, to_user_id, currency, signed_group_balance_delta
  ) VALUES (
    legacy_op, f.group_zero, f.actor, f.friend_zero, 'USD', 8);
  CREATE TEMP TABLE _t06_zero_op ON COMMIT DROP AS SELECT legacy_op AS id;
END $$;
GRANT SELECT ON _t06_zero_op TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE f _t06_ids%ROWTYPE; receipt jsonb; transfers jsonb;
BEGIN
  SELECT * INTO f FROM _t06_ids;
  transfers := jsonb_build_array(jsonb_build_object(
    'groupId', f.group_zero::text, 'fromUserId', f.actor::text, 'toUserId', f.friend_zero::text,
    'currency', 'USD', 'signedGroupBalanceDelta', 8));
  receipt := public.commit_zero_net_settlement_operation(
    '93000000-0000-0000-0000-000000000001'::uuid, f.friend_zero, 'USD', NOW(), 0, transfers);
  IF (receipt->>'reused')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'zero-net reuse flag wrong: %', receipt; END IF;
  IF (receipt->>'operationId')::uuid <> (SELECT id FROM _t06_zero_op) THEN RAISE EXCEPTION 'zero-net reuse operation mismatch'; END IF;
  IF jsonb_array_length(receipt->'transfers') <> 1 THEN RAISE EXCEPTION 'legacy zero-net transfers unreadable: %', receipt; END IF;
END $$;

-- 3) Legacy zero-net reverse with expected 0 succeeds (actor).
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reverse_settlement_operation((SELECT id FROM _t06_zero_op), 0);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'zero-net reverse failed: %', r; END IF;
  IF (r->>'reused')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'zero-net reverse reused flag wrong'; END IF;
END $$;

-- 4) Normal direct partial (actor pays 5 of -20 => post -15), reverse as actor.
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE
  f _t06_ids%ROWTYPE; receipt jsonb; allocs jsonb; op uuid; r jsonb;
BEGIN
  SELECT * INTO f FROM _t06_ids;
  allocs := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.actor::text, 'toUserId', f.friend_direct::text,
    'amount', 5, 'currency', 'USD'));
  receipt := public.commit_settlement_operation(
    '93000000-0000-0000-0000-000000000002'::uuid, f.friend_direct, NULL, 'all_balances',
    5, 'USD', NOW(), -20, allocs, '[]'::jsonb);
  op := (receipt->>'operationId')::uuid;
  CREATE TEMP TABLE _t06_direct_op ON COMMIT DROP AS SELECT op AS id;
  r := public.reverse_settlement_operation(op, -15);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'direct reverse failed: %', r; END IF;
END $$;

-- 5) Normal group payment (group -20, actor pays 20 => post 0).
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE
  f _t06_ids%ROWTYPE; receipt jsonb; allocs jsonb; op uuid; r jsonb;
BEGIN
  SELECT * INTO f FROM _t06_ids;
  allocs := jsonb_build_array(jsonb_build_object(
    'groupId', f.group_normal::text, 'fromUserId', f.actor::text, 'toUserId', f.friend_group::text,
    'amount', 20, 'currency', 'USD'));
  receipt := public.commit_settlement_operation(
    '93000000-0000-0000-0000-000000000004'::uuid, f.friend_group, f.group_normal, 'group',
    20, 'USD', NOW(), -20, allocs, '[]'::jsonb);
  op := (receipt->>'operationId')::uuid;
  r := public.reverse_settlement_operation(op, 0);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'normal group reverse failed: %', r; END IF;
END $$;

-- 7) Either participant: two identical direct ops, one reversed by actor (-15), one by friend (+15).
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE
  f _t06_ids%ROWTYPE; allocs jsonb; r1 jsonb; r2 jsonb; op1 uuid; op2 uuid;
BEGIN
  SELECT * INTO f FROM _t06_ids;
  allocs := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.actor::text, 'toUserId', f.friend_either::text,
    'amount', 5, 'currency', 'USD'));
  op1 := (public.commit_settlement_operation(
    '93000000-0000-0000-0000-000000000005'::uuid, f.friend_either, NULL, 'all_balances',
    5, 'USD', NOW(), -20, allocs, '[]'::jsonb)->>'operationId')::uuid;
  -- Second op needs an isolated pair balance; use the stale friend's identical -20 fixture would couple,
  -- so commit the second payment against the same pair after the first is reversed is still -20 pre.
  -- Instead reverse op1 as actor now, then create op2 fresh below.
  r1 := public.reverse_settlement_operation(op1, -15);
  IF r1->>'status' <> 'reversed' THEN RAISE EXCEPTION 'either-participant actor reverse failed'; END IF;
  CREATE TEMP TABLE _t06_either_second ON COMMIT DROP AS SELECT 1 AS one;
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE f _t06_ids%ROWTYPE; allocs jsonb; op2 uuid;
BEGIN
  SELECT * INTO f FROM _t06_ids;
  allocs := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.actor::text, 'toUserId', f.friend_either::text,
    'amount', 5, 'currency', 'USD'));
  op2 := (public.commit_settlement_operation(
    '93000000-0000-0000-0000-000000000006'::uuid, f.friend_either, NULL, 'all_balances',
    5, 'USD', NOW(), -20, allocs, '[]'::jsonb)->>'operationId')::uuid;
  CREATE TEMP TABLE _t06_either_op2 ON COMMIT DROP AS SELECT op2 AS id;
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub', friend_either::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE r jsonb;
BEGIN
  -- Friend's own perspective of post (-15 actor) is +15.
  r := public.reverse_settlement_operation((SELECT id FROM _t06_either_op2), 15);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'either-participant friend reverse failed: %', r; END IF;
END $$;

-- 8) Stale rejection persists nothing; unauthorized rejection persists nothing.
-- Table counts require the session owner: RPCs run as authenticated, counts as postgres.
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE f _t06_ids%ROWTYPE; allocs jsonb; op uuid;
BEGIN
  SELECT * INTO f FROM _t06_ids;
  allocs := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.actor::text, 'toUserId', f.friend_stale::text,
    'amount', 5, 'currency', 'USD'));
  op := (public.commit_settlement_operation(
    '93000000-0000-0000-0000-000000000007'::uuid, f.friend_stale, NULL, 'all_balances',
    5, 'USD', NOW(), -20, allocs, '[]'::jsonb)->>'operationId')::uuid;
  CREATE TEMP TABLE _t06_stale_op ON COMMIT DROP AS SELECT op AS id;
END $$;
RESET ROLE;
DO $$
DECLARE n_ops int; n_rev int; n_set int;
BEGIN
  SELECT COUNT(*) INTO n_ops FROM public.settlement_operations;
  SELECT COUNT(*) INTO n_rev FROM public.settlement_operation_reversals;
  SELECT COUNT(*) INTO n_set FROM public.settlements;
  CREATE TEMP TABLE _t06_stale_before ON COMMIT DROP AS SELECT n_ops AS n_ops, n_rev AS n_rev, n_set AS n_set;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE op uuid;
BEGIN
  SELECT id INTO op FROM _t06_stale_op;
  BEGIN
    PERFORM public.reverse_settlement_operation(op, -14);
    RAISE EXCEPTION 'stale reverse should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SETTLEMENT_STALE_BALANCE%' THEN RAISE EXCEPTION 'stale reverse wrong error: %', SQLERRM; END IF;
  END;
END $$;
RESET ROLE;
DO $$
DECLARE b _t06_stale_before%ROWTYPE; op uuid;
BEGIN
  SELECT * INTO b FROM _t06_stale_before;
  SELECT id INTO op FROM _t06_stale_op;
  IF (SELECT COUNT(*) FROM public.settlement_operations) <> b.n_ops THEN RAISE EXCEPTION 'stale rejection wrote operations'; END IF;
  IF (SELECT COUNT(*) FROM public.settlement_operation_reversals) <> b.n_rev THEN RAISE EXCEPTION 'stale rejection wrote reversals'; END IF;
  IF (SELECT COUNT(*) FROM public.settlements) <> b.n_set THEN RAISE EXCEPTION 'stale rejection wrote settlements'; END IF;
  IF (SELECT status FROM public.settlement_operations WHERE id = op) <> 'committed' THEN RAISE EXCEPTION 'stale rejection changed status'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', outsider::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
BEGIN
  BEGIN
    PERFORM public.reverse_settlement_operation((SELECT id FROM _t06_stale_op), -15);
    RAISE EXCEPTION 'unauthorized reverse should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SETTLEMENT_REVERSAL_UNAUTHORIZED%' THEN RAISE EXCEPTION 'unauthorized reverse wrong error: %', SQLERRM; END IF;
  END;
END $$;
RESET ROLE;
DO $$
DECLARE b _t06_stale_before%ROWTYPE;
BEGIN
  SELECT * INTO b FROM _t06_stale_before;
  IF (SELECT COUNT(*) FROM public.settlement_operation_reversals) <> b.n_rev THEN RAISE EXCEPTION 'unauthorized rejection wrote reversals'; END IF;
  IF (SELECT COUNT(*) FROM public.settlements) <> b.n_set THEN RAISE EXCEPTION 'unauthorized rejection wrote settlements'; END IF;
  IF (SELECT status FROM public.settlement_operations WHERE id = (SELECT id FROM _t06_stale_op)) <> 'committed' THEN RAISE EXCEPTION 'unauthorized rejection changed status'; END IF;
END $$;
SET LOCAL ROLE authenticated;

-- Correct actor reverse still succeeds after rejected attempts (guards not weakened).
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t06_ids;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reverse_settlement_operation((SELECT id FROM _t06_stale_op), -15);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'post-rejection actor reverse failed'; END IF;
END $$;

ROLLBACK;
