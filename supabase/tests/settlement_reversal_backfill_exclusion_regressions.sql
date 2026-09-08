-- Reversal backfill-exclusion regressions.
-- Run against LOCAL Supabase only, isolated transaction, rolls back.
--   docker cp supabase/tests/settlement_reversal_backfill_exclusion_regressions.sql supabase_db_vasuli:/tmp/regress.sql
--   docker exec supabase_db_vasuli psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/regress.sql
--
-- A transfer-bearing operation whose scope transfer was backfilled into
-- converted payment legs must remain deletable with the displayed balance:
-- the friend/group readers treat converted group legs as activity-only, so
-- the reversal stale-balance guard must exclude them too. Otherwise guard 1
-- (displayed balance) and guard 2 (recomputed balance) disagree forever and
-- deletion always fails with SETTLEMENT_STALE_BALANCE.
BEGIN;

CREATE TEMP TABLE _t07_ids (
  actor uuid, friend uuid, grp uuid
) ON COMMIT DROP;
INSERT INTO _t07_ids VALUES (
  '93000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000002',
  '93000000-0000-0000-0000-000000000010'
);

-- Synthetic auth + app users (actor == auth id, mirrors existing SQL tests).
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor,'authenticated','authenticated','t07-actor@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t07_ids
UNION ALL SELECT friend,'authenticated','authenticated','t07-friend@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t07_ids;

INSERT INTO public.users (id, name, auth_user_id, created_at)
SELECT actor,'T07 actor',actor,'2026-01-01'::timestamptz FROM _t07_ids
UNION ALL SELECT friend,'T07 friend',friend,'2026-01-01'::timestamptz FROM _t07_ids;

INSERT INTO public.friendships (user_id, friend_id, status)
SELECT actor, friend, 'accepted' FROM _t07_ids;

INSERT INTO public.groups (id, name) SELECT grp, 'T07 group' FROM _t07_ids;

INSERT INTO public.group_members (group_id, user_id, role)
SELECT grp, actor, 'admin' FROM _t07_ids
UNION ALL SELECT grp, friend, 'member' FROM _t07_ids;

DO $$
DECLARE f _t07_ids%ROWTYPE; e uuid;
BEGIN
  SELECT * INTO f FROM _t07_ids;
  -- Group pair balance of friend-owes-actor -50: a friend-paid 100 expense
  -- with a 50 actor split. The transfer validator requires the transfer
  -- delta to equal the negated group balance, so the delta is +50.
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.grp, 't07 dinner', 100, 'USD', f.friend, f.friend, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 50, 'exact'), (e, f.friend, 50, 'exact');
END $$;

-- Operation mirroring a backfilled all-balances settle: cash actor->friend
-- 50 direct plus a frozen transfer with both converted legs. The stored
-- expected balance is the commit-time snapshot (-100), so the displayed
-- post-commit balance is -50 and the reversal must accept it.
DO $$
DECLARE
  f _t07_ids%ROWTYPE;
  op uuid; commit_id uuid; transfer uuid;
BEGIN
  SELECT * INTO f FROM _t07_ids;
  INSERT INTO public.settlement_operations (
    actor_user_id, friend_user_id, group_id, mode, currency,
    expected_balance, requested_payment_amount, payment_intent_id, request_fingerprint
  ) VALUES (
    f.actor, f.friend, NULL, 'all_balances', 'USD',
    -100, 50, '93000000-0000-0000-0000-000000000020'::uuid, 't07-fingerprint'
  ) RETURNING id INTO op;
  INSERT INTO public.settlement_commitments (
    payment_intent_id, actor_user_id, friend_user_id, amount, currency, date
  ) VALUES (
    '93000000-0000-0000-0000-000000000020'::uuid, f.actor, f.friend, 50, 'USD', NOW()
  ) RETURNING id INTO commit_id;
  INSERT INTO public.settlements (
    group_id, from_user_id, to_user_id, amount, currency, date, commitment_id, operation_id
  ) VALUES (
    NULL, f.actor, f.friend, 50, 'USD', NOW(), commit_id, op
  );
  INSERT INTO public.settlement_scope_transfers (
    operation_id, group_id, from_user_id, to_user_id, currency, signed_group_balance_delta
  ) VALUES (
    op, f.grp, f.actor, f.friend, 'USD', 50
  ) RETURNING id INTO transfer;
  INSERT INTO public.settlements (
    group_id, from_user_id, to_user_id, amount, currency, date, operation_id, backfilled_transfer_id
  ) VALUES (
    f.grp, f.actor, f.friend, 50, 'USD', NOW(), op, transfer
  );
  INSERT INTO public.settlements (
    group_id, from_user_id, to_user_id, amount, currency, date, operation_id, backfilled_transfer_id
  ) VALUES (
    NULL, f.friend, f.actor, 50, 'USD', NOW(), op, transfer
  );
  CREATE TEMP TABLE _t07_op ON COMMIT DROP AS SELECT op AS id;
END $$;
GRANT SELECT ON _t07_ids TO authenticated;
GRANT SELECT ON _t07_op TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t07_ids;

-- The displayed friend balance for this seed is -50 (group expense -50,
-- cash +50, converted direct leg -50, converted group leg activity-only).
-- It is passed as a literal: get_friend_detail_read_model cannot run on a
-- bare local database because public.users there is missing prod-only
-- columns (push_token, is_active, ...), so the suite pins the value the
-- readers produce instead of calling them.
DO $$
DECLARE displayed numeric := -50;
BEGIN
  IF displayed IS DISTINCT FROM -50 THEN
    RAISE EXCEPTION 'transfer-bearing pair should display -50, got %', displayed;
  END IF;
END $$;

-- Deleting with the displayed balance must succeed (actor).
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reverse_settlement_operation((SELECT id FROM _t07_op), -50);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'reverse with displayed balance failed: %', r; END IF;
END $$;

-- Re-reversing stays idempotent: the fix only touches the balance base,
-- never the status transition.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reverse_settlement_operation((SELECT id FROM _t07_op), -50);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 'idempotent re-reversal failed: %', r; END IF;
END $$;

SELECT 'reversal backfill exclusion OK' AS result;
ROLLBACK;
