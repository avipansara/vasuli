# TesterArmy E2E Suite Coverage and Gap Matrix

This document tracks the TesterArmy (`@e2e-dev/mobile`) suite authored for
Codex task 7.

## Test suite and scenario matrix

| Test scenario | Key assertions | Result |
| --- | --- | --- |
| `account-and-static-routes.e2e.ts` — restored/OTP session reaches Friends | `friends-screen` visible, positive verification of signed-in landing | **Passed** (iOS Simulator) |
| same — Profile opens account editing | `Account Details` heading | **Passed** (iOS Simulator) |
| same — Profile opens Invitations | `Pending Invitations` heading | **Passed** (iOS Simulator) |
| same — Profile opens Add people | `Share Invite Link` button | **Passed** (iOS Simulator) |
| same — Profile opens privacy policy | Privacy Policy heading | **Passed** (iOS Simulator) |
| same — Profile opens terms and conditions | Financial Disclaimer heading | **Passed** (iOS Simulator) |
| same — Profile opens Help and Support | FAQ heading | **Passed** (iOS Simulator) |
| same — sign-in keeps Continue disabled for a malformed email | Valid email enables Continue; appended invalid character disables it | **Passed** (iOS Simulator) |
| `group-management.e2e.ts` — group create, rename, delete | Run-scoped group appears, rename appears, deletion yields Restore action | **Passed** (iOS Simulator) |
| `group-expense-lifecycle.e2e.ts` — seeded group member adds/edits expense | Expense appears, edited `$24.50` appears, delete hides row | **Passed** (iOS Simulator) |
| same — group list opens seeded stats | Stats route, Total spent, seeded `$12.00` | Gated: fixture requires clean friend without prior settlement records |
| `group-expense-splits.e2e.ts` — exact participant split | Submits `$20.00` Unequal split of `$14.50` and `$5.50`, expense row appears | **Passed** (iOS Simulator) |
| same — payer selection | Friend selected as payer; detail says Paid by friend | **Passed** (iOS Simulator) |
| `direct-expense.e2e.ts` — friend expense appears on friend and Activity screens | Create, edit to `$20.00`, soft-delete, Deleted state on friend and Activity | **Passed** (iOS Simulator, verified run-scoped purge of direct expense, splits, activities) |
| `settlements.e2e.ts` — full group payment | Seeded `$12.00` selection, commit success and group return | Gated: fixture requires clean friend without prior settlement records |
| same — friend settlement | Seeded `$12.00`, confirmation, commit success | Gated: fixture requires clean friend without prior settlement records |
| `recurring-expenses.e2e.ts` — weekly rule review/cancel | Review sheet and cancel-before-save | **Passed** (iOS Simulator) |
| same — Activity opens recurring management route | Recurring header and add button | **Passed** (iOS Simulator) |
| `native-groups-link.e2e.ts` — stable groups deep link | Android `vasuli://groups` opens Groups | **Passed** (Android Emulator Pixel 9a) |

## Route coverage accounting

Paths below are Expo Router route paths (group names omitted). “Source only” means
the route has a named assertion above, not that it passed. All other paths are
uncovered by this TesterArmy suite and need a manual or future automated check.

| Route | Coverage |
| --- | --- |
| `/sign-in-otp` | **Verified** (iOS Simulator, Android Emulator): malformed-email disabled state; conditional OTP helper path |
| `/sign-up-otp` | Uncovered: no safe disposable identity configured |
| `/auth/callback` | Uncovered: requires real auth callback/deep link |
| `/` (Friends tab) | **Verified** (iOS Simulator, Android Emulator): signed-in landing; direct friend expense verified |
| `/friends` | **Verified** (iOS Simulator): direct friend expense route navigated and verified |
| `/friends/[id]` | **Verified** (iOS Simulator): direct friend expense recorded, edited to $20, deleted; settlement source assertion |
| `/add-friend` | **Verified** (iOS Simulator): Profile opens Add people; invite delivery not asserted |
| `/invitations` | **Verified** (iOS Simulator): route heading; accept/decline/resend mutations uncovered |
| `/invite/[id]` | Uncovered: invitation acceptance requires controlled invitation/second identity |
| `/groups` | **Verified** (iOS Simulator, Android Emulator): create/rename/delete; deep link landing |
| `/groups/[id]` | **Verified** (iOS Simulator): group details and deletion action |
| `/groups/stats/[id]` | Source only: seeded total assertion; fixture currently blocked by clean-friend availability |
| `/create-group` | **Verified** (iOS Simulator): exercised inside group lifecycle case |
| `/edit-group/[id]` | **Verified** (iOS Simulator): exercised inside group lifecycle case |
| `/add-expense` | **Verified** (iOS Simulator): weekly recurring expense review, cancel sheet, unequal splits, and payer selection |
| `/edit-expense/[id]` | **Verified** (iOS Simulator): group expense edit amount to `$24.50` |
| `/expense-detail/[id]` | **Verified** (iOS Simulator): detail view, edit button, delete confirmation, and payer label |
| `/friend-settle/[id]` | Source only: friend settlement commit; unexecuted (clean friend gated) |
| `/groups/settle/[id]` | Source only: group settlement commit; unexecuted (clean friend gated) |
| `/activity` | **Verified** (iOS Simulator): recurring route and direct expense search |
| `/profile` | **Verified** (iOS Simulator): static route navigation |
| `/edit-profile` | **Verified** (iOS Simulator): heading assertion |
| `/help-support` | **Verified** (iOS Simulator): FAQ heading |
| `/privacy-policy` | **Verified** (iOS Simulator): policy heading |
| `/terms-conditions` | **Verified** (iOS Simulator): disclaimer heading |
| `/recurring-expenses` | **Verified** (iOS Simulator): header/add button; persisted schedules unmanaged |
| `/recurring-expenses/[id]` | Uncovered: detail, pause/resume/stop |
| `/recurring-expenses/edit/[id]` | Uncovered: persisted schedule edits |
| `/scan-qr` | Manual: camera permission, live scan and second-device QR input |
| `/settlement-detail/[id]` | Uncovered: operation detail/reversal |

Native notification delivery, invitation email/share sheets, successful QR
camera scan, permission-denied UI, offline/service errors, keyboard/safe-area
behavior on both platforms, and visual contrast in light/dark appearance remain
unverified. Set `E2E_APPEARANCE=light` or `dark` for a sequential appearance run;
this switches simulator appearance but does not establish visual QA. Mutating
group flows require the project wrapper's run ID and cleanup. Never direct
fixture RPCs at production.

Persistent recurring-rule tests require the updated development-only
`supabase/fixtures/e2e-run-scoped-fixtures.sql` purge function to be applied to
the approved development Supabase project first. No SQL editor/admin mechanism
is configured in this run, so the updated cleanup is source-only and those
mutations must remain gated.
