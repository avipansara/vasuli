-- Server transfer-orientation regressions (ticket 09).
-- Decoy fixture mirrors the dev-proven shape 1:1: reviewer (actor) paid two
-- group expenses ($31 + $10, even splits), one group cash payment friend ->
-- reviewer ($36, legacy operation NULL), one from-user-oriented transfer row
-- (delta -15.50, from friend -> reviewer, operation actor reviewer), and the
-- linked direct cash payment ($15.50 friend -> reviewer, same operation).
--
-- Ground truth (ADR-0004 backfill contract, ticket 04): stored deltas are
-- from-user-oriented -- the change to the FROM-user's group balance, with the
-- inverse applied to direct. Every balance-touching reader must share that
-- one orientation:
--   group  viewer == from ? +delta : -delta   (mirrors
--          services/group-balance.ts and get_group_pair_totals gtrans)
--   direct base - SUM(group deltas in currency) (mirrors
--          projectFriendRelationship adjusted_direct)
-- The home/groups readers regressed to actor-oriented application in
-- 20260819010000 and read -31.00 on this fixture; the group page (client)
-- reads 0/0. This file fails until the readers agree with the row set.
--
-- Timeline fidelity: rows are inserted in commit order (expense, operation +
-- transfer + direct cash while the actor base is +15.50 so the frozen
-- commit-time trigger accepts the row, then the later $10 expense and the
-- $36 group payment), then final-state agreement is asserted. A reversal
-- transfer row must stay neutral in the unfiltered projections (swapped
-- participants, preserved delta cancel under participant-based application),
-- and a simulated backfill (two converted cash rows carrying
-- backfilled_transfer_id, exactly per the ticket-04 contract, without running
-- ticket 04 itself) must leave every server number identical: converted
-- transfers are excludable by readers, so a future backfill cannot
-- double-count. Correct (transfer-free) pairs are asserted unchanged.
--
-- Run against LOCAL Supabase only, isolated transaction, rolls back.
-- docker cp supabase/tests/settlement_transfer_orientation_regressions.sql supabase_db_vasuli:/tmp/regress.sql
-- docker exec supabase_db_vasuli psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/regress.sql
BEGIN;

CREATE TEMP TABLE _t09_ids (
  actor uuid, friend uuid, third uuid, grp uuid, grp2 uuid, op uuid, pi uuid
) ON COMMIT DROP;
INSERT INTO _t09_ids VALUES (
  '98000000-0000-0000-0000-000000000001',
  '99000000-0000-0000-0000-000000000002',
  '99000000-0000-0000-0000-000000000003',
  '95000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000002',
  '97000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000001'
);

-- Synthetic auth + app users (actor == auth id, mirrors existing SQL tests).
-- Placeholder names only; no real user data anywhere in this harness.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor,'authenticated','authenticated','t09-actor@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t09_ids
UNION ALL SELECT friend,'authenticated','authenticated','t09-friend@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t09_ids
UNION ALL SELECT third,'authenticated','authenticated','t09-third@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t09_ids;

INSERT INTO public.users (id, name, auth_user_id, created_at)
SELECT actor,'T09 actor',actor,'2026-01-01'::timestamptz FROM _t09_ids
UNION ALL SELECT friend,'T09 Friend',friend,'2026-01-01'::timestamptz FROM _t09_ids
UNION ALL SELECT third,'T09 Third',third,'2026-01-01'::timestamptz FROM _t09_ids;

INSERT INTO public.friendships (user_id, friend_id, status)
SELECT actor, friend, 'accepted' FROM _t09_ids
UNION ALL SELECT actor, third, 'accepted' FROM _t09_ids;

INSERT INTO public.groups (id, name)
SELECT grp, 'T09 group' FROM _t09_ids
UNION ALL SELECT grp2, 'T09 control group' FROM _t09_ids;

INSERT INTO public.group_members (group_id, user_id, role)
SELECT grp, actor, 'admin' FROM _t09_ids
UNION ALL SELECT grp, friend, 'member' FROM _t09_ids
UNION ALL SELECT grp2, actor, 'admin' FROM _t09_ids
UNION ALL SELECT grp2, third, 'member' FROM _t09_ids;

-- Correct control pair (actor <-> third, separate group): one group expense,
-- no transfers. Must read identically before and after every section below.
DO $$
DECLARE f _t09_ids%ROWTYPE; e uuid;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.grp2, 't09 control', 20, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 10, 'exact'), (e, f.third, 10, 'exact');
END $$;

-- Commit order, mirroring dev: $31 expense, then the operation (actor base
-- +15.50, so the frozen commit-time trigger accepts delta -15.50), then the
-- later $10 expense and the $36 group cash payment.
DO $$
DECLARE f _t09_ids%ROWTYPE; e uuid;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.grp, 't09 dinner', 31, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 15.50, 'exact'), (e, f.friend, 15.50, 'exact');

  INSERT INTO public.settlement_operations
    (id, actor_user_id, friend_user_id, group_id, mode, currency,
     expected_balance, requested_payment_amount, payment_intent_id)
  VALUES (f.op, f.actor, f.friend, NULL, 'all_balances', 'USD', 0, 15.50, f.pi);

  SET LOCAL session_replication_role = replica;
  INSERT INTO public.settlement_scope_transfers
    (operation_id, group_id, from_user_id, to_user_id, currency,
     signed_group_balance_delta, note)
  VALUES (f.op, f.grp, f.friend, f.actor, 'USD', -15.50, 'T09 decoy');
  SET LOCAL session_replication_role = origin;

  INSERT INTO public.settlements
    (group_id, from_user_id, to_user_id, amount, currency, date, operation_id)
  VALUES (NULL, f.friend, f.actor, 15.50, 'USD', NOW(), f.op);

  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.grp, 't09 taxi', 10, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 5, 'exact'), (e, f.friend, 5, 'exact');

  INSERT INTO public.settlements
    (group_id, from_user_id, to_user_id, amount, currency, date, operation_id)
  VALUES (f.grp, f.friend, f.actor, 36.00, 'USD', NOW(), NULL);
END $$;

GRANT SELECT ON _t09_ids TO authenticated;
-- Same pre-existing local drift workaround as the other regression suites:
-- the home RPCs select users.push_token/is_active absent from some local
-- checkouts.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
SET LOCAL ROLE authenticated;

-- 1) Actor view: home group row agrees with the row set (0, not -31).
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t09_ids;
DO $$
DECLARE f _t09_ids%ROWTYPE; v numeric;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  SELECT (item->>'amount')::numeric INTO v
  FROM public.get_friend_home_relationships() home
  CROSS JOIN LATERAL jsonb_array_elements(home.relationship -> 'groupBalances') item
  WHERE home.id = f.friend AND item->>'groupId' = f.grp::text;
  IF v IS NULL THEN RAISE EXCEPTION 'T09: home group row missing for transfer pair'; END IF;
  IF ABS(v) >= 0.01 THEN RAISE EXCEPTION 'T09: home group row % (want 0)', v; END IF;
END $$;

-- 2) Friend view is symmetric: the same row reads 0 from the other side.
SELECT set_config('request.jwt.claims', json_build_object('sub', friend::text, 'role', 'authenticated')::text, true) FROM _t09_ids;
DO $$
DECLARE f _t09_ids%ROWTYPE; v numeric;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  SELECT (item->>'amount')::numeric INTO v
  FROM public.get_friend_home_relationships() home
  CROSS JOIN LATERAL jsonb_array_elements(home.relationship -> 'groupBalances') item
  WHERE home.id = f.actor AND item->>'groupId' = f.grp::text;
  IF v IS NULL THEN RAISE EXCEPTION 'T09: home group row missing for friend view'; END IF;
  IF ABS(v) >= 0.01 THEN RAISE EXCEPTION 'T09: friend-view home group row % (want 0)', v; END IF;
END $$;

-- 3) Groups home card agrees with the group ledger (0, not -31).
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t09_ids;
DO $$
DECLARE f _t09_ids%ROWTYPE; v numeric;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  SELECT your_balance INTO v FROM public.get_groups_home_summaries() WHERE id = f.grp;
  IF v IS NULL THEN RAISE EXCEPTION 'T09: groups home row missing'; END IF;
  IF ABS(v) >= 0.01 THEN RAISE EXCEPTION 'T09: groups home balance % (want 0)', v; END IF;
END $$;

-- 4) Pair totals agree on the group leg (actor is user_a by UUID order).
DO $$
DECLARE f _t09_ids%ROWTYPE; v numeric;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  SELECT group_amount INTO v FROM public.get_group_pair_totals(f.grp)
  WHERE user_a = f.actor AND user_b = f.friend AND currency = 'USD';
  IF v IS NULL THEN RAISE EXCEPTION 'T09: pair totals row missing'; END IF;
  IF ABS(v) >= 0.01 THEN RAISE EXCEPTION 'T09: pair totals group % (want 0)', v; END IF;
END $$;

-- 5) Correct control pair is untouched (actor owed 10 by third).
DO $$
DECLARE f _t09_ids%ROWTYPE; v numeric;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  SELECT (item->>'amount')::numeric INTO v
  FROM public.get_friend_home_relationships() home
  CROSS JOIN LATERAL jsonb_array_elements(home.relationship -> 'groupBalances') item
  WHERE home.id = f.third AND item->>'groupId' = f.grp2::text;
  IF v IS NULL THEN RAISE EXCEPTION 'T09: home group row missing for control pair'; END IF;
  IF ABS(v - 10) >= 0.01 THEN RAISE EXCEPTION 'T09: control pair group row % (want 10)', v; END IF;
END $$;

-- Snapshot the full server relationship before the reversal/backfill probes.
CREATE TEMP TABLE _t09_before ON COMMIT DROP AS
SELECT home.id AS friend_id, home.relationship
FROM public.get_friend_home_relationships() home;

-- 6) A reversal transfer row (swapped participants, preserved delta) cancels
-- the original exactly in the unfiltered projections: the group row returns
-- to the transfer-free base (-15.50), proving reversal neutrality under
-- participant-based application. (The probe row is removed afterwards so the
-- backfill section below starts from the snapshotted state.)
RESET ROLE;
DO $$
DECLARE f _t09_ids%ROWTYPE;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  INSERT INTO public.settlement_scope_transfers
    (operation_id, group_id, from_user_id, to_user_id, currency,
     signed_group_balance_delta, note, is_reversal)
  VALUES (f.op, f.grp, f.actor, f.friend, 'USD', -15.50,
    'Reversal of settlement operation ' || f.op::text, true);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t09_ids;
DO $$
DECLARE f _t09_ids%ROWTYPE; v numeric;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  SELECT (item->>'amount')::numeric INTO v
  FROM public.get_friend_home_relationships() home
  CROSS JOIN LATERAL jsonb_array_elements(home.relationship -> 'groupBalances') item
  WHERE home.id = f.friend AND item->>'groupId' = f.grp::text;
  IF ABS(v + 15.50) >= 0.01 THEN RAISE EXCEPTION 'T09: reversal did not cancel, home group row % (want -15.50)', v; END IF;
END $$;
RESET ROLE;
DELETE FROM public.settlement_scope_transfers WHERE is_reversal AND operation_id IN (SELECT op FROM _t09_ids);
SET LOCAL ROLE authenticated;

-- 7) Simulated backfill (exactly the ticket-04 contract: two plain payments
-- per non-reversal transfer, same timestamps/attribution, marker column plus
-- notes prefix, transfer rows kept) leaves every server number identical --
-- converted transfers are excludable by readers, so a future backfill cannot
-- double-count. Requires the marker column from the ticket-09 migration.
RESET ROLE;
DO $$
DECLARE f _t09_ids%ROWTYPE; t uuid; ts timestamptz;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  SELECT id, created_at INTO t, ts FROM public.settlement_scope_transfers
  WHERE operation_id = f.op AND NOT is_reversal;
  INSERT INTO public.settlements
    (group_id, from_user_id, to_user_id, amount, currency, date, created_at,
     notes, operation_id, backfilled_transfer_id)
  VALUES
    (f.grp, f.actor, f.friend, 15.50, 'USD', ts, ts,
     '[ADR-0004 backfill ' || t::text || ' group] T09 decoy', f.op, t),
    (NULL, f.friend, f.actor, 15.50, 'USD', ts, ts,
     '[ADR-0004 backfill ' || t::text || ' direct] T09 decoy', f.op, t);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t09_ids;
DO $$
DECLARE n_bad int;
BEGIN
  SELECT COUNT(*) INTO n_bad
  FROM public.get_friend_home_relationships() home
  JOIN _t09_before b ON b.friend_id = home.id
  WHERE home.relationship <> b.relationship;
  IF n_bad > 0 THEN RAISE EXCEPTION 'T09: simulated backfill moved % home relationship(s)', n_bad; END IF;
END $$;
DO $$
DECLARE f _t09_ids%ROWTYPE; v numeric;
BEGIN
  SELECT * INTO f FROM _t09_ids;
  SELECT your_balance INTO v FROM public.get_groups_home_summaries() WHERE id = f.grp;
  IF ABS(v) >= 0.01 THEN RAISE EXCEPTION 'T09: simulated backfill moved groups balance to % (want 0)', v; END IF;
  SELECT group_amount INTO v FROM public.get_group_pair_totals(f.grp)
  WHERE user_a = f.actor AND user_b = f.friend AND currency = 'USD';
  IF ABS(v) >= 0.01 THEN RAISE EXCEPTION 'T09: simulated backfill moved pair totals group to % (want 0)', v; END IF;
  SELECT COUNT(*) INTO v FROM public.get_group_scope_transfers(f.grp);
  IF v <> 0 THEN RAISE EXCEPTION 'T09: converted transfer still readable via group scope RPC (%)', v; END IF;
  SELECT COUNT(*) INTO v FROM public.get_friend_scope_transfers(f.friend);
  IF v <> 0 THEN RAISE EXCEPTION 'T09: converted transfer still readable via friend scope RPC (%)', v; END IF;
END $$;

RESET ROLE;
ROLLBACK;
