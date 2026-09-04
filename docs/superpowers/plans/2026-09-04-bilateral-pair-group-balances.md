# Bilateral Pair Group Balances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every friend-pair group balance bilateral (what the two people owe each other, e.g. viewer↔friend = you owe $523.38) instead of negated-global-net (today's wrong −$1610.11), in both display and settlement validation, shipped atomically.

**Architecture:** Replace the global group-balance base (all expenses/settlements in the group) with the pair pattern already proven by `direct_expense_impacts` (only flows between the two people), in the one display RPC and every commit/reverse validation that must agree with it. One migration, all sites, because display numbers feed `p_expected_balance`.

**Tech Stack:** Supabase Postgres (plpgsql, SECURITY DEFINER, `public, private, pg_temp` search_path), TypeScript, Vitest. No client logic changes — `buildCombinedSettlementPlan` is pure arithmetic on server numbers.

**Spec:** This conversation (2026-09-04): friend-settle `SETTLEMENT_TRANSFER_BALANCE_MISMATCH` root cause, viewer↔friend reconciliation (friend global +1610.11 vs bilateral −523.38 vs simplified $0), direct ledger +$69.48 (friend owes viewer: two direct expenses $32.63 + $36.85).

## Global Constraints

- `npm run precommit` (lint + `typecheck:supabase` + Vitest) must pass.
- New/changed SQL keeps `SECURITY DEFINER`, `SET search_path = public, private, pg_temp`, and existing `REVOKE ALL ... FROM PUBLIC, anon` / `GRANT EXECUTE ... TO authenticated` blocks verbatim.
- Amounts round to cents; `|x| < 0.01` normalizes to 0 with `settled` direction (existing convention).
- Never `DROP TABLE`; never drop `reverse_settlement_operation` (see `services/settlement-rpc-migration-contract.test.ts`).
- Verification queries against prod are SELECT-only. `supabase db push --linked` only on explicit user confirmation of target (currently linked: prod `avi's Project`).
- No version-skew handling needed: plan arithmetic is client-pure on server-provided numbers, so old builds stay consistent with new RPCs.

---

## Key invariant (do not break)

`validate_settlement_scope_transfer` requires `NEW.signed_group_balance_delta = -actor_balance`, and the client sends `signedGroupBalanceDelta = -scope.amount`. Therefore **`actor_balance` (server) must equal `scope.amount` (display)** to the cent, for every pair/group/currency. Every task below preserves this.

## Bilateral definition (display sign: `amount > 0` = you_are_owed)

For viewer V, friend F, group G, currency C, `scope.amount` =

- expenses: `SUM over expenses in G, C, paid_by IN (V,F): (paid_by=V ? F_split : -V_split)` (third-party-paid contributes 0; mirrors `direct_expense_impacts`)
- settlements: `SUM over settlements in G, C, between V,F: (from=F ? -amount : +amount)`
- transfers: `SUM over non-reversal transfers in G, C, between V,F: (from=F ? -delta : +delta)` (already shipped in `20260904210000`)
- direct parts: unchanged (already bilateral)

Check against prod truth: viewer↔friend = (545.11 − 1068.49) + 0 + 0 = **−523.38** (you owe $523.38); a second pair is unchanged at +526.35 combined; friend global settled stays 0 on group page (global nets untouched there).

---

### Task 1: Audit reversal and zero-net balance sources

**Files:**
- Read: `supabase/migrations/20260818350000_scope_aware_reversal_validation.sql:100-160`
- Read: `supabase/migrations/20260819040000_align_reversal_and_retire_legacy_commit_path.sql:60-95`
- Read: `supabase/migrations/20260819030000_unify_zero_net_commit_semantics.sql:120-140`
- Read: `supabase/migrations/20260818270000_add_settlement_operation_reversal.sql:150-175`

**Interfaces:**
- Consumes: nothing new
- Produces: verdict per site (audited 2026-09-04 against LIVE prod definitions via `pg_get_functiondef`, not migration history)

Verdict (all live, all GLOBAL group legs → must go bilateral in Task 3):
- commit `current_balance` = `commit_settlement_operation` body from `20260819050000:168-203` (direct pair + group global).
- trigger base = `validate_settlement_scope_transfer` body from `20260904210000` (expense/settlement global; transfers already pair-only).
- reversal = live `reverse_settlement_operation` (19040000 shape: direct pair + group global, NO transfer leg — keep that absence as-is, out of scope).
- zero-net = NO CHANGE NEEDED: live `commit_zero_net_settlement_operation` derives its balance from `get_friend_home_relationships().relationship->'totalsByCurrency'`, so it follows the display RPC automatically.
- dead files (`20260818090000`, `20260818260000`, `20260819020000`, `20260818270000`, `20260818350000`-era reversal) are superseded (single live function per name in prod) — untouched.

- [ ] **Step 1: Read each site and classify the group-balance computation**

Done during planning (see Interfaces verdict above — live definitions, not history). Skip to Step 2.

- [ ] **Step 2: Verify no other `current_balance` writer exists**

Run: `grep -rn "INTO current_balance" supabase/migrations --include='*.sql' | grep -v '20260904'`
Expected: only the sites from Step 1 plus `20260819050000:202` (commit, known GLOBAL) and dead legacy files (`20260818090000`, `20260818260000`, `20260819020000` — confirm each is fully superseded by checking for a later `DROP FUNCTION` or rename covering the same function name; note the survivors).

- [ ] **Step 3: Commit the audit**

```bash
git add supabase/migrations
git commit -m "docs: audit balance sources for bilateral plan" --allow-empty
```

(Note: Step 3 is a no-op commit marker only if Task 1 produces no file change; otherwise fold the audit comment into Task 3 and skip this commit.)

---

### Task 2: Failing client test for bilateral settle input

**Files:**
- Modify: `services/settlement-service.test.ts` (append new `describe` block; follow existing import/style)
- Test: same file

**Interfaces:**
- Consumes: `buildCombinedSettlementPlan` from `services/settlement-service.ts` (unchanged signature)
- Produces: proof the pure plan builder is correct on bilateral inputs (no prod change needed client-side)

- [ ] **Step 1: Write the failing test**

Append (match existing style; `currentUserId: 'varun'`, `friendId: 'deep'`):

```ts
describe('buildCombinedSettlementPlan with bilateral group inputs', () => {
  it('full-settles bilateral group -523.38 with a pair transfer', () => {
    const plan = buildCombinedSettlementPlan({
      currentUserId: 'viewer',
      friendId: 'friend',
      currency: 'USD',
      amount: 523.38,
      directBalance: 0,
      groupBalances: [{
        groupId: 'trip-group',
        groupName: 'Trip Group',
        currency: 'USD',
        amount: -523.38,
        direction: 'you_owe',
      }],
    });
    expect(plan.transfers).toHaveLength(1);
    expect(plan.transfers[0].signedGroupBalanceDelta).toBeCloseTo(523.38, 2);
    expect(plan.transfers[0].fromUserId).toBe('viewer');
    expect(plan.transfers[0].toUserId).toBe('friend');
    const totalAllocated = plan.allocations.reduce((sum, a) => sum + a.amount, 0);
    expect(totalAllocated).toBeCloseTo(523.38, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it passes already (characterization)**

Run: `npx vitest run services/settlement-service.test.ts 2>&1 | tail -6`
Expected: PASS (builder is input-agnostic; this locks the behavior bilateral inputs need). If it fails, stop — the builder assumption is wrong and the plan must change before any SQL.

- [ ] **Step 3: Commit**

```bash
git add services/settlement-service.test.ts
git commit -m "test: lock settle-plan behavior for bilateral group inputs"
```

---

### Task 3: Single atomic migration to bilateral group balances

**Files:**
- Create: `supabase/migrations/20260904XXXXXX_bilateral_pair_group_balances.sql` (next timestamp after `20260904210000`; `ls supabase/migrations | tail -3` to pick it)
- Modify: none (all changes inside the new migration via `CREATE OR REPLACE`)

**Interfaces:**
- Consumes: Task 1 verdict (which functions to rewrite)
- Produces: prod functions where display == validation per the invariant; must include ALL of: legacy home base, commit `current_balance`, trigger base, reversal + zero-net per audit

- [ ] **Step 1: Rewrite the legacy home base `group_impacts` to bilateral**

In the migration, `CREATE OR REPLACE FUNCTION public.get_friend_home_relationships_legacy()` — copy the current body from `supabase/migrations/20260818110000_get_friend_home_relationships.sql:121-156` and replace the four `UNION ALL` legs with pair-only legs. Expense legs must follow the `direct_expense_impacts` pattern (same file, lines 56-78):

```sql
-- expenses paid by viewer: friend's share adds to viewer-owed
SELECT e.group_id, e.currency, friend.friend_id AS user_id, COALESCE(friend_split.amount, 0) AS amount
FROM friend_profiles friend
JOIN public.expenses e ON e.group_id IS NOT NULL AND e.deleted_at IS NULL
  AND e.paid_by = app_user_id
LEFT JOIN public.expense_splits friend_split
  ON friend_split.expense_id = e.id AND friend_split.user_id = friend.friend_id
WHERE COALESCE(friend_split.amount, 0) > 0
  AND EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = e.group_id AND m.user_id = friend.friend_id)

UNION ALL

-- expenses paid by friend: viewer's share subtracts
SELECT e.group_id, e.currency, friend.friend_id AS user_id, -COALESCE(current_split.amount, 0) AS amount
FROM friend_profiles friend
JOIN public.expenses e ON e.group_id IS NOT NULL AND e.deleted_at IS NULL
  AND e.paid_by = friend.friend_id
LEFT JOIN public.expense_splits current_split
  ON current_split.expense_id = e.id AND current_split.user_id = app_user_id
WHERE COALESCE(current_split.amount, 0) > 0
  AND EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = e.group_id AND m.user_id = app_user_id)

UNION ALL

-- pair settlements only
SELECT s.group_id, s.currency, friend.friend_id AS user_id,
  CASE WHEN s.from_user_id = friend.friend_id THEN -s.amount ELSE s.amount END AS amount
FROM friend_profiles friend
JOIN public.settlements s ON s.group_id IS NOT NULL
  AND ((s.from_user_id = app_user_id AND s.to_user_id = friend.friend_id)
    OR (s.from_user_id = friend.friend_id AND s.to_user_id = app_user_id))
```

Then `friend_group_balances` keeps `-balances.group_balance AS amount` (unchanged negation). Keep every `REVOKE`/`GRANT` on both `get_friend_home_relationships` and `_legacy` byte-identical to the originals. Do NOT touch the `20260818220000` wrapper (its pair-scoped `transfer_deltas` now matches the bilateral base exactly).

- [ ] **Step 2: Rewrite the commit `current_balance` group legs to bilateral**

In the same migration, `CREATE OR REPLACE` the live `commit_settlement_operation` (full current body: `supabase/migrations/20260819050000_fix_positive_settlement_fingerprint_column.sql`, sections containing lines 168-203 — copy the whole function verbatim, changing ONLY the two group `COALESCE` subqueries at lines 185-202). Replace the group-expenses subquery with the pair pattern (same shape as Step 1, with `p_friend_id` as friend and `app_user_id` as viewer, plus `AND e.currency = p_currency` and shared-group membership on the expense's group). Replace the group-settlements subquery with pair-only settlements in `p_currency`:

```sql
+ COALESCE((SELECT SUM(CASE WHEN s.from_user_id = p_friend_id THEN -s.amount
    WHEN s.to_user_id = p_friend_id THEN s.amount ELSE 0 END)
  FROM public.settlements s
  WHERE s.currency = p_currency AND s.group_id IS NOT NULL
    AND ((s.from_user_id = app_user_id AND s.to_user_id = p_friend_id)
      OR (s.from_user_id = p_friend_id AND s.to_user_id = app_user_id))), 0)
```

Keep the direct legs (lines 168-184), fingerprint logic, idempotency, and grants byte-identical.

- [ ] **Step 3: Rewrite the trigger base to bilateral**

`CREATE OR REPLACE FUNCTION public.validate_settlement_scope_transfer()` — copy the body from `supabase/migrations/20260904210000_fix_scope_transfer_pair_only.sql`, changing ONLY the expense subquery: restrict to pair-paid expenses with the bilateral CASE, and require both memberships (already present via the `actor_member`/`friend_member` joins — keep them):

```sql
SELECT COALESCE(SUM(CASE
    WHEN e.paid_by = operation_row.actor_user_id THEN COALESCE(friend_split.amount, 0)
    WHEN e.paid_by = operation_row.friend_user_id THEN -COALESCE(viewer_split.amount, 0)
    ELSE 0 END), 0)
  + ... (settlement + transfer subqueries unchanged from 20260904210000)
FROM public.expenses e
LEFT JOIN public.expense_splits friend_split
  ON friend_split.expense_id = e.id AND friend_split.user_id = operation_row.friend_user_id
LEFT JOIN public.expense_splits viewer_split
  ON viewer_split.expense_id = e.id AND viewer_split.user_id = operation_row.actor_user_id
JOIN public.group_members actor_member ... (keep)
JOIN public.group_members friend_member ... (keep)
WHERE e.deleted_at IS NULL AND e.group_id = NEW.group_id AND e.currency = NEW.currency
  AND e.paid_by IN (operation_row.actor_user_id, operation_row.friend_user_id)
```

Keep the settlement subquery (pair-only? — NO: change it too. Current trigger settlement part sums ALL group settlements involving friend. Bilateral requires pair-only):

```sql
SELECT SUM(CASE
  WHEN s.from_user_id = operation_row.friend_user_id THEN -s.amount
  WHEN s.to_user_id = operation_row.friend_user_id THEN s.amount ELSE 0 END)
FROM public.settlements s
WHERE s.group_id = NEW.group_id AND s.currency = NEW.currency
  AND ((s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id)
    OR (s.from_user_id = operation_row.friend_user_id AND s.to_user_id = operation_row.actor_user_id))
```

Transfer subquery: keep exactly as in `20260904210000` (already pair-only).

- [ ] **Step 4: Mirror Steps 2-3 into live reversal (zero-net needs nothing)**

Rewrite the two group legs of live `reverse_settlement_operation` (19040000 shape: group-expenses leg and group-settlements leg) with the identical bilateral CASEs from Steps 2-3. Keep the absent transfer leg absent (pre-existing behavior, noted in the migration header). Zero-net requires NO change (it reads display totals) — assert this in the header comment instead of touching it.

- [ ] **Step 5: Lint the migration file**

Run: `supabase db lint --local --level warning 2>&1 | tail -3`
Expected: `No schema errors found`. (Local DB is schema-empty so this checks syntax/privileges only — the real verification is Task 5.)

---

### Task 4: Contract tests for the bilateral migration

**Files:**
- Modify: `services/settlement-rpc-migration-contract.test.ts` (append two `it` blocks)
- Test: same file

**Interfaces:**
- Consumes: the Task 3 migration filename (replace `<STAMP>` with the real stamp)
- Produces: CI guard against regressing to global balances

- [ ] **Step 1: Write the failing tests**

```ts
it('computes friend group balances bilaterally (pair-paid expenses only)', () => {
  const migration = readMigration('20260904<STAMP>_bilateral_pair_group_balances.sql');

  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_friend_home_relationships_legacy()');
  expect(migration).toContain('SET search_path = public, private, pg_temp');
  // pair pattern: only expenses paid by one of the pair can move the pair balance
  expect(migration).toContain('e.paid_by IN (operation_row.actor_user_id, operation_row.friend_user_id)');
  expect(migration).toContain('e.paid_by = app_user_id');
  // no unbounded group-wide expense scan may remain in the pair path
  const legacy = migration.match(/get_friend_home_relationships_legacy\(\)([\s\S]*?) mistaken/)?.[1] ?? '';
  expect(legacy).not.toContain('undefined-sentinel-xyz');
});

it('validates commits and transfers against the same bilateral base', () => {
  const migration = readMigration('20260904<STAMP>_bilateral_pair_group_balances.sql');

  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.validate_settlement_scope_transfer()');
  expect(migration).toContain('s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id');
  expect(migration).toContain('ROUND(p_expected_balance, 2)');
  expect(migration).not.toContain('DROP TABLE');
});
```

(Replace the placeholder-sentinel line before running: the intent is asserting the legacy `group_impacts` no longer contains the old global legs — write the concrete `not.toContain` against the exact removed fragment, e.g. the old `SELECT e.group_id, e.currency, e.paid_by AS user_id` leg.)

- [ ] **Step 2: Run to verify they fail before Task 3 lands / pass after**

Run: `npx vitest run services/settlement-rpc-migration-contract.test.ts 2>&1 | tail -6`
Expected after Task 3: PASS. (If implementing out of order and they fail, that is the correct TDD red.)

- [ ] **Step 3: Commit tests with the migration**

```bash
git add services/settlement-rpc-migration-contract.test.ts supabase/migrations/20260904<STAMP>_bilateral_pair_group_balances.sql
git commit -m "test: contract bilateral pair group balances migration"
```

---

### Task 5: Verification (read-only prod checks + full suite)

**Files:** none (verification only)

- [ ] **Step 1: Full local suite**

Run: `npm run precommit 2>&1 | tail -8`
Expected: lint clean, typecheck clean, all Vitest files pass.

- [ ] **Step 2: Prod SELECT-only reconciliation (do not write)**

Run each via `supabase db query --linked --output json` and compare to the expected values below (source data 2026-09-04; small drift is fine if new expenses landed — recompute from the same queries):

```bash
# 1. Viewer↔friend bilateral group base (must equal -523.38):
#    friend splits on viewer-paid (545.11) minus viewer splits on friend-paid (1068.49),
#    plus pair settlements (0) plus pair transfers (0).
# 2. Second pair combined still +526.35 (no third-party transfers involve that friend).
# 3. Friend global net still 0 (group page unchanged — global nets are NOT in scope).
# 4. Direct viewer↔friend still +69.48 (two direct expenses 32.63 + 36.85).
```

Concretely re-run the three queries used in this investigation (paid/owes per member; settlements involving the friend; pair transfers viewer↔friend) and confirm: bilateral −523.38, pair transfers 0, global friend 0.

- [ ] **Step 3: Deploy only on explicit confirmation**

```bash
supabase db push --linked --dry-run 2>&1 | tail -5
# confirm exactly one migration pending, then:
supabase db push --linked 2>&1 | tail -5
```

- [ ] **Step 4: Post-deploy smoke**

```bash
supabase db query --linked --output json "select pg_get_functiondef(oid) as def from pg_proc where proname='validate_settlement_scope_transfer';" | grep -c "e.paid_by IN"
# Expected: 1
```

Then in-app: open the friend page → group row must read `You owe $523.38`; the second pair's page still settles (retry the $526.35 flow that originally failed).

---

## Out of scope (follow-up plans, not this one)

- Group-page settle plan (simplified who-pays-whom with one-tap record) — needs its own spec; display-only, no validation coupling.
- Group settle screen member preselect (`?member=`) — tiny independent task.
- Plain-language transfer copy (`internal offset` → `moved $X to direct`) + settled-row tap-through.
- `friendGroupBalanceService` (client global fallback) divergence — harmless while `relationshipAdapter` is wired (prod), but either align it to bilateral or delete the fallback; file a ticket.

## Self-review

- Spec coverage: friend-settle mismatch (trigger pair transfers, shipped) → Task 3 keeps it; −1610.11 vs −523.38 display → Task 3 Step 1; commit STALE coupling → Step 2; reversal/zero-net coupling → Step 4 via Task 1 audit; $69.48 direct untouched (already bilateral) — no task needed; $0-simplified vs $523.38-bilateral coexistence — display shows bilateral, plan feature deferred to follow-up. No gaps.
- Placeholders: none — every step names exact files, lines, SQL shapes, commands, expected outputs. (Task 4's `<STAMP>` is filled at implementation time from `ls`; the sentinel line is flagged for concretization in-step.)
- Type consistency: `scope.amount` (display, viewer-positive = owed-to-you) == trigger `actor_balance`; `signedGroupBalanceDelta = -scope.amount`; `validate… <> ROUND(-actor_balance,2)` — consistent across Tasks 2-4 and the invariant.
