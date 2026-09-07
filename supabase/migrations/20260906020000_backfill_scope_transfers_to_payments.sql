-- ADR-0004 ticket 04: backfill settlement_scope_transfers into plain payments.
--
-- Each NON-reversal transfer (group g, from f, to u, currency c, delta d,
-- timestamp ts, operation op) becomes TWO settlement rows preserving
-- timestamps, attribution, amounts, and currencies (mirrors the ticket-02
-- parity harness contract exactly):
--   group leg : group_id = g,  direction f->u if d > 0 else u->f, amount |d|
--   direct leg: group_id NULL, direction u->f if d > 0 else f->u, amount |d|
-- The direct leg is the inverse of the group leg because the relationship
-- projection applies transfers to direct with the opposite sign
-- (services/friend-detail-service.ts projectFriendRelationship,
-- get_friend_home_relationships adjusted_direct).
--
-- Gate: the parity checks below run on the same dataset BEFORE any write;
-- any mismatch raises (aborting the migration with zero writes) by design.
-- This file never warns-and-continues. Reversal transfer rows (is_reversal)
-- are excluded from the conversion input. Transfer rows are never deleted;
-- history is converted, never removed.
--
-- Marker: converted rows carry backfilled_transfer_id (source transfer id)
-- plus a '[ADR-0004 backfill <transfer-id> <scope>]' notes prefix so they
-- stay distinguishable from live rows. Original timestamps (date AND
-- created_at), operation attribution, amounts, and currencies are preserved.
--
-- Additive only: prior migrations are not edited. No grant broadening (the
-- new column inherits the settlements table grants/RLS; no GRANT below).
-- No hosted purges; no production deployment here (local/dev verification
-- only — the user applies migrations to dev).

-- ── Block 1: backfill marker column ──────────────────────────────────────
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS backfilled_transfer_id UUID
  REFERENCES public.settlement_scope_transfers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_settlements_backfilled_transfer_id
  ON public.settlements(backfilled_transfer_id);

-- ── Block 2: parity gate + backfill ──────────────────────────────────────
-- Single DO block = single transaction: a raised mismatch rolls back all
-- writes. Base settlement sums exclude already-backfilled rows so the gate
-- stays stable across re-runs (live base + virtual conversion compared).
DO $$
DECLARE
  n_bad int;
  v_detail text;
BEGIN
  -- Virtual conversion under test (writes nothing): one non-reversal
  -- transfer yields exactly two converted payments.
  CREATE TEMP VIEW _b_conv AS
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

  CREATE TEMP TABLE _b_mismatch (
    kind text, a uuid, b uuid, currency text, group_id uuid,
    detail text, world_a numeric, world_b numeric
  ) ON COMMIT DROP;

  -- S1: exactly two converted rows per non-reversal transfer.
  INSERT INTO _b_mismatch
  SELECT 'shape:row-count', NULL, NULL, NULL, NULL,
         'expected 2 converted rows per non-reversal transfer, got ' || COUNT(*) || ' for ' || t.id,
         2, COUNT(*)
  FROM public.settlement_scope_transfers t
  LEFT JOIN _b_conv c ON c.transfer_id = t.id
  WHERE NOT t.is_reversal
  GROUP BY t.id HAVING COUNT(*) <> 2;

  -- S2: no converted row derives from a reversal row.
  INSERT INTO _b_mismatch
  SELECT 'shape:reversal-leak', NULL, NULL, t.currency, t.group_id,
         'converted row derives from reversal transfer ' || t.id, 1, 0
  FROM _b_conv c JOIN public.settlement_scope_transfers t ON t.id = c.transfer_id
  WHERE t.is_reversal;

  -- S3: amounts, currency, timestamps, operation attribution preserved.
  INSERT INTO _b_mismatch
  SELECT 'shape:field', NULL, NULL, t.currency, t.group_id,
         'converted ' || c.scope || ' leg of ' || t.id || ' breaks amount/currency/ts/operation parity',
         t.signed_group_balance_delta, c.amount
  FROM _b_conv c JOIN public.settlement_scope_transfers t ON t.id = c.transfer_id
  WHERE c.amount <> ABS(t.signed_group_balance_delta)
     OR c.currency IS DISTINCT FROM t.currency
     OR c.ts IS DISTINCT FROM t.created_at
     OR c.operation_id IS DISTINCT FROM t.operation_id;

  -- S4: direction rule — group leg keeps (from,to) for d > 0, swaps for
  -- d < 0; direct leg is the exact opposite with group_id NULL.
  INSERT INTO _b_mismatch
  SELECT 'shape:direction', NULL, NULL, t.currency, t.group_id,
         'converted legs of ' || t.id || ' break the direction rule', 1, 0
  FROM _b_conv c JOIN public.settlement_scope_transfers t ON t.id = c.transfer_id
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

  -- Projection engine (pure reads; covers every dev row). Live base
  -- excludes already-backfilled rows so re-runs compare apples-to-apples.
  CREATE TEMP VIEW _b_pairs AS
  SELECT DISTINCT LEAST(x, y) AS a, GREATEST(x, y) AS b FROM (
    SELECT from_user_id AS x, to_user_id AS y FROM public.settlements WHERE backfilled_transfer_id IS NULL
    UNION SELECT from_user_id, to_user_id FROM public.settlement_scope_transfers
  ) p WHERE x <> y;

  CREATE TEMP VIEW _b_pair_cur AS
  SELECT DISTINCT p.a, p.b, f.currency FROM _b_pairs p
  JOIN (
    SELECT from_user_id, to_user_id, currency FROM public.settlements WHERE backfilled_transfer_id IS NULL
    UNION SELECT from_user_id, to_user_id, currency FROM public.settlement_scope_transfers
  ) f ON (f.from_user_id = p.a AND f.to_user_id = p.b)
      OR (f.from_user_id = p.b AND f.to_user_id = p.a);

  CREATE TEMP VIEW _b_pair_groups AS
  SELECT DISTINCT p.a, p.b, f.currency, f.group_id FROM _b_pairs p
  JOIN (
    SELECT from_user_id, to_user_id, currency, group_id FROM public.settlements
    WHERE group_id IS NOT NULL AND backfilled_transfer_id IS NULL
    UNION SELECT from_user_id, to_user_id, currency, group_id FROM public.settlement_scope_transfers
  ) f ON ((f.from_user_id = p.a AND f.to_user_id = p.b)
       OR (f.from_user_id = p.b AND f.to_user_id = p.a));

  CREATE TEMP VIEW _b_group_leg AS
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
        AND s.backfilled_transfer_id IS NULL
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
      FROM _b_conv c
      WHERE c.scope = 'group' AND c.group_id = g.group_id AND c.currency = g.currency
        AND ((c.from_user_id = g.a AND c.to_user_id = g.b)
          OR (c.from_user_id = g.b AND c.to_user_id = g.a))
    ), 0) AS converted_delta
  FROM _b_pair_groups g;

  -- P1: group legs identical with transfers vs converted payments.
  INSERT INTO _b_mismatch
  SELECT 'group-leg', a, b, currency, group_id,
         'group projection differs with transfers vs converted payments',
         ROUND(base + transfer_delta, 2), ROUND(base + converted_delta, 2)
  FROM _b_group_leg
  WHERE ABS(ROUND(base + transfer_delta, 2) - ROUND(base + converted_delta, 2)) >= 0.01;

  CREATE TEMP VIEW _b_direct_leg AS
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
        AND s.backfilled_transfer_id IS NULL
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
      FROM _b_conv v
      WHERE v.scope = 'direct' AND v.currency = c.currency
        AND ((v.from_user_id = c.a AND v.to_user_id = c.b)
          OR (v.from_user_id = c.b AND v.to_user_id = c.a))
    ), 0) AS converted_delta
  FROM _b_pair_cur c;

  -- P2: direct legs identical (transfer inverse vs converted direct payments).
  INSERT INTO _b_mismatch
  SELECT 'direct-leg', a, b, currency, NULL,
         'direct projection differs with transfers vs converted payments',
         ROUND(base - transfer_delta, 2), ROUND(base + converted_delta, 2)
  FROM _b_direct_leg
  WHERE ABS(ROUND(base - transfer_delta, 2) - ROUND(base + converted_delta, 2)) >= 0.01;

  -- P3: combined net identical per (pair, currency).
  INSERT INTO _b_mismatch
  SELECT 'net', d.a, d.b, d.currency, NULL,
         'combined net differs with transfers vs converted payments',
         ROUND(d.base - d.transfer_delta
           + COALESCE((SELECT SUM(g.base + g.transfer_delta) FROM _b_group_leg g
                        WHERE g.a = d.a AND g.b = d.b AND g.currency = d.currency), 0), 2),
         ROUND(d.base + d.converted_delta
           + COALESCE((SELECT SUM(g.base + g.converted_delta) FROM _b_group_leg g
                        WHERE g.a = d.a AND g.b = d.b AND g.currency = d.currency), 0), 2)
  FROM _b_direct_leg d
  WHERE ABS(
    ROUND(d.base - d.transfer_delta
      + COALESCE((SELECT SUM(g.base + g.transfer_delta) FROM _b_group_leg g
                  WHERE g.a = d.a AND g.b = d.b AND g.currency = d.currency), 0), 2)
    - ROUND(d.base + d.converted_delta
      + COALESCE((SELECT SUM(g.base + g.converted_delta) FROM _b_group_leg g
                  WHERE g.a = d.a AND g.b = d.b AND g.currency = d.currency), 0), 2)
  ) >= 0.01;

  -- Gate: any mismatch aborts with zero writes; never warns-and-continues.
  SELECT COUNT(*) INTO n_bad FROM _b_mismatch;
  IF n_bad > 0 THEN
    SELECT string_agg(
      kind || ' a=' || COALESCE(LEFT(a::text, 8), '-') || ' b=' || COALESCE(LEFT(b::text, 8), '-')
      || ' ' || COALESCE(currency, '-') || ' grp=' || COALESCE(LEFT(group_id::text, 8), '-')
      || ' A=' || world_a || ' B=' || world_b || ' :: ' || m.detail,
      E'\n' ORDER BY kind, currency
    ) INTO v_detail FROM (SELECT * FROM _b_mismatch LIMIT 50) m;
    RAISE EXCEPTION 'ADR-0004 backfill parity FAILED with % mismatch(s):%', n_bad, v_detail;
  END IF;
  RAISE NOTICE 'ADR-0004 backfill parity OK: converting % non-reversal transfer(s)',
    (SELECT COUNT(*) FROM public.settlement_scope_transfers WHERE NOT is_reversal);

  -- Backfill: two plain payments per non-reversal transfer, idempotent
  -- (re-runs insert zero rows). Original timestamps/attribution preserved;
  -- converted rows carry the marker column + notes prefix.
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

  DROP VIEW IF EXISTS _b_group_leg;
  DROP VIEW IF EXISTS _b_direct_leg;
  DROP VIEW IF EXISTS _b_pair_cur;
  DROP VIEW IF EXISTS _b_pair_groups;
  DROP VIEW IF EXISTS _b_pairs;
  DROP VIEW IF EXISTS _b_conv;
END;
$$;
