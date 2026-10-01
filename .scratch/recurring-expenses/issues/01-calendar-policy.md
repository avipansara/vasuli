# 01 Calendar policy

Status: ready
Implementation: resolved
Blocked by: none
Worker: /root/calendar_policy
Requested model: gpt-5.6-luna
Claimed at: 2026-09-29T18:19:12Z
Review rounds: 2
Expected files: utils/recurring-schedule.ts, utils/recurring-schedule.test.ts

## Scope

Implement pure calendar helpers for weekly and monthly recurring expense due dates. Keep the rule's local date separate from instants and from the device's current time zone. Include optional last due date and the 9:00 a.m. local posting threshold. Do not touch database or UI code.

## Acceptance criteria

- [x] Weekly recurrence keeps the anchor weekday. Monthly recurrence keeps the anchor day, using the last day only in shorter months, then returning to the anchor day.
- [x] Leap years, year boundaries, daylight saving changes, and time zones produce the intended local due dates without drifting.
- [x] Optional last due date includes an occurrence on that date and excludes later ones. Today's rule created after 9:00 a.m. becomes due shortly after save.
- [x] Helpers classify at most two missed due dates for automatic catch-up and identify later dates for owner review; deliberate pauses do not backfill.
- [x] Tests cover these behaviors through public inputs and outputs rather than implementation details.

## Checks

- `npx vitest run utils/recurring-schedule.test.ts`
- `npx eslint utils/recurring-schedule.ts utils/recurring-schedule.test.ts`

## Expected areas

`utils/recurring-schedule.ts`, `utils/recurring-schedule.test.ts`.

## Comments

- Review round 1: Monthly callers can omit `anchorDay` and drift from January 31 to February 28 to March 28. `classifyMissedDueDates` returns no dates while paused, but offers no resume date, so resuming with the old `nextDueDate` can backfill paused dates. Require a safe monthly anchor contract and expose a resume calculation that skips paused dates, including a due-today boundary around 9:00 a.m. Add observable tests for both cases and rerun ticket checks.
- Review round 2: `classifyMissedDueDates` and `getNextDueDateAfterResume` still accept monthly input without `anchorDay` and infer it from `nextDueDate`. If January 31 has advanced to February 28, that produces March 28. Require the original anchor for these continuation APIs and test a clamped February `nextDueDate` advancing to March 31.

## Implementation evidence

- Requested model: `gpt-5.6-luna`; worker: `/root/calendar_policy`; review rounds: 2.
- Changed areas: `utils/recurring-schedule.ts` and `utils/recurring-schedule.test.ts`.
- Worker and primary independently ran `npx vitest run utils/recurring-schedule.test.ts` with 15 passing tests and `npx eslint utils/recurring-schedule.ts utils/recurring-schedule.test.ts` with no findings. Primary ran `git diff --check` successfully.
- Primary reviewed both new files, checked the worktree baseline, and confirmed the branch, HEAD, staged state, and unrelated files stayed unchanged. No performance measurement applies to this ticket.
- Ticket 02 is now runnable.
