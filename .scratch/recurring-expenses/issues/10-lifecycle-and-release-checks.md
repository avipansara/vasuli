# 10 Lifecycle and release checks

Status: ready
Implementation: resolved
Blocked by: 04, 05, 07, 08, 09

## Scope

Finish account/group deletion behavior, operational documentation, changelog, and end-to-end verification against the approved spec. Do not deploy or publish.

## Acceptance criteria

- [x] Account deletion stops future owned rules while preserving already posted shared history under current deletion rules. Group deletion and friendship removal pause affected rules.
- [x] Scheduler setup, failure recovery, and 9:00 a.m. local timing are documented for preview/production without exposing secrets.
- [x] End-to-end checks cover monthly rollover, due-today, two-date catch-up and review, duplicate worker calls, edit future versus this expense, pause/stop, and permissions.
- [x] `CHANGELOG.md` describes the feature and any deployment requirements.

## Checks

- `npm run lint`
- `npm run typecheck:supabase`
- `npm test`
- `npm run precommit`
- Focused integration or device check commands named in the implementation report.

## Expected areas

`supabase/migrations/`, `supabase/functions/`, docs, targeted lifecycle tests.

## Comments

### Draft migration verification

Primary ran the supplied 20260929230000_recurring_expense_lifecycle.sql inside a rollback-only transaction against isolated vasuli-recurring-ui-check. Group soft deletion, friendship deletion, and saved group membership deletion each paused active affected rules with reasons. Account deletion stopped owned rules, cleared next_due_on, and preserved a settled shared expense plus its two splits. Synthetic fixtures and migration changes were rolled back. Proof script/log: /private/tmp/vasuli-recurring-lifecycle-review.sql and /private/tmp/vasuli-recurring-lifecycle-review.log. Permanent lifecycle regressions, unaffected/terminal rules and friendship status-transition cases remain to add. Existing docs/recurring-expense-scheduler.md covers service-role access, environment-separated Vault/Cron setup and saved local 9am timing; final owner repair/backlog/operator recovery guidance needs review. No migration deployed or permanently applied.

### Final integration review notes

- Lifecycle triggers now pause rules before the posting regression calls the worker. Existing receipt assertions at posting regression group/friend/member cases can pass accidentally because a missing reason yields SQL NULL. Assert stored paused_reason and explicit already_processed/zero-posted behavior with null-safe conditions, while preserving a separate case proving worker validation without lifecycle trigger intervention.
- e2e/recurring-expense-creation.test.js uses Detox global expect on a boolean enabled value; use Jest expect as existing neighboring tests do. Native iOS 27 root visibility geometry and scrollTo do not reliably reflect interactive child visibility; temporary verification proved mounted route plus visible controls and physical native swipes. Do not weaken all assertions to existence.
- Final native light/dark review sheets passed on requested iPhone and Android. Android repair draft removal disabled Save and restoration enabled it. Hardware keyboard makes software keyboard inspection incomplete; record device limitations rather than overstating coverage. User requested shorter verification after emulator setup took too long. Focus final checks on backend invariants and remaining permission behavior.

### Claim

Requested model: gpt-6-luna (high). Review rounds: 0. Expected areas: lifecycle migration/tests, scheduler recovery docs, changelog, focused final integration checks.

Worker: /root/lifecycle_release
Requested model: gpt-6-luna (high)

### Independent final checks and correction rounds

Primary passed all 5 rollback-only SQL regressions and full precommit: 110 files / 885 tests, lint zero errors / 10 warnings, app and Supabase TypeScript. Round 1 tightened new posting assertions to IS DISTINCT FROM and COALESCE-protected reasons. Concurrency financial assertions pass, but harness EXIT cleanup fails because new activity outbox still references its fixture expense. Round 2 requests safe complete cleanup of only guarded harness fixtures, same GPT-6 Luna worker; no unrelated data changes. Native occurrence owner inspection confirms cadence, scheduled date, Edit this expense label and single-expense notice; one metadata wrapping defect belongs to reopening09 after10 writer stops.

## Implementation evidence

Requested GPT-6 Luna high; worker /root/lifecycle_release; 2 correction rounds. Reviewed lifecycle migration applied only to isolated local project. Primary independently passed schema, command, posting, delivery and lifecycle rollback SQL; reran actual owner rule-edit versus historical-expense boundary with complete balanced shares and constraint enforcement. Two simultaneous posting calls pass financial assertions and exit cleanup, leaving no harness fixtures. Full precommit passed: 110 files / 885 tests, lint 0 errors / 10 warnings, app and Supabase TypeScript. Scheduler recovery and deployment requirements documented; e2e script syntax and shell syntax checks pass. Native light/dark manual+focused checks cover primary flows on iPhone18Pro iOS27 and Pixel9aAndroid; complete software-keyboard automation remains limited by hardware keyboard setup and is reported as such. No hosted deployment, commit or staging. Final combined visual review reopens09 for history metadata wrapping only.
