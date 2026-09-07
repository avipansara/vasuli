-- Backfill parity harness (ADR-0004 ticket 02).
-- Proves that converting non-reversal settlement_scope_transfers rows into
-- plain per-scope payments leaves every balance exactly where it is.
--
-- Conversion contract under test (ticket 04 must implement exactly this):
-- each NON-reversal transfer (group g, from f, to u, currency c, delta d,
-- timestamp ts, operation op) becomes TWO settlement rows preserving
-- timestamps, attribution, amounts, and currencies:
--   group leg : group_id = g,  direction f->u if d > 0 else u->f, amount |d|
--   direct leg: group_id NULL, direction u->f if d > 0 else f->u, amount |d|
-- The direct leg is the inverse of the group leg because the relationship
-- projection applies transfers to direct with the opposite sign
-- (services/friend-detail-service.ts projectFriendRelationship,
-- get_friend_home_relationships adjusted_direct). A naive single-payment
-- conversion would preserve the group leg but move the direct leg and the
-- combined net; the sensitivity probe below proves this harness catches that.
--
-- Projections compared, per pair (a < b), per currency, group legs per group:
--   group  A: bilateral expenses + pair settlements + transfer deltas
--            (from=b -> -d / to=b -> +d, non-reversal only; mirrors
--            services/group-balance.ts and get_group_pair_totals gtrans)
--   group  B: same base + converted group payments (same orientation rule)
--   direct A: direct expenses + direct settlements - transfer deltas summed
--            across groups in the same currency (inverse; mirrors the
--            relationship direct projection)
--   direct B: same base + converted direct payments (same orientation rule)
-- Any mismatch raises (blocks ticket 04 by design); this file never
-- warns-and-continues. Reversal transfer rows (is_reversal) are excluded
-- from the conversion input on both sides.
--
-- Dry-run only: transaction-local fixtures + ROLLBACK. The comparison engine
-- itself is pure SELECTs over settlements/scope_transfers, so after the
-- fixture assertions it also sweeps every pre-existing dev row (fixtures
-- included) with the same gate.
-- Run against LOCAL Supabase only, isolated transaction, rolls back.
-- docker cp supabase/tests/settlement_backfill_parity_regressions.sql supabase_db_vasuli:/tmp/regress.sql
-- docker exec supabase_db_vasuli psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/regress.sql
BEGIN;

CREATE TEMP TABLE _t02_ids (
  actor uuid, friend_a uuid, friend_b uuid, friend_c uuid, friend_d uuid, friend_e uuid,
  g1 uuid, g2 uuid, g3 uuid, g4 uuid, g5 uuid,
  op_a uuid, op_b uuid, op_c uuid, op_d uuid, op_e uuid
) ON COMMIT DROP;
INSERT INTO _t02_ids VALUES (
  '94000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000002',
  '94000000-0000-0000-0000-000000000003',
  '94000000-0000-0000-0000-000000000004',
  '94000000-0000-0000-0000-000000000005',
  '94000000-0000-0000-0000-000000000006',
  '95000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000002',
  '95000000-0000-0000-0000-000000000003',
  '95000000-0000-0000-0000-000000000004',
  '95000000-0000-0000-0000-000000000005',
  '97000000-0000-0000-0000-000000000001',
  '97000000-0000-0000-0000-000000000002',
  '97000000-0000-0000-0000-000000000003',
  '97000000-0000-0000-0000-000000000004',
  '97000000-0000-0000-0000-000000000005'
);

-- Synthetic auth + app users (actor == auth id, mirrors existing SQL tests).
-- Placeholder names only; no real user data anywhere in this harness.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor,'authenticated','authenticated','t02-actor@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t02_ids
UNION ALL SELECT friend_a,'authenticated','authenticated','t02-a@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t02_ids
UNION ALL SELECT friend_b,'authenticated','authenticated','t02-b@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t02_ids
UNION ALL SELECT friend_c,'authenticated','authenticated','t02-c@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t02_ids
UNION ALL SELECT friend_d,'authenticated','authenticated','t02-d@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t02_ids
UNION ALL SELECT friend_e,'authenticated','authenticated','t02-e@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t02_ids;

INSERT INTO public.users (id, name, auth_user_id, created_at)
SELECT actor,'T02 actor',actor,'2026-01-01'::timestamptz FROM _t02_ids
UNION ALL SELECT friend_a,'T02 Friend A',friend_a,'2026-01-01'::timestamptz FROM _t02_ids
UNION ALL SELECT friend_b,'T02 Friend B',friend_b,'2026-01-01'::timestamptz FROM _t02_ids
UNION ALL SELECT friend_c,'T02 Friend C',friend_c,'2026-01-01'::timestamptz FROM _t02_ids
UNION ALL SELECT friend_d,'T02 Friend D',friend_d,'2026-01-01'::timestamptz FROM _t02_ids
UNION ALL SELECT friend_e,'T02 Friend E',friend_e,'2026-01-01'::timestamptz FROM _t02_ids;

INSERT INTO public.friendships (user_id, friend_id, status)
SELECT actor, friend_a, 'accepted' FROM _t02_ids
UNION ALL SELECT actor, friend_b, 'accepted' FROM _t02_ids
UNION ALL SELECT actor, friend_c, 'accepted' FROM _t02_ids
UNION ALL SELECT actor, friend_d, 'accepted' FROM _t02_ids
UNION ALL SELECT actor, friend_e, 'accepted' FROM _t02_ids;

INSERT INTO public.groups (id, name)
SELECT g1, 'T02 group one' FROM _t02_ids
UNION ALL SELECT g2, 'T02 group two' FROM _t02_ids
UNION ALL SELECT g3, 'T02 group three' FROM _t02_ids
UNION ALL SELECT g4, 'T02 group four' FROM _t02_ids
UNION ALL SELECT g5, 'T02 group five' FROM _t02_ids;

INSERT INTO public.group_members (group_id, user_id, role)
SELECT g1, actor, 'admin' FROM _t02_ids
UNION ALL SELECT g1, friend_a, 'member' FROM _t02_ids
UNION ALL SELECT g2, actor, 'admin' FROM _t02_ids
UNION ALL SELECT g2, friend_b, 'member' FROM _t02_ids
UNION ALL SELECT g3, actor, 'admin' FROM _t02_ids
UNION ALL SELECT g3, friend_c, 'member' FROM _t02_ids
UNION ALL SELECT g4, actor, 'admin' FROM _t02_ids
UNION ALL SELECT g4, friend_c, 'member' FROM _t02_ids
UNION ALL SELECT g5, actor, 'admin' FROM _t02_ids
UNION ALL SELECT g5, friend_e, 'member' FROM _t02_ids;

-- Balances (actor perspective, before operations):
-- A (full-net): direct +10, group g1 -8 => net +2
-- B (zero-net): direct +8, group g2 -8 => net 0
-- C (multi-group): group g3 -5, group g4 +7 => net +2
-- D (no-transfer baseline): direct -20
-- E (to be reversed): direct +10, group g5 -8 => net +2
DO $$
DECLARE f _t02_ids%ROWTYPE; e uuid;
BEGIN
  SELECT * INTO f FROM _t02_ids;
  -- A direct +10: paid by actor, Friend A split 10
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't02 A direct', 10, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 0, 'exact'), (e, f.friend_a, 10, 'exact');
  -- A group -8: paid by Friend A (16), actor split 8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.g1, 't02 A group', 16, 'USD', f.friend_a, f.friend_a, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 8, 'exact'), (e, f.friend_a, 8, 'exact');

  -- B direct +8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't02 B direct', 8, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 0, 'exact'), (e, f.friend_b, 8, 'exact');
  -- B group -8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.g2, 't02 B group', 16, 'USD', f.friend_b, f.friend_b, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 8, 'exact'), (e, f.friend_b, 8, 'exact');

  -- C g3 -5: paid by Friend C (10), actor split 5
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.g3, 't02 C g3', 10, 'USD', f.friend_c, f.friend_c, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 5, 'exact'), (e, f.friend_c, 5, 'exact');
  -- C g4 +7: paid by actor (14), Friend C split 7
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.g4, 't02 C g4', 14, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 7, 'exact'), (e, f.friend_c, 7, 'exact');

  -- D direct -20: paid by Friend D, actor split 20
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't02 D direct', 20, 'USD', f.friend_d, f.friend_d, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 20, 'exact'), (e, f.friend_d, 0, 'exact');

  -- E direct +10
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't02 E direct', 10, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 0, 'exact'), (e, f.friend_e, 10, 'exact');
  -- E group -8
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.g5, 't02 E group', 16, 'USD', f.friend_e, f.friend_e, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 8, 'exact'), (e, f.friend_e, 8, 'exact');
END $$;

GRANT SELECT ON _t02_ids TO authenticated;
-- Same pre-existing local drift workaround as tickets 01/06: reversal and
-- zero-net paths read get_friend_home_relationships(), which selects
-- users.push_token/is_active absent from some local checkouts.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Seed transfer-bearing history directly (pre-guard shape; new transfer
-- writes are frozen by ticket 01, so fixtures bypass the RPCs). Deltas
-- satisfy the scope-transfer trigger (delta = -group balance):
-- A: g1 balance -8 => +8; B: g2 -8 => +8; C: g3 -5 => +5, g4 +7 => -7
-- (negative delta exercises the direction flip); E: g5 -8 => +8.
-- Cash: A/E net +2 paid direct (friend -> actor); D partial 5, no transfers.
DO $$
DECLARE f _t02_ids%ROWTYPE;
BEGIN
  SELECT * INTO f FROM _t02_ids;
  INSERT INTO public.settlement_operations (
    id, actor_user_id, friend_user_id, group_id, mode, currency,
    expected_balance, requested_payment_amount, payment_intent_id
  ) VALUES
    (f.op_a, f.actor, f.friend_a, NULL, 'all_balances', 'USD', 2, 2,
      '96000000-0000-0000-0000-000000000001'),
    (f.op_b, f.actor, f.friend_b, NULL, 'all_balances', 'USD', 0, 0,
      '96000000-0000-0000-0000-000000000002'),
    (f.op_c, f.actor, f.friend_c, NULL, 'all_balances', 'USD', 2, 0,
      '96000000-0000-0000-0000-000000000003'),
    (f.op_d, f.actor, f.friend_d, NULL, 'all_balances', 'USD', -20, 5,
      '96000000-0000-0000-0000-000000000004'),
    (f.op_e, f.actor, f.friend_e, NULL, 'all_balances', 'USD', 2, 2,
      '96000000-0000-0000-0000-000000000005');

  INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency, date, notes, operation_id)
  VALUES
    (NULL, f.friend_a, f.actor, 2, 'USD', NOW(), 't02 A net cash', f.op_a),
    (NULL, f.actor, f.friend_d, 5, 'USD', NOW(), 't02 D partial', f.op_d),
    (NULL, f.friend_e, f.actor, 2, 'USD', NOW(), 't02 E net cash', f.op_e);

  INSERT INTO public.settlement_scope_transfers (
    operation_id, group_id, from_user_id, to_user_id, currency, signed_group_balance_delta, note
  ) VALUES
    (f.op_a, f.g1, f.actor, f.friend_a, 'USD', 8, 't02 A transfer'),
    (f.op_b, f.g2, f.actor, f.friend_b, 'USD', 8, 't02 B transfer'),
    (f.op_c, f.g3, f.actor, f.friend_c, 'USD', 5, 't02 C g3 transfer'),
    (f.op_c, f.g4, f.actor, f.friend_c, 'USD', -7, 't02 C g4 transfer'),
    (f.op_e, f.g5, f.actor, f.friend_e, 'USD', 8, 't02 E transfer');
END $$;

-- Reverse E (transfer-bearing, actor, post 0) and B (zero-net, actor, post
-- 0). Compensating rows land with swapped participants; the reversal
-- transfer rows carry is_reversal = true and must be excluded from the
-- conversion input below.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t02_ids;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reverse_settlement_operation((SELECT op_e FROM _t02_ids), 0);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 't02 E reverse failed: %', r; END IF;
  r := public.reverse_settlement_operation((SELECT op_b FROM _t02_ids), 0);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 't02 B reverse failed: %', r; END IF;
END $$;
RESET ROLE;

-- ── Conversion under test (virtual; writes nothing) ───────────────────────
-- One non-reversal transfer yields exactly two converted payments.
CREATE TEMP VIEW _p_conv AS
SELECT t.id AS transfer_id, t.operation_id, t.currency,
       t.group_id, t.created_at AS ts, 'group'::text AS scope,
       CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END AS from_user_id,
       CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END AS to_user_id,
       ABS(t.signed_group_balance_delta) AS amount
FROM public.settlement_scope_transfers t WHERE NOT t.is_reversal
UNION ALL
SELECT t.id, t.operation_id, t.currency,
       NULL, t.created_at, 'direct'::text,
       CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END,
       CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END,
       ABS(t.signed_group_balance_delta)
FROM public.settlement_scope_transfers t WHERE NOT t.is_reversal;

-- ── Shape contract (ticket 04 must preserve all of this) ──────────────────
CREATE TEMP TABLE _p_mismatch (
  kind text, a uuid, b uuid, currency text, group_id uuid,
  detail text, world_a numeric, world_b numeric
) ON COMMIT DROP;

-- S1: exactly two converted rows per non-reversal transfer.
INSERT INTO _p_mismatch
SELECT 'shape:row-count', NULL, NULL, NULL, NULL,
       'expected 2 converted rows per non-reversal transfer, got ' || COUNT(*) || ' for ' || t.id,
       2, COUNT(*)
FROM public.settlement_scope_transfers t
LEFT JOIN _p_conv c ON c.transfer_id = t.id
WHERE NOT t.is_reversal
GROUP BY t.id HAVING COUNT(*) <> 2;

-- S2: no converted row derives from a reversal row.
INSERT INTO _p_mismatch
SELECT 'shape:reversal-leak', NULL, NULL, t.currency, t.group_id,
       'converted row derives from reversal transfer ' || t.id, 1, 0
FROM _p_conv c JOIN public.settlement_scope_transfers t ON t.id = c.transfer_id
WHERE t.is_reversal;

-- S3: amounts, currency, timestamps, operation attribution preserved.
INSERT INTO _p_mismatch
SELECT 'shape:field', NULL, NULL, t.currency, t.group_id,
       'converted ' || c.scope || ' leg of ' || t.id || ' breaks amount/currency/ts/operation parity',
       t.signed_group_balance_delta, c.amount
FROM _p_conv c JOIN public.settlement_scope_transfers t ON t.id = c.transfer_id
WHERE c.amount <> ABS(t.signed_group_balance_delta)
   OR c.currency IS DISTINCT FROM t.currency
   OR c.ts IS DISTINCT FROM t.created_at
   OR c.operation_id IS DISTINCT FROM t.operation_id;

-- S4: direction rule — group leg keeps (from,to) for d > 0, swaps for d < 0;
-- direct leg is the exact opposite.
INSERT INTO _p_mismatch
SELECT 'shape:direction', NULL, NULL, t.currency, t.group_id,
       'converted legs of ' || t.id || ' break the direction rule', 1, 0
FROM _p_conv c JOIN public.settlement_scope_transfers t ON t.id = c.transfer_id
GROUP BY t.id, t.currency, t.group_id, t.from_user_id, t.to_user_id, t.signed_group_balance_delta
HAVING COUNT(*) FILTER (
  WHERE c.scope = 'group'
    AND c.from_user_id = CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END
    AND c.to_user_id = CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END
) <> 1
OR COUNT(*) FILTER (
  WHERE c.scope = 'direct' AND c.group_id IS NULL
    AND c.from_user_id = CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END
    AND c.to_user_id = CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END
) <> 1;

-- ── Projection engine (pure reads; covers fixtures AND all dev rows) ──────
CREATE TEMP VIEW _p_pairs AS
SELECT DISTINCT LEAST(x, y) AS a, GREATEST(x, y) AS b FROM (
  SELECT from_user_id AS x, to_user_id AS y FROM public.settlements
  UNION SELECT from_user_id, to_user_id FROM public.settlement_scope_transfers
) p WHERE x <> y;

CREATE TEMP VIEW _p_pair_cur AS
SELECT DISTINCT p.a, p.b, f.currency FROM _p_pairs p
JOIN (
  SELECT from_user_id, to_user_id, currency FROM public.settlements
  UNION SELECT from_user_id, to_user_id, currency FROM public.settlement_scope_transfers
) f ON (f.from_user_id = p.a AND f.to_user_id = p.b)
    OR (f.from_user_id = p.b AND f.to_user_id = p.a);

CREATE TEMP VIEW _p_pair_groups AS
SELECT DISTINCT p.a, p.b, f.currency, f.group_id FROM _p_pairs p
JOIN (
  SELECT from_user_id, to_user_id, currency, group_id FROM public.settlements WHERE group_id IS NOT NULL
  UNION SELECT from_user_id, to_user_id, currency, group_id FROM public.settlement_scope_transfers
) f ON ((f.from_user_id = p.a AND f.to_user_id = p.b)
     OR (f.from_user_id = p.b AND f.to_user_id = p.a));

-- Group leg per (pair, group, currency), a-perspective. Expense/settlement
-- orientation mirrors get_group_pair_totals; transfer orientation mirrors
-- calculateGroupBalances (from=b -> -d / to=b -> +d, non-reversal only).
CREATE TEMP VIEW _p_group_leg AS
SELECT g.a, g.b, g.currency, g.group_id,
  COALESCE((
    SELECT SUM(CASE
        WHEN e.paid_by = g.a THEN COALESCE(fs.amount, 0)
        WHEN e.paid_by = g.b THEN -COALESCE(vs.amount, 0)
        ELSE 0 END)
    FROM public.expenses e
    LEFT JOIN public.expense_splits fs ON fs.expense_id = e.id AND fs.user_id = g.b
    LEFT JOIN public.expense_splits vs ON vs.expense_id = e.id AND vs.user_id = g.a
    WHERE e.deleted_at IS NULL AND e.group_id = g.group_id
      AND e.currency = g.currency AND e.paid_by IN (g.a, g.b)
  ), 0)
  + COALESCE((
    SELECT SUM(CASE
        WHEN s.from_user_id = g.b THEN -s.amount
        WHEN s.to_user_id = g.b THEN s.amount
        ELSE 0 END)
    FROM public.settlements s
    WHERE s.group_id = g.group_id AND s.currency = g.currency
      AND ((s.from_user_id = g.a AND s.to_user_id = g.b)
        OR (s.from_user_id = g.b AND s.to_user_id = g.a))
  ), 0) AS base,
  COALESCE((
    SELECT SUM(CASE
        WHEN t.from_user_id = g.b THEN -t.signed_group_balance_delta
        WHEN t.to_user_id = g.b THEN t.signed_group_balance_delta
        ELSE 0 END)
    FROM public.settlement_scope_transfers t
    WHERE t.group_id = g.group_id AND t.currency = g.currency
      AND NOT t.is_reversal
      AND ((t.from_user_id = g.a AND t.to_user_id = g.b)
        OR (t.from_user_id = g.b AND t.to_user_id = g.a))
  ), 0) AS transfer_delta,
  COALESCE((
    SELECT SUM(CASE
        WHEN c.from_user_id = g.b THEN -c.amount
        WHEN c.to_user_id = g.b THEN c.amount
        ELSE 0 END)
    FROM _p_conv c
    WHERE c.scope = 'group' AND c.group_id = g.group_id AND c.currency = g.currency
      AND ((c.from_user_id = g.a AND c.to_user_id = g.b)
        OR (c.from_user_id = g.b AND c.to_user_id = g.a))
  ), 0) AS converted_delta
FROM _p_pair_groups g;

-- P1: group legs identical with transfers vs converted payments.
INSERT INTO _p_mismatch
SELECT 'group-leg', a, b, currency, group_id,
       'group projection differs with transfers vs converted payments',
       ROUND(base + transfer_delta, 2), ROUND(base + converted_delta, 2)
FROM _p_group_leg
WHERE ABS(ROUND(base + transfer_delta, 2) - ROUND(base + converted_delta, 2)) >= 0.01;

-- Direct leg per (pair, currency), a-perspective. Transfer deltas apply with
-- the inverse sign (relationship direct projection); converted direct legs
-- use the settlement orientation rule.
CREATE TEMP VIEW _p_direct_leg AS
SELECT c.a, c.b, c.currency,
  COALESCE((
    SELECT SUM(CASE
        WHEN e.paid_by = c.a THEN COALESCE(fs.amount, 0)
        WHEN e.paid_by = c.b THEN -COALESCE(vs.amount, 0)
        ELSE 0 END)
    FROM public.expenses e
    LEFT JOIN public.expense_splits fs ON fs.expense_id = e.id AND fs.user_id = c.b
    LEFT JOIN public.expense_splits vs ON vs.expense_id = e.id AND vs.user_id = c.a
    WHERE e.deleted_at IS NULL AND e.group_id IS NULL AND e.currency = c.currency
      AND e.paid_by IN (c.a, c.b)
      AND (COALESCE(vs.amount, 0) > 0 OR e.paid_by = c.a)
      AND (COALESCE(fs.amount, 0) > 0 OR e.paid_by = c.b)
  ), 0)
  + COALESCE((
    SELECT SUM(CASE WHEN s.from_user_id = c.a THEN s.amount ELSE -s.amount END)
    FROM public.settlements s
    WHERE s.group_id IS NULL AND s.currency = c.currency
      AND ((s.from_user_id = c.a AND s.to_user_id = c.b)
        OR (s.from_user_id = c.b AND s.to_user_id = c.a))
  ), 0) AS base,
  COALESCE((
    SELECT SUM(CASE
        WHEN t.from_user_id = c.b THEN -t.signed_group_balance_delta
        WHEN t.to_user_id = c.b THEN t.signed_group_balance_delta
        ELSE 0 END)
    FROM public.settlement_scope_transfers t
    WHERE t.currency = c.currency AND NOT t.is_reversal
      AND ((t.from_user_id = c.a AND t.to_user_id = c.b)
        OR (t.from_user_id = c.b AND t.to_user_id = c.a))
  ), 0) AS transfer_delta,
  COALESCE((
    SELECT SUM(CASE
        WHEN v.from_user_id = c.b THEN -v.amount
        WHEN v.to_user_id = c.b THEN v.amount
        ELSE 0 END)
    FROM _p_conv v
    WHERE v.scope = 'direct' AND v.currency = c.currency
      AND ((v.from_user_id = c.a AND v.to_user_id = c.b)
        OR (v.from_user_id = c.b AND v.to_user_id = c.a))
  ), 0) AS converted_delta
FROM _p_pair_cur c;

-- P2: direct legs identical (transfer inverse vs converted direct payments).
INSERT INTO _p_mismatch
SELECT 'direct-leg', a, b, currency, NULL,
       'direct projection differs with transfers vs converted payments',
       ROUND(base - transfer_delta, 2), ROUND(base + converted_delta, 2)
FROM _p_direct_leg
WHERE ABS(ROUND(base - transfer_delta, 2) - ROUND(base + converted_delta, 2)) >= 0.01;

-- P3: combined net identical per (pair, currency).
INSERT INTO _p_mismatch
SELECT 'net', d.a, d.b, d.currency, NULL,
       'combined net differs with transfers vs converted payments',
       ROUND(d.base - d.transfer_delta
         + COALESCE((SELECT SUM(g.base + g.transfer_delta) FROM _p_group_leg g
                      WHERE g.a = d.a AND g.b = d.b AND g.currency = d.currency), 0), 2),
       ROUND(d.base + d.converted_delta
         + COALESCE((SELECT SUM(g.base + g.converted_delta) FROM _p_group_leg g
                      WHERE g.a = d.a AND g.b = d.b AND g.currency = d.currency), 0), 2)
FROM _p_direct_leg d
WHERE ABS(
  ROUND(d.base - d.transfer_delta
    + COALESCE((SELECT SUM(g.base + g.transfer_delta) FROM _p_group_leg g
                WHERE g.a = d.a AND g.b = d.b AND g.currency = d.currency), 0), 2)
  - ROUND(d.base + d.converted_delta
    + COALESCE((SELECT SUM(g.base + g.converted_delta) FROM _p_group_leg g
                WHERE g.a = d.a AND g.b = d.b AND g.currency = d.currency), 0), 2)
) >= 0.01;

-- ── Sensitivity probe: a naive group-only conversion MUST visibly move the
-- direct leg on these fixtures. If it does not, the harness is vacuous and
-- must fail instead of passing silently.
DO $$
DECLARE n_probe int;
BEGIN
  SELECT COUNT(*) INTO n_probe FROM _p_direct_leg
  WHERE ABS(ROUND(transfer_delta, 2)) >= 0.01;
  IF n_probe = 0 THEN
    RAISE EXCEPTION 'parity harness vacuous: no fixture exercises the transfer direct leg';
  END IF;
  RAISE NOTICE 'sensitivity probe: % pair-currency legs carry transfer direct deltas (naive conversion would fail)', n_probe;
END $$;

-- ── Gate: any mismatch aborts (blocks ticket 04); never warns-and-continues.
DO $$
DECLARE n_bad int; v_detail text;
BEGIN
  SELECT COUNT(*) INTO n_bad FROM _p_mismatch;
  IF n_bad > 0 THEN
    SELECT string_agg(
      kind || ' a=' || COALESCE(LEFT(a::text, 8), '-') || ' b=' || COALESCE(LEFT(b::text, 8), '-')
      || ' ' || COALESCE(currency, '-') || ' grp=' || COALESCE(LEFT(group_id::text, 8), '-')
      || ' A=' || world_a || ' B=' || world_b || ' :: ' || m.detail,
      E'\n' ORDER BY kind, currency
    ) INTO v_detail FROM (SELECT * FROM _p_mismatch LIMIT 50) m;
    RAISE EXCEPTION 'backfill parity FAILED with % mismatch(s):%', n_bad, v_detail;
  END IF;
  RAISE NOTICE 'backfill parity OK: per-pair, per-currency projections identical (transfers vs converted payments)';
END $$;

ROLLBACK;
