# 02 Rule schema and access

Status: ready
Implementation: resolved
Blocked by: 01
Worker: /root/schema_access
Requested model: gpt-6-luna
Claimed at: 2026-09-29T18:26:50Z
Review rounds: 1
Expected areas: supabase/migrations/, database policy and constraint tests

## Scope

Add recurring rule and participant storage, nullable occurrence provenance on expenses, constraints, indexes, and RLS. Preserve existing expense and balance reads. Follow the Supabase Postgres skill and existing auth profile bridge.

## Acceptance criteria

- [x] Store owner, scope, immutable payer/currency, amount, split snapshot, cadence, anchor, time zone, first/next/optional last due date, status, and diagnostic state with suitable constraints.
- [x] Link posted expenses to one rule and scheduled local date. A database uniqueness rule prevents a second occurrence for the same rule/date even after soft deletion.
- [x] Owners can read their rules and affected participants can read only the schedule and their share. Only owners can mutate rule data; unrelated users cannot discover it.
- [x] Index due active rules and user-facing list queries. Existing expenses, splits, and account data remain readable without migration backfill errors.
- [x] Include database or migration verification for access boundaries and constraints.

## Checks

- `npm run typecheck:supabase`
- Focused migration or database checks for constraints and RLS, recording the commands and environment used.

## Expected areas

`supabase/migrations/`, generated or maintained database types if applicable.

## Comments

- Review round 1: The current Add Expense direct flow supports multiple selected friends (`app/add-expense.tsx`), while `recurring_expense_rules.direct_friend_id` models only one. Store a group-versus-friends scope that supports the saved participant set for multi-friend expenses. The current form also offers Shares, but the rule's `split_type` check stores only equal/exact/percentage. Preserve the selected split method separately from each posted split type. Update migration, generated types, and independent SQL coverage for both cases, then rerun ticket checks in the isolated database.

## Implementation evidence

- Requested worker model: `gpt-6-luna`; worker: `/root/schema_access`; review rounds: 1.
- Changed: recurring rule/participant migration and RLS, expense occurrence provenance, Supabase types, rollback-only SQL regression.
- Worker applied all 102 migrations and passed the SQL regression in a disposable local Supabase project; `npm run typecheck:supabase` and `git diff --check` passed.
- Primary independently applied all 102 migrations in a separate disposable project and ran `docker exec -i supabase_db_recurring-primary-check psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/recurring_expense_schema_regressions.sql` successfully. The project was stopped and removed; existing `supabase_db_vasuli` was untouched. Primary also ran `npm run typecheck:supabase` successfully.
- Branch `codex/recurring-expenses`, HEAD `270123ac0e1286a3953a4d97927f4bdb82787b83`, and staged state matched the pre-dispatch snapshot; unrelated user changes remained intact.
