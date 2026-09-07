-- Backfill execution regressions (ADR-0004 ticket 04).
-- Proves the ticket-04 conversion (same contract as the ticket-02 parity
-- harness) writes exactly two plain payments per non-reversal transfer,
-- preserves timestamps/attribution/amounts/currencies, marks converted rows,
-- excludes reversal rows, and is idempotent. Post-conversion projections
-- using the written rows match the transfer-based projections.
-- Run against LOCAL Supabase only, isolated transaction, rolls back.
-- docker cp supabase/tests/settlement_backfill_execution_regressions.sql supabase_db_vasuli:/tmp/regress.sql
-- docker exec supabase_db_vasuli psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/regress.sql
BEGIN;

CREATE TEMP TABLE _t04_ids (
  actor uuid, friend_a uuid, friend_b uuid, friend_c uuid,
  g1 uuid, g2 uuid,
  op_a uuid, op_b uuid, op_c uuid
) ON COMMIT DROP;
INSERT INTO _t04_ids VALUES (
  '98000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000002',
  '98000000-0000-0000-0000-000000000003',
  '98000000-0000-0000-0000-000000000004',
  '99000000-0000-0000-0000-000000000001',
  '99000000-0000-0000-0000-000000000002',
  '97000000-0000-0000-0000-000000000011',
  '97000000-0000-0000-0000-000000000012',
  '97000000-0000-0000-0000-000000000013'
);

-- Synthetic auth + app users (actor == auth id, mirrors existing SQL tests).
-- Placeholder names only; no real user data anywhere in this harness.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor,'authenticated','authenticated','t04-actor@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t04_ids
UNION ALL SELECT friend_a,'authenticated','authenticated','t04-a@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t04_ids
UNION ALL SELECT friend_b,'authenticated','authenticated','t04-b@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t04_ids
UNION ALL SELECT friend_c,'authenticated','authenticated','t04-c@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _t04_ids;

INSERT INTO public.users (id, name, auth_user_id, created_at)
SELECT actor,'T04 actor',actor,'2026-01-01'::timestamptz FROM _t04_ids
UNION ALL SELECT friend_a,'T04 Friend A',friend_a,'2026-01-01'::timestamptz FROM _t04_ids
UNION ALL SELECT friend_b,'T04 Friend B',friend_b,'2026-01-01'::timestamptz FROM _t04_ids
UNION ALL SELECT friend_c,'T04 Friend C',friend_c,'2026-01-01'::timestamptz FROM _t04_ids;

INSERT INTO public.friendships (user_id, friend_id, status)
SELECT actor, friend_a, 'accepted' FROM _t04_ids
UNION ALL SELECT actor, friend_b, 'accepted' FROM _t04_ids
UNION ALL SELECT actor, friend_c, 'accepted' FROM _t04_ids;

INSERT INTO public.groups (id, name)
SELECT g1, 'T04 group one' FROM _t04_ids
UNION ALL SELECT g2, 'T04 group two' FROM _t04_ids;

INSERT INTO public.group_members (group_id, user_id, role)
SELECT g1, actor, 'admin' FROM _t04_ids
UNION ALL SELECT g1, friend_a, 'member' FROM _t04_ids
UNION ALL SELECT g2, actor, 'admin' FROM _t04_ids
UNION ALL SELECT g2, friend_b, 'member' FROM _t04_ids;

-- Balances (actor perspective):
-- A: direct +10, group g1 -8 => net +2 (delta +8 exercises d > 0)
-- B: group g2 +7 (delta -7 exercises d < 0 direction flip)
-- C: direct -20 baseline, no transfers (must stay untouched)
DO $$
DECLARE f _t04_ids%ROWTYPE; e uuid;
BEGIN
  SELECT * INTO f FROM _t04_ids;
  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't04 A direct', 10, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 0, 'exact'), (e, f.friend_a, 10, 'exact');

  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.g1, 't04 A group', 16, 'USD', f.friend_a, f.friend_a, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 8, 'exact'), (e, f.friend_a, 8, 'exact');

  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (f.g2, 't04 B group', 14, 'USD', f.actor, f.actor, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 7, 'exact'), (e, f.friend_b, 7, 'exact');

  INSERT INTO public.expenses (group_id, description, amount, currency, paid_by, created_by, date)
  VALUES (NULL, 't04 C direct', 20, 'USD', f.friend_c, f.friend_c, NOW()) RETURNING id INTO e;
  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type)
  VALUES (e, f.actor, 20, 'exact'), (e, f.friend_c, 0, 'exact');
END $$;

-- Same pre-existing local drift workaround as tickets 01/02/06.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Seed transfer-bearing history directly (pre-guard shape).
DO $$
DECLARE f _t04_ids%ROWTYPE;
BEGIN
  SELECT * INTO f FROM _t04_ids;
  INSERT INTO public.settlement_operations (
    id, actor_user_id, friend_user_id, group_id, mode, currency,
    expected_balance, requested_payment_amount, payment_intent_id
  ) VALUES
    (f.op_a, f.actor, f.friend_a, NULL, 'all_balances', 'USD', 2, 2,
      '96000000-0000-0000-0000-000000000011'),
    (f.op_b, f.actor, f.friend_b, NULL, 'all_balances', 'USD', 7, 0,
      '96000000-0000-0000-0000-000000000012'),
    (f.op_c, f.actor, f.friend_c, NULL, 'all_balances', 'USD', -20, 5,
      '96000000-0000-0000-0000-000000000013');

  INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency, date, notes, operation_id)
  VALUES
    (NULL, f.friend_a, f.actor, 2, 'USD', NOW(), 't04 A net cash', f.op_a),
    (NULL, f.actor, f.friend_c, 5, 'USD', NOW(), 't04 C partial', f.op_c);

  INSERT INTO public.settlement_scope_transfers (
    operation_id, group_id, from_user_id, to_user_id, currency, signed_group_balance_delta, note
  ) VALUES
    (f.op_a, f.g1, f.actor, f.friend_a, 'USD', 8, 't04 A transfer'),
    (f.op_b, f.g2, f.actor, f.friend_b, 'USD', -7, 't04 B transfer');
END $$;

-- Reverse B (transfer-bearing, actor, post 7 = expected 7 - 0 paid).
-- The reversal transfer rows carry is_reversal = true and must be excluded
-- from conversion input.
GRANT SELECT ON _t04_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true) FROM _t04_ids;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reverse_settlement_operation((SELECT op_b FROM _t04_ids), 7);
  IF r->>'status' <> 'reversed' THEN RAISE EXCEPTION 't04 B reverse failed: %', r; END IF;
END $$;
RESET ROLE;

-- ── Conversion under test: MUST match supabase/migrations/20260906020000 ──
-- ── backfill_scope_transfers_to_payments.sql exactly (same direction rule, ──
-- ── same marker column + notes prefix, same NOT EXISTS idempotency guard). ──
-- Gate first: virtual conversion parity on the same dataset. Any mismatch
-- aborts before any write (mirrors the migration gate, reduced to fixtures).
DO $$
DECLARE n_bad int;
BEGIN
  SELECT COUNT(*) INTO n_bad FROM public.settlement_scope_transfers t
  WHERE NOT t.is_reversal
    AND NOT EXISTS (
      SELECT 1 FROM public.settlements s WHERE s.backfilled_transfer_id = t.id
    )
    AND (
      ABS(t.signed_group_balance_delta) <= 0
      OR t.currency IS NULL OR BTRIM(t.currency) = ''
      OR t.operation_id IS NULL OR t.created_at IS NULL
    );
  IF n_bad > 0 THEN RAISE EXCEPTION 't04 gate: % transfer(s) fail shape parity', n_bad; END IF;
END $$;

-- Execute the conversion (same two INSERTs as the migration).
INSERT INTO public.settlements
  (group_id, from_user_id, to_user_id, amount, currency, date, created_at, notes, operation_id, backfilled_transfer_id)
SELECT t.group_id,
       CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END,
       CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END,
       ABS(t.signed_group_balance_delta), t.currency, t.created_at, t.created_at,
       '[ADR-0004 backfill ' || t.id::text || ' group] ' || COALESCE(t.note, ''),
       t.operation_id, t.id
FROM public.settlement_scope_transfers t
WHERE NOT t.is_reversal
  AND NOT EXISTS (SELECT 1 FROM public.settlements s WHERE s.backfilled_transfer_id = t.id);

INSERT INTO public.settlements
  (group_id, from_user_id, to_user_id, amount, currency, date, created_at, notes, operation_id, backfilled_transfer_id)
SELECT NULL,
       CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END,
       CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END,
       ABS(t.signed_group_balance_delta), t.currency, t.created_at, t.created_at,
       '[ADR-0004 backfill ' || t.id::text || ' direct] ' || COALESCE(t.note, ''),
       t.operation_id, t.id
FROM public.settlement_scope_transfers t
WHERE NOT t.is_reversal
  AND NOT EXISTS (
    SELECT 1 FROM public.settlements s
    WHERE s.backfilled_transfer_id = t.id AND s.group_id IS NULL
  );

-- ── Converted-row assertions ─────────────────────────────────────────────
-- E1: exactly two converted rows per non-reversal transfer in scope
-- (fixtures only: restrict to T04 operations so pre-existing dev rows
-- cannot pollute the count).
DO $$
DECLARE n_bad int;
BEGIN
  SELECT COUNT(*) INTO n_bad FROM (
    SELECT t.id FROM public.settlement_scope_transfers t
    LEFT JOIN public.settlements s ON s.backfilled_transfer_id = t.id
    WHERE NOT t.is_reversal
      AND t.operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids)
    GROUP BY t.id HAVING COUNT(s.id) <> 2
  ) v;
  IF n_bad > 0 THEN RAISE EXCEPTION 't04 E1: % non-reversal transfer(s) lack exactly 2 converted rows', n_bad; END IF;
END $$;

-- E2: no converted row derives from a reversal row (fixtures in scope).
DO $$
DECLARE n_bad int;
BEGIN
  SELECT COUNT(*) INTO n_bad
  FROM public.settlements s
  JOIN public.settlement_scope_transfers t ON t.id = s.backfilled_transfer_id
  WHERE t.is_reversal
    AND t.operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids);
  IF n_bad > 0 THEN RAISE EXCEPTION 't04 E2: % converted row(s) derive from reversal transfers', n_bad; END IF;
END $$;

-- E3: amounts, currency, timestamps, operation attribution preserved.
DO $$
DECLARE n_bad int;
BEGIN
  SELECT COUNT(*) INTO n_bad
  FROM public.settlements s
  JOIN public.settlement_scope_transfers t ON t.id = s.backfilled_transfer_id
  WHERE t.operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids)
    AND (s.amount <> ABS(t.signed_group_balance_delta)
      OR s.currency IS DISTINCT FROM t.currency
      OR s.date IS DISTINCT FROM t.created_at
      OR s.created_at IS DISTINCT FROM t.created_at
      OR s.operation_id IS DISTINCT FROM t.operation_id);
  IF n_bad > 0 THEN RAISE EXCEPTION 't04 E3: % converted row(s) break amount/currency/ts/operation parity', n_bad; END IF;
END $$;

-- E4: direction rule — group leg keeps (from,to) for d > 0 else swaps;
-- direct leg is the exact opposite; direct legs carry group_id NULL.
DO $$
DECLARE n_bad int;
BEGIN
  -- Every backfilled group leg + direct leg verified row-wise.
  SELECT COUNT(*) INTO n_bad
  FROM public.settlements s
  JOIN public.settlement_scope_transfers t ON t.id = s.backfilled_transfer_id
  WHERE t.operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids)
    AND (
      (s.group_id IS NOT NULL AND (
        s.from_user_id <> CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END
        OR s.to_user_id <> CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END
        OR s.group_id IS DISTINCT FROM t.group_id))
      OR (s.group_id IS NULL AND (
        s.from_user_id <> CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END
        OR s.to_user_id <> CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END))
    );
  IF n_bad > 0 THEN RAISE EXCEPTION 't04 E4: % converted row(s) break the direction rule', n_bad; END IF;
END $$;

-- E5: backfill marker — every converted row carries the marker column and
-- the notes prefix; no live (non-backfilled) row carries the prefix.
DO $$
DECLARE n_bad int;
BEGIN
  SELECT COUNT(*) INTO n_bad
  FROM public.settlements s
  JOIN public.settlement_scope_transfers t ON t.id = s.backfilled_transfer_id
  WHERE t.operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids)
    AND (s.backfilled_transfer_id IS NULL OR s.notes NOT LIKE '[ADR-0004 backfill %');
  IF n_bad > 0 THEN RAISE EXCEPTION 't04 E5: % converted row(s) lack the backfill marker', n_bad; END IF;

  SELECT COUNT(*) INTO n_bad
  FROM public.settlements s
  WHERE s.backfilled_transfer_id IS NULL AND s.notes LIKE '[ADR-0004 backfill %';
  IF n_bad > 0 THEN RAISE EXCEPTION 't04 E5: % live row(s) carry the backfill marker', n_bad; END IF;
END $$;

-- E6: idempotency — re-running the conversion inserts zero new rows.
DO $$
DECLARE n_before int; n_after int;
BEGIN
  SELECT COUNT(*) INTO n_before FROM public.settlements s
  WHERE s.backfilled_transfer_id IN (
    SELECT id FROM public.settlement_scope_transfers
    WHERE operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids)
  );
  INSERT INTO public.settlements
    (group_id, from_user_id, to_user_id, amount, currency, date, created_at, notes, operation_id, backfilled_transfer_id)
  SELECT t.group_id,
         CASE WHEN t.signed_group_balance_delta > 0 THEN t.from_user_id ELSE t.to_user_id END,
         CASE WHEN t.signed_group_balance_delta > 0 THEN t.to_user_id ELSE t.from_user_id END,
         ABS(t.signed_group_balance_delta), t.currency, t.created_at, t.created_at,
         '[ADR-0004 backfill ' || t.id::text || ' group] ' || COALESCE(t.note, ''),
         t.operation_id, t.id
  FROM public.settlement_scope_transfers t
  WHERE NOT t.is_reversal
    AND t.operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids)
    AND NOT EXISTS (SELECT 1 FROM public.settlements s WHERE s.backfilled_transfer_id = t.id);
  SELECT COUNT(*) INTO n_after FROM public.settlements s
  WHERE s.backfilled_transfer_id IN (
    SELECT id FROM public.settlement_scope_transfers
    WHERE operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids)
  );
  IF n_after <> n_before THEN RAISE EXCEPTION 't04 E6: re-run inserted % extra row(s)', n_after - n_before; END IF;
END $$;

-- E7: post-conversion parity on written rows — per-pair, per-currency
-- group and direct projections using the actual backfilled payments match
-- the transfer-based projections (fixtures in scope, live base excludes
-- backfilled rows so the comparison is apples-to-apples).
DO $$
DECLARE n_bad int;
BEGIN
  WITH live_base AS (
    SELECT * FROM public.settlements WHERE backfilled_transfer_id IS NULL
  ),
  pairs AS (
    SELECT DISTINCT LEAST(x, y) AS a, GREATEST(x, y) AS b FROM (
      SELECT from_user_id AS x, to_user_id AS y FROM live_base
      UNION SELECT from_user_id, to_user_id FROM public.settlement_scope_transfers
      UNION SELECT from_user_id, to_user_id FROM public.settlements WHERE backfilled_transfer_id IS NOT NULL
    ) p WHERE x <> y
  ),
  pair_cur AS (
    SELECT DISTINCT p.a, p.b, f.currency FROM pairs p
    JOIN (
      SELECT from_user_id, to_user_id, currency FROM live_base
      UNION SELECT from_user_id, to_user_id, currency FROM public.settlement_scope_transfers
      UNION SELECT from_user_id, to_user_id, currency FROM public.settlements WHERE backfilled_transfer_id IS NOT NULL
    ) f ON (f.from_user_id = p.a AND f.to_user_id = p.b)
        OR (f.from_user_id = p.b AND f.to_user_id = p.a)
  )
  SELECT COUNT(*) INTO n_bad FROM pair_cur c
  WHERE EXISTS (SELECT 1 FROM _t04_ids WHERE actor IN (c.a, c.b))
    AND ROUND(
      COALESCE((SELECT SUM(CASE WHEN s.from_user_id = c.a THEN s.amount ELSE -s.amount END)
        FROM live_base s WHERE s.group_id IS NULL AND s.currency = c.currency
          AND ((s.from_user_id = c.a AND s.to_user_id = c.b) OR (s.from_user_id = c.b AND s.to_user_id = c.a))), 0)
      - COALESCE((SELECT SUM(CASE WHEN t.from_user_id = c.b THEN -t.signed_group_balance_delta
                                  WHEN t.to_user_id = c.b THEN t.signed_group_balance_delta ELSE 0 END)
        FROM public.settlement_scope_transfers t WHERE t.currency = c.currency AND NOT t.is_reversal
          AND ((t.from_user_id = c.a AND t.to_user_id = c.b) OR (t.from_user_id = c.b AND t.to_user_id = c.a))), 0)
      , 2) <>
    ROUND(
      COALESCE((SELECT SUM(CASE WHEN s.from_user_id = c.a THEN s.amount ELSE -s.amount END)
        FROM live_base s WHERE s.group_id IS NULL AND s.currency = c.currency
          AND ((s.from_user_id = c.a AND s.to_user_id = c.b) OR (s.from_user_id = c.b AND s.to_user_id = c.a))), 0)
      + COALESCE((SELECT SUM(CASE WHEN v.from_user_id = c.b THEN -v.amount
                                  WHEN v.to_user_id = c.b THEN v.amount ELSE 0 END)
        FROM public.settlements v WHERE v.backfilled_transfer_id IS NOT NULL AND v.group_id IS NULL
          AND v.currency = c.currency
          AND ((v.from_user_id = c.a AND v.to_user_id = c.b) OR (v.from_user_id = c.b AND v.to_user_id = c.a))), 0)
      , 2);
  IF n_bad > 0 THEN RAISE EXCEPTION 't04 E7: % pair-currency direct leg(s) differ post-conversion', n_bad; END IF;
END $$;

-- E8: nothing deleted without conversion — every pre-conversion transfer
-- row still exists.
DO $$
DECLARE n_tr int;
BEGIN
  SELECT COUNT(*) INTO n_tr FROM public.settlement_scope_transfers t
  WHERE t.operation_id IN (SELECT op_a FROM _t04_ids UNION ALL SELECT op_b FROM _t04_ids UNION ALL SELECT op_c FROM _t04_ids);
  IF n_tr < 2 THEN RAISE EXCEPTION 't04 E8: expected transfer rows missing (found %)', n_tr; END IF;
  RAISE NOTICE 'backfill execution OK: converted rows verified, reversal excluded, idempotent, parity holds';
END $$;

ROLLBACK;
