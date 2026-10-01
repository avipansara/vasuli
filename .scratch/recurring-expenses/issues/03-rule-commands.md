# 03 Rule commands

Status: ready
Implementation: resolved
Blocked by: 02
Worker: /root/rule_commands
Requested model: gpt-6-luna
Claimed at: 2026-09-29T18:51:36Z
Review rounds: 3
Expected areas: supabase/migrations/, focused server command tests

## Scope

Implement server-validated creation, editing, pause, resume, stop, read-only participant reads, duplicate warnings, and the optional last due date. Keep posted expenses immutable to rule edits.

## Acceptance criteria

- [x] The server validates owner identity, group or accepted friendship scope, payer equals owner, participant set, currency, positive amount, and exact-cent split total on create and edit.
- [x] Create and material edit queue one notice per affected participant for delivery; approval is not required. A likely duplicate produces a warning path without forbidding legitimate similar rules.
- [x] Edits affect unposted dates only. A posting/edit race has a defined winner and returns the first date using the new values.
- [x] Pause skips dates until resumed. Stop is final and preserves posted expenses. Optional last due date is stored; the final-occurrence transition belongs to ticket 04's poster.
- [x] Unrelated users cannot invoke mutations. Read-only participants cannot pause, stop, or edit.

## Checks

- Focused server command and access tests named in the implementation report.
- `npm run typecheck:supabase`

## Expected areas

`supabase/migrations/`, focused server tests.

## Comments

- Review round 1: Primary independently applied all migrations in a disposable Supabase project, but the SQL regression fails at its first outbox assertion: `column reference "rule_id" is ambiguous` in `recurring_expense_command_regressions.sql` (PL/pgSQL variable versus column). Qualify/rename test variables throughout and rerun the full script. In the edit command, accepting `first_due_on` while never persisting it makes the API silently ignore a requested schedule change; changing cadence, anchor, or time zone leaves `next_due_on` on the old schedule. Either define these fields as immutable on edit with explicit validation, or correctly recompute the first unposted due date under the new schedule and test it. Preserve the locked posting/edit boundary and the returned `applies_from` contract.
- Review round 2: Primary rebuilt all 103 migrations and reran the command regression. The edit path fails with `column "recipient" does not exist` in `edit_recurring_expense_rule` at `SELECT array_agg(DISTINCT recipient ORDER BY recipient) FROM unnest(...) recipients`. Correct the unnest alias and rerun the full SQL script. Review similar unnest and PL/pgSQL name-resolution cases before reporting.
- Review round 3: The full SQL regression now passes. One acceptance gap remains: `edit_recurring_expense_rule` silently ignores a supplied `paid_by` different from the owner, while the ticket requires payer validation on both create and edit. Reject a mismatched payer explicitly and add a focused SQL rejection case. Preserve the existing immutable payer storage and all passing command behavior.

## Implementation evidence

- Requested worker model: `gpt-6-luna`; worker: `/root/rule_commands`; review rounds: 3.
- Changed: recurring rule command migration and rollback-only SQL regression. The migration adds validated RPCs, row-locked edit/pause/resume/stop, participant reads, duplicate warnings, a notice outbox, and a direct-mutation guard.
- Primary independently rebuilt all 103 migrations and ran `docker exec -i supabase_db_recurring-ticket03-check psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/recurring_expense_command_regressions.sql`; the final run passed and rolled back. The disposable project was stopped and removed.
- Primary ran `npm run typecheck:supabase` and `git diff --check`; both passed. Branch `codex/recurring-expenses`, HEAD `270123ac0e1286a3953a4d97927f4bdb82787b83`, and staged state match the pre-dispatch snapshot. Only the claimed migration, test, ticket, and lock changed since that snapshot.
