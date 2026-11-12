# TesterArmy E2E Suite Coverage and Gap Matrix

This document tracks the TesterArmy (`@e2e-dev/mobile`) suite authored for
Codex task 7.

The runner now uses `e2e@0.23.0` and `@e2e-dev/mobile@0.12.6`. It fails the run
when a test skips after a soft assertion failure; clean precondition skips
remain skips. Interrupted tests are reported separately, and the CLI exits
with code 130 for an interrupted run. Both targets declare `app.bundleId` and
install their configured build in the test helper, keeping Android package
discovery explicit.

GitHub Actions must set `E2E_SUPABASE_DEV_HOST` to the development project
hostname independently of `E2E_SUPABASE_URL`. A missing or mismatched host
blocks fixture setup and cleanup.

The two platforms report different labels for the same control. iOS exposes a
React Native text twice, as the text host and its static-text child, so a text
query can match two nodes and takes the first one. Android renders native
dialog buttons in uppercase, so a dialog action matches a case-insensitive
pattern. The Profile screen labels its settings section "Settings" and only
iOS exposes the "Account" header, so route markers use the settings heading.

Upgrade verification on 2026-10-06 passed strict TypeScript checking, all 906
Vitest tests, and the focused malformed-email validation test on iPhone 18 Pro.
No Android device was connected for an upgrade smoke run. Keep only one iOS
simulator booted for tests using `app.clearState()`: the mobile engine's reset
operation can select ambiguously with multiple booted simulators even when
`E2E_IOS_DEVICE` pins the target.

Expo 58 verification on 2026-11-12 passed the whole suite on both platforms:
19 iOS Simulator tests on the iPhone 18 Pro and 21 Android Emulator tests on
the Pixel 9a, including the saved recurring rule. Both runs cover the account
routes, the direct and group expense lifecycles, group splits and payer
selection, the group lifecycle, recurring review and navigation, group
stats, and the group, friend, and settlement reversal flows. The iOS state-reset
case stays excluded from simulator runs because the mobile engine's reset can
pick the wrong booted simulator. A disposable development-only friend profile
supports the balance tests.

## Test suite and scenario matrix

| Test scenario | Key assertions | Result |
| --- | --- | --- |
| `account-and-static-routes.e2e.ts` — restored/OTP session reaches Friends | `friends-screen` visible, positive verification of signed-in landing | **Passed** (iOS Simulator, Android Emulator) |
| same — Profile opens account editing | `Edit Profile` heading | **Passed** (iOS Simulator, Android Emulator) |
| same — Profile opens Invitations | `Pending Invitations` heading | **Passed** (iOS Simulator, Android Emulator) |
| same — Profile opens Add people | `Share Invite Link` button | **Passed** (iOS Simulator, Android Emulator) |
| same — Profile opens privacy policy | Privacy Policy heading | **Passed** (iOS Simulator, Android Emulator) |
| same — Profile opens terms and conditions | Agreement to Terms heading | **Passed** (iOS Simulator, Android Emulator) |
| same — Profile opens Help and Support | FAQ heading | **Passed** (iOS Simulator, Android Emulator) |
| same — sign-in keeps Continue disabled for a malformed email | Valid email enables Continue; appended invalid character disables it | **Passed** (Android Emulator; excluded from the iOS simulator run) |
| `group-management.e2e.ts` — group create, rename, delete | Run-scoped group appears, rename appears, deletion yields Restore action | **Passed** on iOS and Android with Expo 58 on 2026-11-12; the test waits for the create and edit transitions before interacting with the list |
| `group-expense-lifecycle.e2e.ts` — seeded group member adds/edits expense | Expense appears, edited `$24.50` appears, delete hides row | **Passed** (iOS Simulator, Android Emulator) |
| same — group list opens seeded stats | Stats route, Total spent, seeded `$12.00` | **Passed** (iOS Simulator and Android Emulator with disposable development friend) |
| `group-expense-splits.e2e.ts` — exact participant split | Submits `$20.00` Unequal split of `$14.50` and `$5.50`, expense row appears | **Passed** (iOS Simulator, Android Emulator) |
| same — payer selection | Friend selected as payer; detail says Paid by friend | **Passed** (iOS Simulator, Android Emulator) |
| `direct-expense.e2e.ts` — friend expense appears on friend and Activity screens | Create, edit to `$20.00`, soft-delete, Deleted state on friend and Activity | **Passed** (iOS Simulator and Android Emulator, verified run-scoped purge of direct expense, splits, activities) |
| `settlements.e2e.ts` — full group payment | Seeded `$12.00` selection, commit success and group return | **Passed** (iOS Simulator, Android Emulator) |
| same — friend settlement | Seeded `$12.00`, confirmation, commit success | **Passed** (iOS Simulator, Android Emulator) |
| same — settlement reversal | Delete a committed settlement, restore the `$12.00` balance, retain deleted history | **Passed** (iOS Simulator, Android Emulator) |
| `recurring-expenses.e2e.ts` — weekly rule review/cancel | Review sheet and cancel-before-save | **Passed** (iOS Simulator, Android Emulator) |
| same — Activity opens recurring management route | Recurring header and add button | **Passed** (iOS Simulator, Android Emulator) |
| same — save and pause a weekly rule | Rule appears in management, then exposes Resume after pausing | **Passed** (iOS Simulator, Android Emulator) |
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
| `/friends` | **Verified** (iOS Simulator, Android Emulator): direct friend expense route navigated and verified |
| `/friends/[id]` | **Verified** (iOS Simulator, Android Emulator): direct friend expense recorded, edited to $20, deleted; settlement source assertion |
| `/add-friend` | **Verified** (iOS Simulator, Android Emulator): Profile opens Add people; invite delivery not asserted |
| `/invitations` | **Verified** (iOS Simulator, Android Emulator): route heading; accept/decline/resend mutations uncovered |
| `/invite/[id]` | Uncovered: invitation acceptance requires controlled invitation/second identity |
| `/groups` | **Verified** (iOS Simulator, Android Emulator): create/rename/delete; deep link landing |
| `/groups/[id]` | **Verified** (iOS Simulator, Android Emulator): group details, settlement commit, and deletion action |
| `/groups/stats/[id]` | **Verified** (iOS Simulator, Android Emulator): seeded total assertion |
| `/create-group` | **Verified** (iOS Simulator, Android Emulator): exercised inside group lifecycle case |
| `/edit-group/[id]` | **Verified** (iOS Simulator, Android Emulator): exercised inside group lifecycle case |
| `/add-expense` | **Verified** (iOS Simulator, Android Emulator): weekly recurring expense review, cancel sheet, unequal splits, and payer selection |
| `/edit-expense/[id]` | **Verified** (iOS Simulator, Android Emulator): group expense edit amount to `$24.50` |
| `/expense-detail/[id]` | **Verified** (iOS Simulator, Android Emulator): detail view, edit button, delete confirmation, and payer label |
| `/friend-settle/[id]` | **Verified** (iOS Simulator, Android Emulator): friend settlement commit |
| `/groups/settle/[id]` | **Verified** (iOS Simulator, Android Emulator): group settlement commit |
| `/activity` | **Verified** (iOS Simulator, Android Emulator): recurring route and direct expense search |
| `/profile` | **Verified** (iOS Simulator, Android Emulator): static route navigation |
| `/edit-profile` | **Verified** (iOS Simulator, Android Emulator): heading assertion |
| `/help-support` | **Verified** (iOS Simulator, Android Emulator): FAQ heading |
| `/privacy-policy` | **Verified** (iOS Simulator, Android Emulator): policy heading |
| `/terms-conditions` | **Verified** (iOS Simulator, Android Emulator): terms heading |
| `/recurring-expenses` | **Verified** (iOS Simulator, Android Emulator): header/add button; a saved rule appears in the management list |
| `/recurring-expenses/[id]` | **Verified** (iOS Simulator, Android Emulator): saved rule detail opens and the rule pauses |
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

The saved recurring-rule test is skipped unless `E2E_RECURRING_PERSISTENCE=1`.
The development project carries the recurring migrations and the updated
development-only `supabase/fixtures/e2e-run-scoped-fixtures.sql` purge function,
so the test runs there and the full workflow sets the flag. A new development
project needs both before the flag is safe: the recurring migrations, and the
cleanup function that removes a saved rule with its posted expense while
leaving another run's rule alone.
