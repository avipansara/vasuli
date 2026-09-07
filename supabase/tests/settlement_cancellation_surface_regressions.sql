-- Dedicated balance-cancellation surface (tasks 2-4) regressions.
-- Run against LOCAL Supabase after applying migrations:
--   docker cp supabase/tests/settlement_cancellation_surface_regressions.sql supabase_db_vasuli:/tmp/t2.sql
--   docker exec supabase_db_vasuli psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t2.sql
-- Every fixture and operation is rolled back at the end.
BEGIN;

CREATE TEMP TABLE _t2_ids (
  actor UUID, friend UUID, other UUID,
  group_one UUID, group_two UUID, outsider_group UUID
) ON COMMIT DROP;
INSERT INTO _t2_ids VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  'b1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000003'
);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor, 'authenticated', 'authenticated', 't2-actor@example.invalid', NOW(), NOW(), false, false FROM _t2_ids
UNION ALL SELECT friend, 'authenticated', 'authenticated', 't2-friend@example.invalid', NOW(), NOW(), false, false FROM _t2_ids
UNION ALL SELECT other, 'authenticated', 'authenticated', 't2-other@example.invalid', NOW(), NOW(), false, false FROM _t2_ids;
INSERT INTO public.users (id, name, auth_user_id, created_at)
SELECT actor, 'T2 actor', actor, NOW() FROM _t2_ids
UNION ALL SELECT friend, 'T2 friend', friend, NOW() FROM _t2_ids
UNION ALL SELECT other, 'T2 other', other, NOW() FROM _t2_ids;
INSERT INTO public.friendships (user_id, friend_id, status)
SELECT actor, friend, 'accepted' FROM _t2_ids;
INSERT INTO public.groups (id, name)
SELECT group_one, 'T2 one' FROM _t2_ids
UNION ALL SELECT group_two, 'T2 two' FROM _t2_ids
UNION ALL SELECT outsider_group, 'T2 outsider' FROM _t2_ids;
INSERT INTO public.group_members (group_id, user_id, role)
SELECT group_one, actor, 'admin' FROM _t2_ids UNION ALL SELECT group_one, friend, 'member' FROM _t2_ids
UNION ALL SELECT group_one, other, 'member' FROM _t2_ids
UNION ALL SELECT group_two, actor, 'admin' FROM _t2_ids UNION ALL SELECT group_two, friend, 'member' FROM _t2_ids
UNION ALL SELECT outsider_group, actor, 'admin' FROM _t2_ids UNION ALL SELECT outsider_group, other, 'member' FROM _t2_ids;

-- Same shape as the ticket-13 suite: direct -19, group one +10, group two -3,
-- total -12 from the actor's view.
DO $$ DECLARE f _t2_ids%ROWTYPE; expense_id UUID;
BEGIN
  SELECT * INTO f FROM _t2_ids;
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 'T2 direct debt', 19, 'USD', f.friend, f.friend, NOW()) RETURNING id INTO expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (expense_id, f.actor, 19, 'exact'), (expense_id, f.friend, 0, 'exact');
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_one, 'T2 group one', 40, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (expense_id, f.actor, 0, 'exact'), (expense_id, f.friend, 10, 'exact'), (expense_id, f.other, 30, 'exact');
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.group_two, 'T2 group two', 6, 'USD', f.friend, f.friend, NOW()) RETURNING id INTO expense_id;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (expense_id, f.actor, 3, 'exact'), (expense_id, f.friend, 3, 'exact');
END $$;

GRANT SELECT ON _t2_ids TO authenticated;

-- Partial $3 carries no cancellations: 1 cash row, empty receipt arrays,
-- opposing balances untouched.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t2_ids;
DO $$
DECLARE f _t2_ids%ROWTYPE; r JSONB;
BEGIN
  SELECT * INTO f FROM _t2_ids;
  r := public.commit_settlement_operation(
    'c1000000-0000-0000-0000-000000000001', f.friend, NULL, 'all_balances', 3, 'USD', NOW(), -12,
    jsonb_build_array(jsonb_build_object(
      'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 3, 'currency', 'USD')),
    '[]'::jsonb, '[]'::jsonb);
  IF (r->>'reused')::BOOLEAN OR (r->>'totalAmount')::NUMERIC <> 3
     OR jsonb_array_length(r->'settlements') <> 1
     OR jsonb_array_length(r->'transfers') <> 0
     OR jsonb_array_length(r->'cancellations') <> 0 THEN
    RAISE EXCEPTION 'partial receipt is invalid: %', r;
  END IF;
END $$;
RESET ROLE;
DO $$ DECLARE f _t2_ids%ROWTYPE;
BEGIN
  SELECT * INTO f FROM _t2_ids;
  IF private.settlement_pair_scope_balance(f.actor, f.friend, NULL, 'USD') <> -16
     OR private.settlement_pair_scope_balance(f.actor, f.friend, f.group_one, 'USD') <> 10
     OR private.settlement_pair_scope_balance(f.actor, f.friend, f.group_two, 'USD') <> -3 THEN
    RAISE EXCEPTION 'partial balances are incorrect';
  END IF;
END $$;

-- Guard probes against the post-partial -9 balance: nothing may persist.
CREATE TEMP TABLE _t2_guard_counts ON COMMIT DROP AS
SELECT COUNT(*) AS operations, (SELECT COUNT(*) FROM public.settlements) AS settlements,
  (SELECT COUNT(*) FROM public.settlement_scope_transfers) AS transfers,
  (SELECT COUNT(*) FROM public.settlement_cancellations) AS cancellations
FROM public.settlement_operations;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t2_ids;
DO $$
DECLARE f _t2_ids%ROWTYPE; cancellations JSONB;
BEGIN
  SELECT * INTO f FROM _t2_ids;
  -- Planner order: absolute cents ascending, then group UUID (group two 3 first).
  cancellations := jsonb_build_array(
    jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD'),
    jsonb_build_object('groupId', f.group_one, 'amount', 10, 'currency', 'USD'));
  BEGIN
    PERFORM public.commit_settlement_operation(
      'c1000000-0000-0000-0000-000000000011', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object(
        'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')),
      jsonb_build_array(jsonb_build_object('groupId', f.group_two, 'fromUserId', f.friend,
        'toUserId', f.actor, 'amount', 3, 'currency', 'USD', 'signedGroupBalanceDelta', -3)),
      cancellations);
    RAISE EXCEPTION 'transfer payload was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_TRANSFERS_FROZEN' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      'c1000000-0000-0000-0000-000000000012', f.friend, NULL, 'all_balances', 3, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object(
        'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 3, 'currency', 'USD')),
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD')));
    RAISE EXCEPTION 'partial with cancellations was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_TRANSFERS_NOT_ALLOWED' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      'c1000000-0000-0000-0000-000000000013', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object(
        'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')),
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD'),
        jsonb_build_object('groupId', f.group_one, 'amount', 9, 'currency', 'USD')));
    RAISE EXCEPTION 'mismatched cancellation amount was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_TRANSFER_INVALID' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      'c1000000-0000-0000-0000-000000000014', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object(
        'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')),
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD', 'signedGroupBalanceDelta', -3),
        jsonb_build_object('groupId', f.group_one, 'amount', 10, 'currency', 'USD')));
    RAISE EXCEPTION 'signed-delta cancellation entry was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_TRANSFER_INVALID' THEN RAISE; END IF; END;
  BEGIN
    -- Off-cent cancellation amounts never reach integer-cents planning.
    PERFORM public.commit_settlement_operation(
      'c1000000-0000-0000-0000-000000000017', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object(
        'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')),
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD'),
        jsonb_build_object('groupId', f.group_one, 'amount', 10.005, 'currency', 'USD')));
    RAISE EXCEPTION 'off-cent cancellation entry was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_TRANSFER_INVALID' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      'c1000000-0000-0000-0000-000000000015', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
      jsonb_build_array(jsonb_build_object(
        'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')),
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('groupId', f.outsider_group, 'amount', 3, 'currency', 'USD'),
        jsonb_build_object('groupId', f.group_one, 'amount', 10, 'currency', 'USD')));
    RAISE EXCEPTION 'outsider-group cancellation was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_GROUP_SCOPE_INVALID' AND SQLERRM <> 'SETTLEMENT_TRANSFER_INVALID' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_settlement_operation(
      'c1000000-0000-0000-0000-000000000016', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -8,
      jsonb_build_array(jsonb_build_object(
        'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD')),
      '[]'::jsonb, cancellations);
    RAISE EXCEPTION 'stale plan was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'SETTLEMENT_STALE_BALANCE' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.settlement_operations) <> (SELECT operations FROM _t2_guard_counts)
     OR (SELECT COUNT(*) FROM public.settlements) <> (SELECT settlements FROM _t2_guard_counts)
     OR (SELECT COUNT(*) FROM public.settlement_scope_transfers) <> (SELECT transfers FROM _t2_guard_counts)
     OR (SELECT COUNT(*) FROM public.settlement_cancellations) <> (SELECT cancellations FROM _t2_guard_counts) THEN
    RAISE EXCEPTION 'guard probes persisted rows';
  END IF;
END $$;

-- Full $9 after the $3 partial: direct cash 9 from actor plus cancellations
-- group_two 3, group_one 10. Receipt carries 1 settlement and 2
-- cancellations; all pair scopes read 0.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t2_ids;
DO $$
DECLARE f _t2_ids%ROWTYPE; r JSONB; allocations JSONB; cancellations JSONB; v_operation_id UUID;
BEGIN
  SELECT * INTO f FROM _t2_ids;
  allocations := jsonb_build_array(jsonb_build_object(
    'groupId', NULL, 'fromUserId', f.actor, 'toUserId', f.friend, 'amount', 9, 'currency', 'USD'));
  cancellations := jsonb_build_array(
    jsonb_build_object('groupId', f.group_two, 'amount', 3, 'currency', 'USD'),
    jsonb_build_object('groupId', f.group_one, 'amount', 10, 'currency', 'USD'));
  r := public.commit_settlement_operation(
    'c1000000-0000-0000-0000-000000000002', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
    allocations, '[]'::jsonb, cancellations);
  v_operation_id := (r->>'operationId')::UUID;
  IF (r->>'reused')::BOOLEAN OR (r->>'totalAmount')::NUMERIC <> 9
     OR jsonb_array_length(r->'settlements') <> 1
     OR jsonb_array_length(r->'transfers') <> 0
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
    'c1000000-0000-0000-0000-000000000002', f.friend, NULL, 'all_balances', 9, 'USD', NOW(), -9,
    allocations, '[]'::jsonb, cancellations);
  IF NOT (r->>'reused')::BOOLEAN OR (r->>'operationId')::UUID <> v_operation_id
     OR jsonb_array_length(r->'cancellations') <> 2 THEN
    RAISE EXCEPTION 'full retry duplicated rows: %', r;
  END IF;
  CREATE TEMP TABLE _t2_operation ON COMMIT DROP AS SELECT v_operation_id AS operation_id;
END $$;
RESET ROLE;
DO $$ DECLARE f _t2_ids%ROWTYPE; op UUID;
  direct NUMERIC; g1 NUMERIC; g2 NUMERIC; c1 NUMERIC; c2 NUMERIC;
  signed1 NUMERIC; signed2 NUMERIC;
BEGIN
  SELECT * INTO f FROM _t2_ids; SELECT operation_id INTO op FROM _t2_operation;
  -- Task 4: the pair-balance helper wires the cancellation sums, so the
  -- committed full settlement projects the whole clearing (0/0/0) instead
  -- of the Task 2 cash-only reads (-7/+10/-3).
  direct := private.settlement_pair_scope_balance(f.actor, f.friend, NULL, 'USD');
  g1 := private.settlement_pair_scope_balance(f.actor, f.friend, f.group_one, 'USD');
  g2 := private.settlement_pair_scope_balance(f.actor, f.friend, f.group_two, 'USD');
  IF direct <> 0 OR g1 <> 0 OR g2 <> 0 THEN
    RAISE EXCEPTION 'cancellation-aware balances are incorrect: % % %', direct, g1, g2;
  END IF;
  IF private.settlement_pair_scope_balance(f.friend, f.actor, NULL, 'USD') <> 0
     OR private.settlement_pair_scope_balance(f.friend, f.actor, f.group_one, 'USD') <> 0
     OR private.settlement_pair_scope_balance(f.friend, f.actor, f.group_two, 'USD') <> 0 THEN
    RAISE EXCEPTION 'friend-oriented cancellation balances are incorrect';
  END IF;
  -- The stored rows behind the projection: one cancellation per cleared
  -- group scope, direct cash counted exactly once.
  SELECT COALESCE(SUM(amount), 0) INTO c1 FROM public.settlement_cancellations
  WHERE operation_id = op AND group_id = f.group_one AND NOT is_reversal;
  SELECT COALESCE(SUM(amount), 0) INTO c2 FROM public.settlement_cancellations
  WHERE operation_id = op AND group_id = f.group_two AND NOT is_reversal;
  SELECT signed_group_balance_delta INTO signed1 FROM public.settlement_cancellations
  WHERE operation_id = op AND group_id = f.group_one AND NOT is_reversal;
  SELECT signed_group_balance_delta INTO signed2 FROM public.settlement_cancellations
  WHERE operation_id = op AND group_id = f.group_two AND NOT is_reversal;
  IF c1 <> 10 OR c2 <> 3 OR signed1 <> -10 OR signed2 <> 3 THEN
    RAISE EXCEPTION 'stored cancellation snapshots are incorrect: amounts % %, signed % %', c1, c2, signed1, signed2;
  END IF;
  IF private.settlement_pair_scope_balance(f.actor, f.other, f.group_one, 'USD') <> 30
     OR (SELECT COUNT(*) FROM public.settlements s WHERE s.operation_id = op) <> 1
     OR (SELECT COUNT(*) FROM public.settlement_cancellations c WHERE c.operation_id = op AND NOT c.is_reversal) <> 2
     OR (SELECT COUNT(*) FROM public.settlement_scope_transfers t WHERE t.operation_id = op AND NOT t.is_reversal) <> 0
     OR (SELECT COUNT(*) FROM public.settlement_cancellations c
         WHERE c.operation_id = op AND NOT c.is_reversal
           AND c.note = 'Full friend settlement balance cancellation') <> 2 THEN
    RAISE EXCEPTION 'full settlement did not clear only the requested pair';
  END IF;
END $$;
RESET ROLE;
DO $$ DECLARE f _t2_ids%ROWTYPE; op UUID;
BEGIN
  SELECT * INTO f FROM _t2_ids; SELECT operation_id INTO op FROM _t2_operation;
  IF (SELECT COUNT(*) FROM public.settlement_operations WHERE payment_intent_id IN (
        'c1000000-0000-0000-0000-000000000001'::UUID,
        'c1000000-0000-0000-0000-000000000002'::UUID)) <> 2
      OR (SELECT COUNT(*) FROM public.settlements WHERE operation_id IN (
           (SELECT id FROM public.settlement_operations WHERE payment_intent_id = 'c1000000-0000-0000-0000-000000000001'::UUID), op)) <> 2
      OR (SELECT COUNT(*) FROM public.settlement_cancellations WHERE operation_id = op AND is_reversal) <> 0 THEN
    RAISE EXCEPTION 'retry duplicated rows';
  END IF;
END $$;

-- Task 4: participant-scoped cancellation reads expose the committed rows
-- with group, amount, and currency; metadata readers carry per-operation
-- cancellations without touching cash attribution; pair totals project the
-- clearing while other members stay untouched.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t2_ids;
DO $$
DECLARE f _t2_ids%ROWTYPE; op UUID; r RECORD;
BEGIN
  SELECT * INTO f FROM _t2_ids; SELECT operation_id INTO op FROM _t2_operation;
  -- Friend-scoped read: both cancellations of the pair operation.
  SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total INTO r
  FROM public.get_friend_cancellations(f.friend);
  IF r.n <> 2 OR r.total <> 13 THEN
    RAISE EXCEPTION 'friend cancellations are incorrect: %', r;
  END IF;
  IF (SELECT COUNT(*) FROM public.get_friend_cancellations(f.friend)
      WHERE group_id = f.group_one AND amount = 10 AND currency = 'USD'
        AND NOT is_reversal
        AND note = 'Full friend settlement balance cancellation') <> 1
     OR (SELECT COUNT(*) FROM public.get_friend_cancellations(f.friend)
      WHERE group_id = f.group_two AND amount = 3 AND currency = 'USD'
        AND NOT is_reversal) <> 1 THEN
    RAISE EXCEPTION 'friend cancellation rows are incorrect';
  END IF;
  -- Group-scoped reads: one row per cleared scope.
  SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total INTO r
  FROM public.get_group_cancellations(f.group_one);
  IF r.n <> 1 OR r.total <> 10 THEN
    RAISE EXCEPTION 'group one cancellations are incorrect: %', r;
  END IF;
  SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total INTO r
  FROM public.get_group_cancellations(f.group_two);
  IF r.n <> 1 OR r.total <> 3 THEN
    RAISE EXCEPTION 'group two cancellations are incorrect: %', r;
  END IF;
  -- A group with no cancellations reads empty.
  IF (SELECT COUNT(*) FROM public.get_group_cancellations(f.outsider_group)) <> 0 THEN
    RAISE EXCEPTION 'outsider group cancellations leaked';
  END IF;
  -- Friend metadata carries per-operation cancellations; cash attribution
  -- still reads the $9 direct payment with no group cash.
  SELECT jsonb_array_length(cancellations), requested_payment_amount INTO r
  FROM public.get_friend_settlement_operations(f.friend)
  WHERE operation_id = op;
  IF r.jsonb_array_length <> 2 OR r.requested_payment_amount <> 9 THEN
    RAISE EXCEPTION 'friend operation metadata is incorrect: %', r;
  END IF;
  IF (SELECT COALESCE(jsonb_array_length(cancellations), -1)
      FROM public.get_friend_settlement_operations(f.friend)
      WHERE requested_payment_amount = 3) <> 0 THEN
    RAISE EXCEPTION 'partial operation metadata carries cancellations';
  END IF;
  -- Group metadata matches the operation via its cancellation alone, with
  -- zero local cash (cancellations never count as payment).
  SELECT jsonb_array_length(cancellations), local_payment_amount INTO r
  FROM public.get_group_settlement_operations(f.group_one)
  WHERE operation_id = op;
  IF r.jsonb_array_length <> 1 OR r.local_payment_amount <> 0 THEN
    RAISE EXCEPTION 'group operation metadata is incorrect: %', r;
  END IF;
  -- Pair totals project the clearing for the settled pair and leave the
  -- third member's 30 exactly where it was.
  SELECT group_amount, direct_amount, amount INTO r
  FROM public.get_group_pair_totals(f.group_one)
  WHERE (user_a = f.actor AND user_b = f.friend)
     OR (user_a = f.friend AND user_b = f.actor);
  IF r.group_amount <> 0 OR r.direct_amount <> 0 OR r.amount <> 0 THEN
    RAISE EXCEPTION 'pair totals did not clear: %', r;
  END IF;
  SELECT group_amount, amount INTO r
  FROM public.get_group_pair_totals(f.group_one)
  WHERE (user_a = f.actor AND user_b = f.other)
     OR (user_a = f.other AND user_b = f.actor);
  IF r.group_amount <> 30 OR r.amount <> 30 THEN
    RAISE EXCEPTION 'other member balance moved: %', r;
  END IF;
  -- A non-friend sees no pair cancellation rows.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', f.other::TEXT, 'role', 'authenticated')::TEXT, true);
  IF (SELECT COUNT(*) FROM public.get_friend_cancellations(f.actor)) <> 0 THEN
    RAISE EXCEPTION 'pair cancellations leaked to a non-friend';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', f.actor::TEXT, 'role', 'authenticated')::TEXT, true);
  -- Direct authenticated SELECTs stay RLS-denied by design (Task 1 ruling).
  BEGIN
    PERFORM COUNT(*) FROM public.settlement_cancellations;
    RAISE EXCEPTION 'direct cancellation select was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- Whole-operation reversal undoes the cancellations with the operation:
-- post-partial cash balances return, the operation reads `reversed`, and
-- history retains both the original and the compensating rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t2_ids;
DO $$
DECLARE f _t2_ids%ROWTYPE; r JSONB; op UUID;
BEGIN
  SELECT * INTO f FROM _t2_ids; SELECT operation_id INTO op FROM _t2_operation;
  r := public.reverse_settlement_operation(op, 0);
  IF r->>'status' <> 'reversed' OR (r->>'reused')::BOOLEAN
     OR (r->>'operationId')::UUID <> op OR (r->>'reversedAt') IS NULL THEN
    RAISE EXCEPTION 'reversal failed: %', r;
  END IF;
  CREATE TEMP TABLE _t2_reversed_at ON COMMIT DROP AS SELECT (r->>'reversedAt')::TIMESTAMPTZ AS reversed_at;
END $$;
RESET ROLE;
DO $$ DECLARE f _t2_ids%ROWTYPE; op UUID;
  direct NUMERIC; g1 NUMERIC; g2 NUMERIC; net1 NUMERIC; net2 NUMERIC;
BEGIN
  SELECT * INTO f FROM _t2_ids; SELECT operation_id INTO op FROM _t2_operation;
  direct := private.settlement_pair_scope_balance(f.actor, f.friend, NULL, 'USD');
  g1 := private.settlement_pair_scope_balance(f.actor, f.friend, f.group_one, 'USD');
  g2 := private.settlement_pair_scope_balance(f.actor, f.friend, f.group_two, 'USD');
  IF direct <> -16 OR g1 <> 10 OR g2 <> -3 THEN
    RAISE EXCEPTION 'post-partial balances did not return: % % %', direct, g1, g2;
  END IF;
  SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -amount ELSE amount END), 0) INTO net1
  FROM public.settlement_cancellations WHERE operation_id = op AND group_id = f.group_one;
  SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -amount ELSE amount END), 0) INTO net2
  FROM public.settlement_cancellations WHERE operation_id = op AND group_id = f.group_two;
  IF net1 <> 0 OR net2 <> 0 THEN
    RAISE EXCEPTION 'cancellations were not undone: % %', net1, net2;
  END IF;
  IF (SELECT status FROM public.settlement_operations WHERE id = op) <> 'reversed'
     OR (SELECT status FROM public.settlement_operations
         WHERE payment_intent_id = 'c1000000-0000-0000-0000-000000000001'::UUID) <> 'committed'
     OR (SELECT COUNT(*) FROM public.settlements WHERE operation_id = op) <> 2
     OR (SELECT COUNT(*) FROM public.settlement_cancellations WHERE operation_id = op AND NOT is_reversal) <> 2
     OR (SELECT COUNT(*) FROM public.settlement_cancellations
         WHERE operation_id = op AND is_reversal
           AND note = 'Reversal of settlement operation ' || op::TEXT) <> 2
     OR EXISTS (SELECT 1 FROM public.settlement_cancellations c
         WHERE c.operation_id = op AND c.is_reversal
           AND NOT EXISTS (SELECT 1 FROM public.settlement_cancellations o
             WHERE o.operation_id = op AND NOT o.is_reversal
               AND o.group_id = c.group_id AND o.amount = c.amount
               AND o.signed_group_balance_delta = c.signed_group_balance_delta
               AND o.currency = c.currency))
     OR private.settlement_pair_scope_balance(f.actor, f.other, f.group_one, 'USD') <> 30 THEN
    RAISE EXCEPTION 'reversal did not restore the whole operation';
  END IF;
END $$;

-- Idempotent re-reversal returns the stored receipt with no new rows.
DO $$ DECLARE op UUID;
BEGIN
  SELECT operation_id INTO op FROM _t2_operation;
  CREATE TEMP TABLE _t2_rereversal_counts ON COMMIT DROP AS
  SELECT (SELECT COUNT(*) FROM public.settlements WHERE operation_id = op) AS settlements,
    (SELECT COUNT(*) FROM public.settlement_cancellations WHERE operation_id = op) AS cancellations;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::TEXT, 'role', 'authenticated')::TEXT, true) FROM _t2_ids;
DO $$
DECLARE f _t2_ids%ROWTYPE; r JSONB; op UUID; expected_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO f FROM _t2_ids; SELECT operation_id INTO op FROM _t2_operation;
  SELECT reversed_at INTO expected_at FROM _t2_reversed_at;
  r := public.reverse_settlement_operation(op, 0);
  IF r->>'status' <> 'reversed' OR NOT (r->>'reused')::BOOLEAN
     OR (r->>'reversedAt')::TIMESTAMPTZ <> expected_at THEN
    RAISE EXCEPTION 're-reversal did not reuse the stored receipt: %', r;
  END IF;
END $$;
RESET ROLE;
DO $$ DECLARE op UUID;
BEGIN
  SELECT operation_id INTO op FROM _t2_operation;
  IF (SELECT COUNT(*) FROM public.settlements WHERE operation_id = op)
       <> (SELECT settlements FROM _t2_rereversal_counts)
     OR (SELECT COUNT(*) FROM public.settlement_cancellations WHERE operation_id = op)
       <> (SELECT cancellations FROM _t2_rereversal_counts) THEN
    RAISE EXCEPTION 're-reversal duplicated rows';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
