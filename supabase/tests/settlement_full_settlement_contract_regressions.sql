-- Dedicated balance-cancellation surface parity (replaces the retired ticket-13
-- signed interim transfer contract; Task 11).
-- The interim convention wrote per-scope signed transfer legs
-- ({groupId, fromUserId, toUserId, amount, signedGroupBalanceDelta}); the
-- dedicated surface sends creditor-free cancellations
-- ({groupId, amount, currency}) via p_cancellations with p_transfers frozen
-- (any non-empty p_transfers raises SETTLEMENT_TRANSFERS_FROZEN).
-- This suite replays the interim scenarios scenario-for-scenario and pins
-- IDENTICAL projection and reversal outcomes: partial $3 leaves -16/+10/-3,
-- full $9 clears to 0/0/0 with the third member at 30, Delete of the final
-- operation restores the post-$3 snapshot, naturally-zero writes nothing.
-- Viewer-total group-summary approximation note: get_groups_home_summaries
-- clamps the viewer's total rather than decomposing per pair, so a viewer
-- with offsetting balances vs two members in one group can read slightly
-- off. Single-pair outstandings (every case below) are exact, proven by the
-- your_balance assertions after the full commit (two-member group_two reads
-- exactly 0; three-member group_one reads exactly the surviving 30) and
-- after the reversal (40/-3 restored); the multi-member offsetting case is
-- a documented approximation, not asserted here.
-- Run against LOCAL Supabase after applying migrations:
--   docker cp supabase/tests/settlement_full_settlement_contract_regressions.sql supabase_db_vasuli:/tmp/t13.sql
--   docker exec supabase_db_vasuli psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t13.sql
-- Every fixture and operation is rolled back at the end.
BEGIN;

CREATE TEMP TABLE _t13_ids (
  actor UUID, friend UUID, other UUID, zero_friend UUID,
  group_one UUID, group_two UUID, unauthorized_group UUID, zero_group UUID
) ON COMMIT DROP;
INSERT INTO _t13_ids VALUES (
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000003',
  '91000000-0000-0000-0000-000000000004',
  '92000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000003',
  '92000000-0000-0000-0000-000000000004'
);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor, 'authenticated', 'authenticated', 't13-actor@example.invalid', NOW(), NOW(), false, false FROM _t13_ids
UNION ALL SELECT friend, 'authenticated', 'authenticated', 't13-friend@example.invalid', NOW(), NOW(), false, false FROM _t13_ids
UNION ALL SELECT other, 'authenticated', 'authenticated', 't13-other@example.invalid', NOW(), NOW(), false, false FROM _t13_ids
UNION ALL SELECT zero_friend, 'authenticated', 'authenticated', 't13-zero@example.invalid', NOW(), NOW(), false, false FROM _t13_ids;
INSERT INTO public.users (id, name, auth_user_id, created_at)
SELECT actor, 'T13 actor', actor, NOW() FROM _t13_ids
UNION ALL SELECT friend, 'T13 friend', friend, NOW() FROM _t13_ids
UNION ALL SELECT other, 'T13 other', other, NOW() FROM _t13_ids
UNION ALL SELECT zero_friend, 'T13 zero', zero_friend, NOW() FROM _t13_ids;
INSERT INTO public.friendships (user_id, friend_id, status)
SELECT actor, friend, 'accepted' FROM _t13_ids
UNION ALL SELECT actor, zero_friend, 'accepted' FROM _t13_ids;
INSERT INTO public.groups (id, name)
SELECT group_one, 'T13 one' FROM _t13_ids
UNION ALL SELECT group_two, 'T13 two' FROM _t13_ids
UNION ALL SELECT unauthorized_group, 'T13 unauthorized' FROM _t13_ids
UNION ALL SELECT zero_group, 'T13 zero' FROM _t13_ids;
INSERT INTO public.group_members (group_id, user_id, role)
SELECT group_one, actor, 'admin' FROM _t13_ids UNION ALL SELECT group_one, friend, 'member' FROM _t13_ids
UNION ALL SELECT group_one, other, 'member' FROM _t13_ids
UNION ALL SELECT group_two, actor, 'admin' FROM _t13_ids UNION ALL SELECT group_two, friend, 'member' FROM _t13_ids
UNION ALL SELECT unauthorized_group, actor, 'admin' FROM _t13_ids UNION ALL SELECT unauthorized_group, other, 'member' FROM _t13_ids
UNION ALL SELECT zero_group, actor, 'admin' FROM _t13_ids UNION ALL SELECT zero_group, zero_friend, 'member' FROM _t13_ids;

-- Direct -19; group one +10; group two -3; total -12 from actor's view.
DO $$ DECLARE f _t13_ids%ROWTYPE; expense_id UUID;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 'T13 direct debt', 19, 'USD', f.friend, f.friend, NOW()) RETURNING id INTO expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (expense_id, f.actor, 19, 'exact'), (expense_id, f.friend, 0, 'exact');
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_one, 'T13 group one', 40, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (expense_id, f.actor, 0, 'exact'), (expense_id, f.friend, 10, 'exact'), (expense_id, f.other, 30, 'exact');
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_two, 'T13 group two', 6, 'USD', f.friend, f.friend, NOW()) RETURNING id INTO expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (expense_id, f.actor, 3, 'exact'), (expense_id, f.friend, 3, 'exact');
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.zero_group, 'T13 zero group', 20, 'USD', f.zero_friend, f.zero_friend, NOW()) RETURNING id INTO expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (expense_id, f.actor, 10, 'exact'), (expense_id, f.zero_friend, 10, 'exact');
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 'T13 zero direct', 10, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (expense_id, f.actor, 0, 'exact'), (expense_id, f.zero_friend, 10, 'exact');
END $$;

-- Use the same authenticated role and JWT claim path as PostgREST callers.
GRANT SELECT ON _t13_ids TO authenticated;
CREATE TEMP TABLE _t13_partial_counts ON COMMIT DROP AS
SELECT COUNT(*) AS operations, (SELECT COUNT(*) FROM public.settlements) AS settlements,
  (SELECT COUNT(*) FROM public.settlement_scope_transfers) AS transfers,
  (SELECT COUNT(*) FROM public.settlement_cancellations) AS cancellations
FROM public.settlement_operations;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t13_ids;
DO $$
DECLARE f _t13_ids%ROWTYPE; r JSONB; allocations JSONB;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  allocations := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 3, 'currency', 'USD'));
  BEGIN
    -- Any transfer payload is frozen, including on partials.
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000001', f.friend, NULL, 'all_balances', 3, 'USD', NOW(), -12, allocations,
      jsonb_build_array(jsonb_build_object('groupId', f.group_one, 'fromUserId', f.friend,
        'toUserId', f.actor, 'amount', 10, 'currency', 'USD', 'signedGroupBalanceDelta', 10)));
    RAISE EXCEPTION 'partial cancellation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SETTLEMENT_TRANSFERS_FROZEN%' THEN RAISE; END IF;
  END;
  BEGIN
    -- Cancellations on a partial plan stay rejected: full-payment-only gate.
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000014', f.friend, NULL, 'all_balances', 3, 'USD', NOW(), -12, allocations,
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD')));
    RAISE EXCEPTION 'partial with cancellations was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SETTLEMENT_TRANSFERS_NOT_ALLOWED%' THEN RAISE; END IF;
  END;
  r := public.commit_settlement_operation(
    '93000000-0000-0000-0000-000000000002', f.friend, NULL, 'all_balances', 3, 'USD', NOW(), -12, allocations, '[]', '[]');
  IF (r->>'reused')::BOOLEAN OR (r->>'totalAmount')::NUMERIC <> 3
     OR jsonb_array_length(r->'settlements') <> 1 OR jsonb_array_length(r->'transfers') <> 0
     OR jsonb_array_length(r->'cancellations') <> 0 THEN
    RAISE EXCEPTION 'partial receipt is invalid: %', r;
  END IF;
END $$;
RESET ROLE;
DO $$ DECLARE f _t13_ids%ROWTYPE;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  IF (SELECT COUNT(*) FROM public.settlement_operations) <> (SELECT operations + 1 FROM _t13_partial_counts)
     OR (SELECT COUNT(*) FROM public.settlements) <> (SELECT settlements + 1 FROM _t13_partial_counts)
     OR (SELECT COUNT(*) FROM public.settlement_scope_transfers) <> (SELECT transfers FROM _t13_partial_counts)
     OR (SELECT COUNT(*) FROM public.settlement_cancellations) <> (SELECT cancellations FROM _t13_partial_counts) THEN
    RAISE EXCEPTION 'partial request with transfer persisted rows';
  END IF;
  IF private.settlement_pair_scope_balance(f.actor, f.friend, NULL, 'USD') <> -16
     OR private.settlement_pair_scope_balance(f.actor, f.friend, f.group_one, 'USD') <> 10
     OR private.settlement_pair_scope_balance(f.actor, f.friend, f.group_two, 'USD') <> -3 THEN
    RAISE EXCEPTION 'partial balances are incorrect';
  END IF;
END $$;
CREATE TEMP TABLE _t13_post_partial_scopes ON COMMIT DROP AS
SELECT scope, private.settlement_pair_scope_balance(actor, friend, scope, 'USD') AS balance
FROM _t13_ids
CROSS JOIN (VALUES (NULL::UUID), ((SELECT group_one FROM _t13_ids)), ((SELECT group_two FROM _t13_ids))) AS scopes(scope);
-- A competing expense write changes the ledger; the stale expected balance is
-- rejected before any settlement rows are committed.
INSERT INTO public.expenses (id, group_id, description, amount, currency, paid_by, created_by, date)
SELECT '94000000-0000-0000-0000-000000000001', NULL, 'T13 concurrent expense', 1, 'USD', friend, friend, NOW()
FROM _t13_ids;
INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
SELECT '94000000-0000-0000-0000-000000000001'::UUID, actor, 1, 'exact' FROM _t13_ids
UNION ALL SELECT '94000000-0000-0000-0000-000000000001'::UUID, friend, 0, 'exact' FROM _t13_ids;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t13_ids;
DO $$
DECLARE f _t13_ids%ROWTYPE;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000012', f.friend, NULL, 'all_balances', 12, 'USD', NOW(), -12,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 12, 'currency', 'USD')), '[]');
    RAISE EXCEPTION 'competing expense stale plan was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_STALE_BALANCE' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DELETE FROM public.expenses WHERE id = '94000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t13_ids;

-- Invalid requests fail against the still-nonzero post-partial balance.
RESET ROLE;
CREATE TEMP TABLE _t13_invalid_counts ON COMMIT DROP AS
SELECT COUNT(*) AS operations, (SELECT COUNT(*) FROM public.settlements) AS settlements,
  (SELECT COUNT(*) FROM public.settlement_scope_transfers) AS transfers,
  (SELECT COUNT(*) FROM public.settlement_cancellations) AS cancellations
FROM public.settlement_operations;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t13_ids;
DO $$
DECLARE f _t13_ids%ROWTYPE;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000004', f.friend, NULL, 'all_balances', 12, 'USD', NOW(), -11,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 12, 'currency', 'USD')), '[]');
    RAISE EXCEPTION 'stale plan was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_STALE_BALANCE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000005', f.friend, NULL, 'all_balances', 13, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 13, 'currency', 'USD')), '[]');
    RAISE EXCEPTION 'overpayment was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_ALLOCATION_OVER_BALANCE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000006', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.friend, 'toUserId', f.actor, 'amount', 9, 'currency', 'USD')), '[]');
    RAISE EXCEPTION 'malformed direction was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_ALLOCATION_INVALID' THEN RAISE; END IF; END;
  BEGIN
    -- Signed-delta entry shape is rejected on the dedicated surface: entries
    -- normalize to exactly {groupId, amount, currency}.
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000013', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')),
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD', 'signedGroupBalanceDelta', -3),
        jsonb_build_object('groupId', f.group_one, 'amount', 10, 'currency', 'USD')));
    RAISE EXCEPTION 'malformed cancellation direction/sign was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_TRANSFER_INVALID' THEN RAISE; END IF; END;
  BEGIN
    -- Mismatched cancellation amount is rejected against the server plan.
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000015', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')),
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD'),
        jsonb_build_object('groupId', f.group_one, 'amount', 9, 'currency', 'USD')));
    RAISE EXCEPTION 'mismatched cancellation amount was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_TRANSFER_INVALID' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000007', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD'),
        jsonb_build_object('groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 0, 'currency', 'USD')), '[]');
    RAISE EXCEPTION 'duplicate allocation was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_ALLOCATION_INVALID' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000008', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object('groupId', f.unauthorized_group, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')), '[]');
    RAISE EXCEPTION 'unauthorized group was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_GROUP_SCOPE_INVALID' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000009', f.friend, NULL, 'all_balances', 12, 'EUR', NOW(), -12,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 12, 'currency', 'EUR')), '[]');
    RAISE EXCEPTION 'unsupported currency was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_CURRENCY_UNSUPPORTED' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.other::TEXT, 'role', 'authenticated')::TEXT, true);
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000010', f.actor, NULL, 'all_balances', 1, 'USD', NOW(), 0,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.other, 'toUserId', f.actor, 'amount', 1, 'currency', 'USD')), '[]');
    RAISE EXCEPTION 'unauthorized caller was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_FRIENDSHIP_REQUIRED' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.actor::TEXT, 'role', 'authenticated')::TEXT, true);
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.settlement_operations) <> (SELECT operations FROM _t13_invalid_counts)
     OR (SELECT COUNT(*) FROM public.settlements) <> (SELECT settlements FROM _t13_invalid_counts)
     OR (SELECT COUNT(*) FROM public.settlement_scope_transfers) <> (SELECT transfers FROM _t13_invalid_counts)
     OR (SELECT COUNT(*) FROM public.settlement_cancellations) <> (SELECT cancellations FROM _t13_invalid_counts) THEN
    RAISE EXCEPTION 'invalid requests persisted rows';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t13_ids;

-- Remaining full $9 after the earlier $3 partial: direct cash plus exact
-- opposing group cancellations (planner order: absolute cents ascending,
-- group_two 3 before group_one 10). Reversing only this operation must
-- restore the captured post-$3 balances while leaving the first operation
-- committed.
DO $$
DECLARE f _t13_ids%ROWTYPE; r JSONB; allocations JSONB; cancellations JSONB; v_operation_id UUID;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  allocations := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD'));
  -- Dedicated surface (replaces ticket-17 option B signed legs): creditor-free
  -- entries with no participants and no signed delta.
  cancellations := jsonb_build_array(
    jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD'),
    jsonb_build_object('groupId', f.group_one, 'amount', 10, 'currency', 'USD'));
  r := public.commit_settlement_operation(
    '93000000-0000-0000-0000-000000000003', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9, allocations, '[]'::jsonb, cancellations);
  v_operation_id := (r->>'operationId')::UUID;
  IF (r->>'reused')::BOOLEAN OR (r->>'totalAmount')::NUMERIC <> 9
     OR jsonb_array_length(r->'settlements') <> 1 OR jsonb_array_length(r->'transfers') <> 0
     OR jsonb_array_length(r->'cancellations') <> 2 THEN
    RAISE EXCEPTION 'full receipt is invalid: %', r;
  END IF;
  IF (r->'cancellations'->0->>'groupId')::UUID <> f.group_two
     OR (r->'cancellations'->0->>'amount')::NUMERIC <> 3
     OR (r->'cancellations'->1->>'groupId')::UUID <> f.group_one
     OR (r->'cancellations'->1->>'amount')::NUMERIC <> 10 THEN
    RAISE EXCEPTION 'cancellation entries are invalid: %', r;
  END IF;
  r := public.commit_settlement_operation(
    '93000000-0000-0000-0000-000000000003', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9, allocations, '[]'::jsonb, cancellations);
  IF NOT (r->>'reused')::BOOLEAN OR (r->>'operationId')::UUID <> v_operation_id
     THEN
    RAISE EXCEPTION 'full retry duplicated rows: %', r;
  END IF;
  CREATE TEMP TABLE _t13_operation ON COMMIT DROP AS SELECT v_operation_id AS operation_id;
END $$;
RESET ROLE;
DO $$ DECLARE f _t13_ids%ROWTYPE; op UUID;
BEGIN
  SELECT * INTO f FROM _t13_ids; SELECT operation_id INTO op FROM _t13_operation;
  IF private.settlement_pair_scope_balance(f.actor, f.friend, NULL, 'USD') <> 0
     OR private.settlement_pair_scope_balance(f.actor, f.friend, f.group_one, 'USD') <> 0
     OR private.settlement_pair_scope_balance(f.actor, f.friend, f.group_two, 'USD') <> 0
     OR private.settlement_pair_scope_balance(f.actor, f.other, f.group_one, 'USD') <> 30
     OR (SELECT COUNT(*) FROM public.settlements s WHERE s.operation_id = op) <> 1
     OR (SELECT COUNT(*) FROM public.settlement_cancellations c WHERE c.operation_id = op AND NOT c.is_reversal) <> 2
     OR (SELECT COUNT(*) FROM public.settlement_cancellations c
         WHERE c.operation_id = op AND NOT c.is_reversal
           AND c.note = 'Full friend settlement balance cancellation') <> 2
     OR (SELECT COUNT(*) FROM public.settlement_scope_transfers t WHERE t.operation_id = op AND NOT t.is_reversal) <> 0 THEN
    RAISE EXCEPTION 'full settlement did not clear only the requested pair';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t13_ids;

-- Viewer-total group summaries stay exact on single-pair outstandings: the
-- two-member group reads exactly 0 and the three-member group reads exactly
-- the surviving third-member 30 (no offsetting viewer balances to clamp).
DO $$
DECLARE f _t13_ids%ROWTYPE; v NUMERIC;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  SELECT your_balance INTO v FROM public.get_groups_home_summaries() WHERE id = f.group_two;
  IF v IS NULL OR v <> 0 THEN RAISE EXCEPTION 'group_two summary % (want 0)', v; END IF;
  SELECT your_balance INTO v FROM public.get_groups_home_summaries() WHERE id = f.group_one;
  IF v IS NULL OR v <> 30 THEN RAISE EXCEPTION 'group_one summary % (want 30)', v; END IF;
END $$;

-- Whole operation reversal restores payment and cancellation effects and keeps history.
DO $$
DECLARE f _t13_ids%ROWTYPE; r JSONB; op UUID;
BEGIN
  SELECT * INTO f FROM _t13_ids; SELECT operation_id INTO op FROM _t13_operation;
  r := public.reverse_settlement_operation(op, 0);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'reversal failed: %', r; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE f _t13_ids%ROWTYPE; op UUID;
BEGIN
  SELECT * INTO f FROM _t13_ids; SELECT operation_id INTO op FROM _t13_operation;
  IF EXISTS (
       SELECT 1
       FROM _t13_post_partial_scopes expected
       WHERE private.settlement_pair_scope_balance(f.actor, f.friend, expected.scope, 'USD') <> expected.balance
     )
     OR (SELECT status FROM public.settlement_operations WHERE id = op) <> 'reversed'
     OR (SELECT status FROM public.settlement_operations WHERE payment_intent_id = '93000000-0000-0000-0000-000000000002'::UUID) <> 'committed'
     OR (SELECT COUNT(*) FROM public.settlements WHERE operation_id = op) <> 2
     OR (SELECT COUNT(*) FROM public.settlement_cancellations WHERE operation_id = op) <> 4
     OR (SELECT COUNT(*) FROM public.settlement_cancellations WHERE operation_id = op AND is_reversal) <> 2
     OR (SELECT COUNT(*) FROM public.settlement_scope_transfers WHERE operation_id = op) <> 0
     OR (SELECT COUNT(*) FROM public.settlement_operations WHERE payment_intent_id IN (
          '93000000-0000-0000-0000-000000000002'::UUID,
          '93000000-0000-0000-0000-000000000003'::UUID)) <> 2
     OR (SELECT COUNT(*) FROM public.settlements WHERE operation_id IN (
          (SELECT id FROM public.settlement_operations WHERE payment_intent_id = '93000000-0000-0000-0000-000000000002'::UUID), op)) <> 3 THEN
    RAISE EXCEPTION 'reversal did not restore whole operation';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t13_ids;

-- Naturally-zero snapshot before the final section.
RESET ROLE;
CREATE TEMP TABLE _t13_zero_counts ON COMMIT DROP AS
SELECT COUNT(*) AS operations, (SELECT COUNT(*) FROM public.settlements) AS settlements,
  (SELECT COUNT(*) FROM public.settlement_cancellations) AS cancellations
FROM public.settlement_operations;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t13_ids;

-- Reversal restores the summaries too: the cleared pair legs come back
-- while the third member's 30 never moved.
DO $$
DECLARE f _t13_ids%ROWTYPE; v NUMERIC;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  SELECT your_balance INTO v FROM public.get_groups_home_summaries() WHERE id = f.group_two;
  IF v IS NULL OR v <> -3 THEN RAISE EXCEPTION 'group_two summary after reversal % (want -3)', v; END IF;
  SELECT your_balance INTO v FROM public.get_groups_home_summaries() WHERE id = f.group_one;
  IF v IS NULL OR v <> 40 THEN RAISE EXCEPTION 'group_one summary after reversal % (want 40)', v; END IF;
END $$;

-- Naturally zero pair remains untouched; positive payment cannot create a zero operation.
DO $$
DECLARE f _t13_ids%ROWTYPE;
BEGIN
  SELECT * INTO f FROM _t13_ids;
  BEGIN
    PERFORM public.commit_settlement_operation(
      '93000000-0000-0000-0000-000000000011', f.zero_friend, NULL, 'all_balances', 1, 'USD', NOW(), 0,
      jsonb_build_array(jsonb_build_object('groupId', NULL, 'fromUserId', f.zero_friend, 'toUserId', f.actor, 'amount', 1, 'currency', 'USD')), '[]');
    RAISE EXCEPTION 'natural zero payment was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%SETTLEMENT_ALLOCATION_OVER_BALANCE%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.settlement_operations) <> (SELECT operations FROM _t13_zero_counts)
     OR (SELECT COUNT(*) FROM public.settlements) <> (SELECT settlements FROM _t13_zero_counts)
     OR (SELECT COUNT(*) FROM public.settlement_cancellations) <> (SELECT cancellations FROM _t13_zero_counts) THEN
    RAISE EXCEPTION 'natural zero request persisted rows';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
