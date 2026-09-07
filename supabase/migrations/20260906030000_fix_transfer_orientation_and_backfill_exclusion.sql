-- Ticket 09: server transfer-orientation repair + backfill exclusion.
--
-- Verdict (dev evidence, ticket 09): the READER violates the shared
-- orientation. Stored deltas are from-user-oriented -- the change to the
-- FROM-user's group balance, with the inverse applied to direct. That is the
-- contract shared by the group ledger engine
-- (services/group-balance.ts), get_group_pair_totals, the scope-transfer
-- validation priors, the 20260818390000 home/group projections, and the
-- frozen ticket-04 backfill conversion (group leg keeps (from,to) for d > 0
-- and swaps for d < 0; direct leg is the exact opposite). Migration
-- 20260819010000 re-oriented the home/groups readers to the operation
-- actor, so a from-user-oriented row (dev: delta -15.50 from friend,
-- operation actor reviewer) reads -31.00 server-side while the row set
-- proves 0/0. Reversal rows (swapped participants, preserved delta) cancel
-- to neutral in unfiltered projections only under participant-based
-- application; actor-based application double-counts them.
--
-- This migration therefore:
--   (1) restores participant-based transfer application in
--       get_friend_home_relationships and get_groups_home_summaries;
--   (2) aligns the existing-transfer terms in commit_settlement_operation
--       allocation validation with the same orientation, so validation
--       agrees with what Home displays;
--   (3) makes every transfer-touching reader skip converted operations
--       (marker-aware, operation granularity: any non-reversal transfer of
--       the operation has converted settlements), so a future backfill
--       cannot double-count. Converted rows are identified through
--       settlements.backfilled_transfer_id, the ticket-04 marker; the
--       ticket-04 migration itself is untouched and its Block 1 column/index
--       creation simply no-ops if this migration applied first (both use
--       IF NOT EXISTS).
--
-- Deliberately untouched: the commit-time trigger check and the client
-- planner keep their frozen-path language (no new transfer writes are
-- possible once the ticket-01 freeze guard lands; changing rejection
-- behavior there is out of scope); reverse_settlement_operation keeps its
-- neutral compensating-row convention; transfer rows are never updated or
-- deleted here. Signatures, authorization, stale-balance guards, and the
-- existing access grants ride along unchanged (no REVOKE/GRANT below).
-- Pre-backfill behavior is identical except the orientation repair itself:
-- with no converted rows the exclusion predicates are vacuously true, and
-- transfer-free pairs compute exactly as before.
--
-- Apply order: after 20260904230000 (pair totals) and 20260819010000 (whose
-- actor-based text is the anchor below). The marker bootstrap is
-- idempotent, so this file also applies cleanly before 20260906020000.

-- ── Block 0: backfill marker bootstrap (idempotent) ─────────────────────
-- Same column/index contract as ticket 04 Block 1; IF NOT EXISTS keeps both
-- orders safe without touching the ticket-04 file.
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS backfilled_transfer_id UUID
  REFERENCES public.settlement_scope_transfers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_settlements_backfilled_transfer_id
  ON public.settlements(backfilled_transfer_id);

-- ── Block 1: home relationships transfer orientation + exclusion ─────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
      SUM(CASE
        WHEN operation.actor_user_id = app_user_id
          THEN transfer.signed_group_balance_delta
        WHEN operation.friend_user_id = app_user_id
          THEN -transfer.signed_group_balance_delta
        ELSE 0
      END) AS delta
    FROM public.settlement_scope_transfers transfer
    JOIN public.settlement_operations operation
      ON operation.id = transfer.operation_id
    WHERE operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id
    GROUP BY 1, 2, 3
$old$;
  new_expression TEXT := $new$
      SUM(CASE WHEN transfer.from_user_id = app_user_id
        THEN transfer.signed_group_balance_delta
        ELSE -transfer.signed_group_balance_delta
      END) AS delta
    FROM public.settlement_scope_transfers transfer
    JOIN public.settlement_operations operation
      ON operation.id = transfer.operation_id
    WHERE (operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements converted
        JOIN public.settlement_scope_transfers converted_transfer
          ON converted_transfer.id = converted.backfilled_transfer_id
        WHERE converted_transfer.operation_id = transfer.operation_id
          AND NOT converted_transfer.is_reversal
      )
    GROUP BY 1, 2, 3
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_friend_home_relationships'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_home_relationships() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update home transfer_deltas to participant orientation with backfill exclusion';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 2: groups home transfer orientation + exclusion ────────────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
      CASE
        WHEN operation.actor_user_id = app_user_id
          THEN transfer.signed_group_balance_delta
        WHEN operation.friend_user_id = app_user_id
          THEN -transfer.signed_group_balance_delta
        ELSE 0
      END AS impact_amount
    FROM public.settlement_scope_transfers transfer
    JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
    JOIN user_groups group_row ON group_row.id = transfer.group_id
    WHERE operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id
$old$;
  new_expression TEXT := $new$
      CASE WHEN transfer.from_user_id = app_user_id
        THEN transfer.signed_group_balance_delta
        ELSE -transfer.signed_group_balance_delta
      END AS impact_amount
    FROM public.settlement_scope_transfers transfer
    JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
    JOIN user_groups group_row ON group_row.id = transfer.group_id
    WHERE (operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements converted
        JOIN public.settlement_scope_transfers converted_transfer
          ON converted_transfer.id = converted.backfilled_transfer_id
        WHERE converted_transfer.operation_id = transfer.operation_id
          AND NOT converted_transfer.is_reversal
      )
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_groups_home_summaries'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_groups_home_summaries() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update groups transfer_impacts to participant orientation with backfill exclusion';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 3: pair totals transfer exclusion (already participant-based) ──
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
        FROM public.settlement_scope_transfers t
        WHERE t.group_id = p_group_id
          AND t.currency = curr.currency
          AND NOT t.is_reversal
          AND ((t.from_user_id = pair.a AND t.to_user_id = pair.b)
            OR (t.from_user_id = pair.b AND t.to_user_id = pair.a))
      ), 0) AS gtrans,
$old$;
  new_expression TEXT := $new$
        FROM public.settlement_scope_transfers t
        WHERE t.group_id = p_group_id
          AND t.currency = curr.currency
          AND NOT t.is_reversal
          AND ((t.from_user_id = pair.a AND t.to_user_id = pair.b)
            OR (t.from_user_id = pair.b AND t.to_user_id = pair.a))
          AND NOT EXISTS (
            SELECT 1
            FROM public.settlements converted
            JOIN public.settlement_scope_transfers converted_transfer
              ON converted_transfer.id = converted.backfilled_transfer_id
            WHERE converted_transfer.operation_id = t.operation_id
              AND NOT converted_transfer.is_reversal
          )
      ), 0) AS gtrans,
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_group_pair_totals'
    AND pg_get_function_identity_arguments(p.oid) = 'p_group_id uuid';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_group_pair_totals(UUID) was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not add backfill exclusion to pair totals transfer leg';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 4: commit direct-scope existing-transfer term ──────────────────
-- Same orientation the home direct leg uses (participant-based), plus the
-- converted-operation exclusion so post-backfill validation sees cash only.
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
        current_scope_balance := current_scope_balance - COALESCE((SELECT SUM(CASE
          WHEN operation.actor_user_id = app_user_id THEN transfer.signed_group_balance_delta
          WHEN operation.friend_user_id = app_user_id THEN -transfer.signed_group_balance_delta ELSE 0 END)
          FROM public.settlement_scope_transfers transfer
          JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
          WHERE transfer.currency = p_currency AND NOT transfer.is_reversal
            AND ((operation.actor_user_id = app_user_id AND operation.friend_user_id = p_friend_id)
              OR (operation.actor_user_id = p_friend_id AND operation.friend_user_id = app_user_id))), 0);
$old$;
  new_expression TEXT := $new$
        current_scope_balance := current_scope_balance - COALESCE((SELECT SUM(CASE
          WHEN transfer.from_user_id = app_user_id THEN transfer.signed_group_balance_delta
          ELSE -transfer.signed_group_balance_delta END)
          FROM public.settlement_scope_transfers transfer
          JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
          WHERE transfer.currency = p_currency AND NOT transfer.is_reversal
            AND ((operation.actor_user_id = app_user_id AND operation.friend_user_id = p_friend_id)
              OR (operation.actor_user_id = p_friend_id AND operation.friend_user_id = app_user_id))
            AND NOT EXISTS (
              SELECT 1
              FROM public.settlements converted
              JOIN public.settlement_scope_transfers converted_transfer
                ON converted_transfer.id = converted.backfilled_transfer_id
              WHERE converted_transfer.operation_id = transfer.operation_id
                AND NOT converted_transfer.is_reversal
            )), 0);
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commit_settlement_operation'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payment_intent_id uuid, p_friend_id uuid, p_group_id uuid, p_mode text, p_amount numeric, p_currency text, p_date timestamp with time zone, p_expected_balance numeric, p_allocations jsonb, p_transfers jsonb';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'commit_settlement_operation() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update commit direct-scope transfer term to participant orientation with backfill exclusion';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 5: commit group-scope existing-transfer term ───────────────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
        current_scope_balance := current_scope_balance + COALESCE((SELECT SUM(CASE
          WHEN operation.actor_user_id = app_user_id THEN transfer.signed_group_balance_delta
          WHEN operation.friend_user_id = app_user_id THEN -transfer.signed_group_balance_delta ELSE 0 END)
          FROM public.settlement_scope_transfers transfer
          JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
          WHERE transfer.group_id = allocation_group_id AND transfer.currency = p_currency
            AND NOT transfer.is_reversal
            AND ((operation.actor_user_id = app_user_id AND operation.friend_user_id = p_friend_id)
              OR (operation.actor_user_id = p_friend_id AND operation.friend_user_id = app_user_id))), 0)
$old$;
  new_expression TEXT := $new$
        current_scope_balance := current_scope_balance + COALESCE((SELECT SUM(CASE
          WHEN transfer.from_user_id = app_user_id THEN transfer.signed_group_balance_delta
          ELSE -transfer.signed_group_balance_delta END)
          FROM public.settlement_scope_transfers transfer
          JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
          WHERE transfer.group_id = allocation_group_id AND transfer.currency = p_currency
            AND NOT transfer.is_reversal
            AND ((operation.actor_user_id = app_user_id AND operation.friend_user_id = p_friend_id)
              OR (operation.actor_user_id = p_friend_id AND operation.friend_user_id = app_user_id))
            AND NOT EXISTS (
              SELECT 1
              FROM public.settlements converted
              JOIN public.settlement_scope_transfers converted_transfer
                ON converted_transfer.id = converted.backfilled_transfer_id
              WHERE converted_transfer.operation_id = transfer.operation_id
                AND NOT converted_transfer.is_reversal
            )), 0)
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commit_settlement_operation'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payment_intent_id uuid, p_friend_id uuid, p_group_id uuid, p_mode text, p_amount numeric, p_currency text, p_date timestamp with time zone, p_expected_balance numeric, p_allocations jsonb, p_transfers jsonb';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'commit_settlement_operation() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not update commit group-scope transfer term to participant orientation with backfill exclusion';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 6: scope-transfer validation priors exclusion ──────────────────
-- Priors already use the shared participant-based signs; only the
-- converted-operation exclusion is added so post-backfill validation bases
-- stay cash-consistent. Pre-backfill this predicate is vacuously true.
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
      FROM public.settlement_scope_transfers t
      WHERE t.group_id = NEW.group_id
        AND t.currency = NEW.currency
        AND NOT t.is_reversal
        AND (
          (t.from_user_id = operation_row.actor_user_id AND t.to_user_id = operation_row.friend_user_id)
          OR (t.from_user_id = operation_row.friend_user_id AND t.to_user_id = operation_row.actor_user_id)
        )
$old$;
  new_expression TEXT := $new$
      FROM public.settlement_scope_transfers t
      WHERE t.group_id = NEW.group_id
        AND t.currency = NEW.currency
        AND NOT t.is_reversal
        AND (
          (t.from_user_id = operation_row.actor_user_id AND t.to_user_id = operation_row.friend_user_id)
          OR (t.from_user_id = operation_row.friend_user_id AND t.to_user_id = operation_row.actor_user_id)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.settlements converted
          JOIN public.settlement_scope_transfers converted_transfer
            ON converted_transfer.id = converted.backfilled_transfer_id
          WHERE converted_transfer.operation_id = t.operation_id
            AND NOT converted_transfer.is_reversal
        )
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'validate_settlement_scope_transfer'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'validate_settlement_scope_transfer() was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not add backfill exclusion to scope-transfer validation priors';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 7: friend scope-transfer read exclusion ────────────────────────
-- Client balance inputs (and operation views) stop seeing converted
-- operations; pre-backfill visibility is unchanged.
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
  WHERE (o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
     OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id)
  ORDER BY t.created_at DESC, t.id DESC;
$old$;
  new_expression TEXT := $new$
  WHERE ((o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
     OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id))
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlements converted
      JOIN public.settlement_scope_transfers converted_transfer
        ON converted_transfer.id = converted.backfilled_transfer_id
      WHERE converted_transfer.operation_id = t.operation_id
        AND NOT converted_transfer.is_reversal
    )
  ORDER BY t.created_at DESC, t.id DESC;
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_friend_scope_transfers'
    AND pg_get_function_identity_arguments(p.oid) = 'p_friend_id uuid';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_friend_scope_transfers(UUID) was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not add backfill exclusion to friend scope transfers';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- ── Block 8: group scope-transfer read exclusion ─────────────────────────
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
  old_expression TEXT := $old$
  FROM public.settlement_scope_transfers t
  WHERE t.group_id = p_group_id
  ORDER BY t.created_at DESC, t.id DESC;
$old$;
  new_expression TEXT := $new$
  FROM public.settlement_scope_transfers t
  WHERE t.group_id = p_group_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.settlements converted
      JOIN public.settlement_scope_transfers converted_transfer
        ON converted_transfer.id = converted.backfilled_transfer_id
      WHERE converted_transfer.operation_id = t.operation_id
        AND NOT converted_transfer.is_reversal
    )
  ORDER BY t.created_at DESC, t.id DESC;
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_group_scope_transfers'
    AND pg_get_function_identity_arguments(p.oid) = 'p_group_id uuid';
  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_group_scope_transfers(UUID) was not found';
  END IF;
  original_definition := function_definition;
  function_definition := replace(function_definition, old_expression, new_expression);
  IF function_definition = original_definition THEN
    RAISE EXCEPTION 'Could not add backfill exclusion to group scope transfers';
  END IF;
  EXECUTE function_definition;
END;
$$;
