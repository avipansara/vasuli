-- Settlement operation contract regressions (ADR-0004).
-- Full settlement may carry exact cancellation legs; malformed or partial
-- cancellation requests remain rejected. Existing transfer history stays
-- readable and reversible.
-- Run against LOCAL Supabase only, isolated transaction, rolls back.
-- docker cp supabase/tests/settlement_commit_guard_regressions.sql supabase_db_vasuli:/tmp/regress.sql
-- docker exec supabase_db_vasuli psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/regress.sql
BEGIN;

CREATE TEMP TABLE _t01_ids (
  actor uuid, friend_opp uuid, friend_zero uuid, friend_direct uuid,
  group_opp uuid, group_zero uuid
) ON COMMIT DROP;
INSERT INTO _t01_ids VALUES (
  '81000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  '81000000-0000-0000-0000-000000000003',
  '81000000-0000-0000-0000-000000000004',
  '82000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000002'
);

-- Synthetic auth + app users (actor == auth id, mirrors existing SQL tests).
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor,'authenticated','authenticated','t01-actor@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t01_ids
UNION ALL SELECT friend_opp,'authenticated','authenticated','t01-opp@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t01_ids
UNION ALL SELECT friend_zero,'authenticated','authenticated','t01-zero@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t01_ids
UNION ALL SELECT friend_direct,'authenticated','authenticated','t01-direct@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t01_ids;

INSERT INTO public.users (id, name, auth_user_id, created_at)
SELECT actor,'T01 actor',actor,'2026-01-01'::timestamptz FROM _t01_ids
UNION ALL SELECT friend_opp,'T01 opp',friend_opp,'2026-01-01'::timestamptz FROM _t01_ids
UNION ALL SELECT friend_zero,'T01 zero',friend_zero,'2026-01-01'::timestamptz FROM _t01_ids
UNION ALL SELECT friend_direct,'T01 direct',friend_direct,'2026-01-01'::timestamptz FROM _t01_ids;

INSERT INTO public.friendships (user_id, friend_id, status)
SELECT actor, friend_opp, 'accepted' FROM _t01_ids
UNION ALL SELECT actor, friend_zero, 'accepted' FROM _t01_ids
UNION ALL SELECT actor, friend_direct, 'accepted' FROM _t01_ids;

INSERT INTO public.groups (id, name) SELECT group_opp, 'T01 opp' FROM _t01_ids
UNION ALL SELECT group_zero, 'T01 zero' FROM _t01_ids;

INSERT INTO public.group_members (group_id, user_id, role)
SELECT group_opp, actor, 'admin' FROM _t01_ids
UNION ALL SELECT group_opp, friend_opp, 'member' FROM _t01_ids
UNION ALL SELECT group_zero, actor, 'admin' FROM _t01_ids
UNION ALL SELECT group_zero, friend_zero, 'member' FROM _t01_ids;

-- Balances (actor perspective):
-- opp pair: direct +10 (friend owes actor), group -8 (actor owes friend) => net +2
-- zero pair: direct +8, group -8 => net 0
-- direct pair: direct -20 (actor owes friend)
DO $$
DECLARE f _t01_ids%ROWTYPE; e uuid;
BEGIN
  SELECT * INTO f FROM _t01_ids;
  -- opp direct +10: paid by actor, friend_opp split 10
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't01 opp direct', 10, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 0, 'exact'), (e, f.friend_opp, 10, 'exact');
  -- opp group -8: paid by friend_opp, actor split 8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_opp, 't01 opp group', 16, 'USD', f.friend_opp, f.friend_opp, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 8, 'exact'), (e, f.friend_opp, 8, 'exact');

  -- zero direct +8: paid by actor, friend_zero split 8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't01 zero direct', 8, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 0, 'exact'), (e, f.friend_zero, 8, 'exact');
  -- zero group -8: paid by friend_zero, actor split 8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_zero, 't01 zero group', 16, 'USD', f.friend_zero, f.friend_zero, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 8, 'exact'), (e, f.friend_zero, 8, 'exact');

  -- direct -20: paid by friend_direct, actor split 20
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't01 direct', 20, 'USD', f.friend_direct, f.friend_direct, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 20, 'exact'), (e, f.friend_direct, 0, 'exact');
END $$;

GRANT SELECT ON _t01_ids TO authenticated;
-- Same pre-existing local drift workaround as the zero-net regressions: the
-- zero-net stale check reads get_friend_home_relationships(), which selects
-- users.push_token/is_active absent from some local checkouts.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
SET LOCAL ROLE authenticated;

-- 1) Transfer payloads are frozen (Task 2): any non-empty p_transfers is
-- rejected before the legacy partial-cancellation gate, and persists nothing.
RESET ROLE;
DO $$
DECLARE n_ops int; n_com int; n_set int; n_tr int; n_can int;
BEGIN
  SELECT COUNT(*) INTO n_ops FROM public.settlement_operations;
  SELECT COUNT(*) INTO n_com FROM public.settlement_commitments;
  SELECT COUNT(*) INTO n_set FROM public.settlements;
  SELECT COUNT(*) INTO n_tr FROM public.settlement_scope_transfers;
  SELECT COUNT(*) INTO n_can FROM public.settlement_cancellations;
  CREATE TEMP TABLE _t01_before ON COMMIT DROP AS SELECT n_ops AS n_ops, n_com AS n_com, n_set AS n_set, n_tr AS n_tr, n_can AS n_can;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t01_ids;
DO $$
DECLARE f _t01_ids%ROWTYPE; allocs jsonb; transfers jsonb;
BEGIN
  SELECT * INTO f FROM _t01_ids;
  allocs := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.friend_opp::text, 'toUserId', f.actor::text,
    'amount', 1, 'currency', 'USD'));
  transfers := jsonb_build_array(jsonb_build_object(
    'groupId', f.group_opp::text, 'fromUserId', f.actor::text, 'toUserId', f.friend_opp::text,
    'currency', 'USD', 'signedGroupBalanceDelta', 8));
  BEGIN
    PERFORM public.commit_settlement_operation(
      '83000000-0000-0000-0000-000000000001'::uuid, f.friend_opp, NULL, 'all_balances',
      1, 'USD', NOW(), 2, allocs, transfers);
    RAISE EXCEPTION 'positive transfer commit should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SETTLEMENT_TRANSFERS_FROZEN%' THEN RAISE EXCEPTION 'partial cancellation wrong error: %', SQLERRM; END IF;
  END;
END $$;
RESET ROLE;
DO $$
DECLARE b _t01_before%ROWTYPE;
BEGIN
  SELECT * INTO b FROM _t01_before;
  IF (SELECT COUNT(*) FROM public.settlement_operations) <> b.n_ops
     OR (SELECT COUNT(*) FROM public.settlement_commitments) <> b.n_com
     OR (SELECT COUNT(*) FROM public.settlements) <> b.n_set
     OR (SELECT COUNT(*) FROM public.settlement_scope_transfers) <> b.n_tr
     OR (SELECT COUNT(*) FROM public.settlement_cancellations) <> b.n_can THEN
    RAISE EXCEPTION 'partial cancellation persisted rows';
  END IF;
END $$;
SET LOCAL ROLE authenticated;

-- 2) Naturally zero pairs produce no settlement operation in the planner.
RESET ROLE;
DO $$
DECLARE b _t01_before%ROWTYPE;
BEGIN
  SELECT * INTO b FROM _t01_before;
  IF (SELECT COUNT(*) FROM public.settlement_operations) <> b.n_ops
     OR (SELECT COUNT(*) FROM public.settlements) <> b.n_set
     OR (SELECT COUNT(*) FROM public.settlement_scope_transfers) <> b.n_tr
     OR (SELECT COUNT(*) FROM public.settlement_cancellations) <> b.n_can THEN
    RAISE EXCEPTION 'zero-net commit persisted rows';
  END IF;
  DROP TABLE _t01_before;
END $$;
SET LOCAL ROLE authenticated;

-- 3) Positive direct commit still succeeds; retry returns reused receipt.
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t01_ids;
DO $$
DECLARE f _t01_ids%ROWTYPE; receipt jsonb; allocs jsonb;
BEGIN
  SELECT * INTO f FROM _t01_ids;
  allocs := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.actor::text, 'toUserId', f.friend_direct::text,
    'amount', 5, 'currency', 'USD'));
  receipt := public.commit_settlement_operation(
    '83000000-0000-0000-0000-000000000003'::uuid, f.friend_direct, NULL, 'all_balances',
    5, 'USD', NOW(), -20, allocs, '[]'::jsonb);
  IF (receipt->>'reused')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'direct new receipt reused flag wrong: %', receipt; END IF;
  IF jsonb_array_length(receipt->'settlements') <> 1 THEN RAISE EXCEPTION 'direct expected 1 settlement, got %', receipt; END IF;
  CREATE TEMP TABLE _t01_direct_op ON COMMIT DROP AS SELECT (receipt->>'operationId')::uuid AS id;
  receipt := public.commit_settlement_operation(
    '83000000-0000-0000-0000-000000000003'::uuid, f.friend_direct, NULL, 'all_balances',
    5, 'USD', NOW(), -20, allocs, '[]'::jsonb);
  IF (receipt->>'reused')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'direct retry flag wrong: %', receipt; END IF;
END $$;

-- 4) Reversal of the direct operation still works (actor, post -15).
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t01_ids;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reverse_settlement_operation((SELECT id FROM _t01_direct_op), -15);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'direct reverse failed: %', r; END IF;
END $$;

-- 5) Pre-guard transfer-bearing history stays reusable: seed a legacy
-- zero-net operation directly (as pre-guard history), then retrying the same
-- payment intent returns the original receipt instead of the frozen error.
RESET ROLE;
DO $$
DECLARE
  f _t01_ids%ROWTYPE; transfers jsonb; fingerprint text; legacy_op uuid;
BEGIN
  SELECT * INTO f FROM _t01_ids;
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
    0, 0, '83000000-0000-0000-0000-000000000005'::uuid, fingerprint
  ) RETURNING id INTO legacy_op;
  INSERT INTO public.settlement_scope_transfers (
    operation_id, group_id, from_user_id, to_user_id, currency, signed_group_balance_delta
  ) VALUES (
    legacy_op, f.group_zero, f.actor, f.friend_zero, 'USD', 8);
  CREATE TEMP TABLE _t01_legacy_op ON COMMIT DROP AS SELECT legacy_op AS id;
END $$;
GRANT SELECT ON _t01_legacy_op TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t01_ids;
DO $$
DECLARE f _t01_ids%ROWTYPE; receipt jsonb; transfers jsonb;
BEGIN
  SELECT * INTO f FROM _t01_ids;
  transfers := jsonb_build_array(jsonb_build_object(
    'groupId', f.group_zero::text, 'fromUserId', f.actor::text, 'toUserId', f.friend_zero::text,
    'currency', 'USD', 'signedGroupBalanceDelta', 8));
  receipt := public.commit_zero_net_settlement_operation(
    '83000000-0000-0000-0000-000000000005'::uuid, f.friend_zero, 'USD', NOW(), 0, transfers);
  IF (receipt->>'reused')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'legacy zero-net retry flag wrong: %', receipt; END IF;
  IF (receipt->>'operationId')::uuid <> (SELECT id FROM _t01_legacy_op) THEN RAISE EXCEPTION 'legacy zero-net retry operation mismatch'; END IF;
  IF jsonb_array_length(receipt->'transfers') <> 1 THEN RAISE EXCEPTION 'legacy transfer rows unreadable: %', receipt; END IF;
END $$;

-- 6) Pre-guard transfer-bearing history stays reversible (expected 0).
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t01_ids;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reverse_settlement_operation((SELECT id FROM _t01_legacy_op), 0);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'legacy transfer reverse failed: %', r; END IF;
END $$;

ROLLBACK;
