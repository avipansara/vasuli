# 12 External recurring integration compile correction

Status: ready
Implementation: resolved
Blocked by: 06, 11
Worker: /root/external_compile
Requested model: gpt-6-luna
Claimed at: 2026-09-30T00:15:28.779423+00:00
Review rounds: 0

## Scope

Fix independently observed compile failures in user-provided occurrence UI and notification integration before native management verification. Preserve the supplied design and behavior.

## Acceptance criteria

- [x] Every recurring theme token referenced by occurrence UI exists in both palettes with readable foreground/background pairing.
- [x] Notification cache refresh uses actual query-key definitions and refreshes the existing recurring, expense, activity, friend, and group projections.
- [x] Nullable edit-form data is captured or guarded safely for navigation.
- [x] Whole-app and Supabase TypeScript checks pass; focused existing tests and lint checks pass.

## Checks

`npx tsc --noEmit`, `npm run typecheck:supabase`, focused notification-link/invalidation tests, focused ESLint, `git diff --check`.

## Expected areas

`constants/theme.ts`, `hooks/use-notifications.ts`, `app/edit-expense/[id].tsx`; existing semantic helpers as needed.

## Comments

Primary observed missing recurring noticeBorder/noticeText/cardBackground/cardBorder/iconBackground/iconColor/badgeActiveText/badgeActiveBackground tokens, nullable editFormQuery data inside navigation callback, and missing @/lib/query-keys module. @/services/query-keys exists but defines no .all members. The fix must use real contracts, not ambient type declarations or suppression.

## Implementation evidence

Primary reviewed all three changed files and verified baseline file hashes, branch, HEAD and staged changes were preserved. Requested worker model: gpt-6-luna; worker /root/external_compile; correction rounds: 0. Independently passed npx tsc --noEmit, npm run typecheck:supabase, focused ESLint, notification-link/invalidation tests (2 files / 7 tests), and git diff --check. Logs: /private/tmp/vasuli-recurring-ticket12-tsc.log. Ticket 08 is runnable.
