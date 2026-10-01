# 04 Atomic occurrence posting

Status: ready
Implementation: resolved
Blocked by: 01, 02, 03
Worker: /root/atomic_posting
Requested model: gpt-6-luna
Claimed at: 2026-09-29T19:12:45Z
Review rounds: 2
Expected areas: supabase/migrations/, focused SQL and concurrency tests

## Scope

Implement the trusted posting command and missed-date review commands. Do not send push directly inside the posting transaction.

## Acceptance criteria

- [x] One transaction locks the rule, checks due status and current participants, inserts one expense and its complete split set, records a delivery event, and advances the rule.
- [x] Concurrent calls and retries produce one occurrence per rule/date. A soft-deleted occurrence is never recreated. Posted rows retain their rule/date identity if edited.
- [x] Deleted groups, departed members, or ended friendships pause the rule with an owner-readable reason and create no partial expense.
- [x] After an outage, at most two missed dates post automatically in order; any remaining dates pause for owner review. Each reviewed date can be posted or skipped exactly once before resuming.
- [x] Stop and edit races serialize against posting. Already posted expenses remain unchanged. The final due date ends the rule.
- [x] Tests demonstrate concurrency, idempotency, split atomicity, calendar transitions, and failure behavior.

## Checks

- Focused database and concurrency checks named in the implementation report.
- `npm run typecheck:supabase`

## Expected areas

`supabase/migrations/`, focused SQL or integration tests.

## Comments

- Review round 1: Primary applied all 104 migrations and the rollback-only posting SQL regression passed. The two-session harness fails during fixture setup: the deferred share-total constraint fires after the rule INSERT before participant INSERT because psql autocommits each statement. Wrap fixture setup in one transaction and make cleanup reliable for partial setup. Also, `post_due_recurring_expenses` and `review_recurring_expense_date` only end when the just-posted date reaches `last_due_on`; an optional last date between cadence dates causes the next pointer to exceed the schema's `last_due_on` check, rolling back the occurrence. End after the final scheduled date at or before `last_due_on`, including when `next_date > last_due_on`, with a focused regression.
- Review round 2: Primary independently reran the posting SQL regression and two-session concurrency harness; both pass. However, ticket 03's public `resume_recurring_expense_rule` still lets an owner skip all outage review dates at once, and `pause_recurring_expense_rule` can overwrite the review reason before resume. Ticket 04 requires explicit post/skip decisions for each remaining missed date. Close those bypasses in the posting migration (or the owned command migration, if safe), while preserving deliberate pause/resume behavior. Add an authenticated-owner SQL regression that resume and pause cannot bypass a pending outage review, then rerun checks.

## Implementation evidence

- Requested worker model: `gpt-6-luna`; worker: `/root/atomic_posting`; review rounds: 2.
- Changed: trusted atomic posting migration, rollback-only SQL regression, and a two-session concurrency harness.
- Primary independently applied all 104 migrations in a disposable local Supabase project; `docker exec -i supabase_db_recurring-ticket04-check psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/recurring_expense_posting_regressions.sql` passed. The concurrency harness passed using the database container's psql client: one expense, two complete splits, two delivery events, final rule ended. The project was stopped and removed.
- Primary ran `npm run typecheck:supabase`, `bash -n supabase/tests/recurring_expense_concurrency.sh`, and `git diff --check`; all passed. Branch, HEAD, staged state, and unrelated user changes matched the pre-dispatch snapshot.
