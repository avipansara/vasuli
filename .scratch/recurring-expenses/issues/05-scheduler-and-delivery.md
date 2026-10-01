# 05 Scheduler and delivery

Status: ready
Implementation: resolved
Blocked by: 04
Worker: /root/scheduler_delivery
Requested model: gpt-6-luna
Claimed at: 2026-09-29T19:34:16Z
Review rounds: 1
Expected areas: supabase/functions/, supabase/migrations/, supabase/config.toml, deployment docs, focused tests

## Scope

Add a trusted scheduled worker that finds due rules and invokes the atomic command. Deliver activity and participant notifications through an idempotent occurrence-linked queue or equivalent durable record.

## Acceptance criteria

- [x] Only the trusted scheduler can invoke worker behavior; secrets stay out of app bundles and logs. The worker does not create an expense through the client service.
- [x] The worker can run each minute and posts after 9:00 a.m. in each rule's saved time zone, with bounded batches and safe retry behavior.
- [x] Each occurrence queues one normal expense activity and a unique notification record per affected participant; activity and push delivery retry without reposting the expense.
- [x] Owner-readable posting errors and operator diagnostics distinguish transient failure from invalid participants. One failed rule does not block others.
- [x] Deployment configuration and preview/production scheduler setup are documented without triggering a deployment.

## Checks

- `npm run typecheck:supabase`
- Focused worker and delivery tests named in the implementation report.

## Expected areas

`supabase/functions/`, `supabase/migrations/`, `supabase/config.toml`, deployment documentation.

## Comments

- Review round 1: Primary applied all 105 migrations in a disposable Supabase project, but `recurring_expense_delivery_regressions.sql` fails before delivery assertions: its manual `expenses` INSERT lists `created_by` but omits its value. Fix the fixture and run the full regression. Also, ticket 03 queues `recurring_expense_rule_notification_outbox` rows for rule creation/material edits, but the scheduler drains only occurrence push rows. Add bounded, retryable delivery of rule notice rows with per-recipient uniqueness and a focused worker/database test; otherwise the previously accepted create/edit notices never reach participants. Preserve the trusted worker boundary and existing occurrence delivery behavior.

## Implementation evidence

- Requested worker model: `gpt-6-luna`; worker: `/root/scheduler_delivery`; review rounds: 1.
- Changed: trusted scheduled Edge Function and tests, delivery migration and rollback-only SQL regression, push type contract, Supabase function config, scheduler operations guide, and dated changelog entry.
- Primary independently applied all 105 migrations in a disposable local Supabase project and ran `docker exec -i supabase_db_recurring-ticket05-check psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/recurring_expense_delivery_regressions.sql` successfully. The project was stopped and removed.
- Primary ran `npx vitest run supabase/functions/process-recurring-expenses/worker.test.ts supabase/functions/send-push-notification/push.test.ts` (17 passed), `npm run typecheck:supabase`, focused ESLint, and `git diff --check`; all passed. Branch, HEAD, staged state, and unrelated pre-existing changes matched the pre-dispatch snapshot.
