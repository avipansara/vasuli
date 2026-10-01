# 06 Client data boundary

Status: ready
Implementation: resolved
Blocked by: 03, 04
Worker: /root/client_data
Requested model: gpt-6-luna
Claimed at: 2026-09-29T19:53:53Z
Review rounds: 1
Expected areas: types/, services/, hooks/, lib/, focused tests

## Scope

Add typed rule and occurrence models, a service for authenticated rule commands and reads, and query keys/invalidation for rule data. Keep business and split logic out of route components.

## Acceptance criteria

- [x] Typed service supports create, list owned/shared, detail, edit, pause, resume, stop, and missed-date review using existing auth patterns.
- [x] Posted occurrence provenance reaches expense detail without breaking existing expense mappers or read models.
- [x] Query invalidation covers every rule mutation and server-posted occurrence impact on friend, group, expense, and activity screens; existing mutation paths involving the same entity are swept.
- [x] Errors map to actionable user states, including offline, stale rule, invalid participant, and already posted date.

## Checks

- Focused service tests named in the implementation report.
- `npm run lint`

## Expected areas

`types/`, `services/`, `hooks/`, `lib/`.

## Comments

- Review round 1: Rule detail caches are keyed only by rule ID even though owners receive all shares and private diagnostics while participants receive a restricted result. Auth logout currently clears only friend queries, so scope new rule detail keys by current app user to prevent reuse across account switches. The command mapper also discards stop race fields (`last_posted_due_on`, `stopped_after_due_on`) and review failure `reason`; preserve these typed fields so the management UI can report the required results. Shared participant focus fallback currently inherits a 30-second fresh cache; ensure recurring queries actually refetch on each focus, such as by setting an appropriate staleTime.

## Implementation evidence

- Requested worker model: `gpt-6-luna`; worker: `/root/client_data`; review rounds: 1.
- Changed: recurring models/service/query and mutation hooks, owner-only diagnostics, occurrence mapping, user-scoped cache keys and invalidation, root realtime/app-resume refresh, focus refresh, publication migration, and focused tests.
- Primary ran the five focused service/mapping/invalidation/intake test files (29 passed), `npm run lint` (0 errors; 7 warnings in untouched files), and `git diff --check` successfully.
- Primary applied all 106 migrations in a disposable local Supabase project, replayed the publication migration successfully, and verified exactly one `supabase_realtime` entry for `recurring_expense_rules`. The project was stopped and removed.
- Branch, HEAD, staged state, and unrelated pre-existing changes matched the pre-dispatch snapshot. Whole-app typechecking still reports the existing unchanged `app/invite/[id].tsx:126` InviteType mismatch.
