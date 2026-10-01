# 07 Add Expense recurring flow

Status: ready
Implementation: resolved
Blocked by: 06, 11
Worker: /root/create_flow
Requested model: gpt-6-luna
Claimed at: 2026-09-29T20:16:49Z
Review rounds: 3
Expected areas: app/add-expense.tsx, expense form components, theme tokens, focused tests

## Scope

Add recurring rule creation to step 2 of Add Expense while preserving the one-time flow. Use the existing theme and accessible native controls.

## Acceptance criteria

- [x] `Repeat` sits below Date with one-time default, weekly/monthly options, optional last due date, saved time zone, and clear automatic-posting copy.
- [x] Recurring save requires payer `You`, validates amount and splits, warns on likely duplicates, and shows a confirmation sheet with due date, participants, shares, and the warning that Vasuli cannot verify payment.
- [x] Success shows the first/next due state and a link to the recurring list. Due-today creation distinguishes waiting from posted status. One-time Add remains unchanged.
- [x] Loading, error, disabled, offline, keyboard, safe-area, light/dark, and accessibility states are handled on iOS and Android.

## Checks

- Focused form tests or device checks named in the implementation report.
- `npm run lint`

## Expected areas

`app/add-expense.tsx`, reusable expense form components and theme tokens only as needed.

## Comments

### Review round 1

Primary review requested guarded network errors and repeat submissions, server-confirmed due-today status, and focused form behavior evidence before acceptance. Native inspection will use the requested iPhone 18 Pro on iOS 27 with elevated simulator access.

### Review round 2

Independent focused checks passed (2 files, 13 tests). Source review requested a refreshed next due date after server confirmation and an iOS-supported keyboard dismissal in the device check. Native verification awaits ticket 11: the existing SDK 57 app fails at launch on iOS 27 because it has no scene lifecycle.

### Review round 3

Native build/launch now succeeds after resolved ticket 11. Primary prepared isolated local Supabase (106 migrations, synthetic owner/friend, run-scoped fixture helpers, test OTP function); local sign-in verified. Hosted test OTP rejected before the feature; local environment removes that dependency. Device test now reaches Add Expense but fillExpenseDescription’s default scroll starts beneath the iOS 27 keyboard toolbar and fails hit testing. Worker must use unobscured gesture origin or dismiss keyboard, preserve assertions, and verify light/dark device flows before reporting. Screenshot reviewed: initial Repeat sits below Date with legible light palette and one-time default.

### Blocked after review round 3

The worker corrected keyboard dismissal and passed syntax/diff checks. Three subsequent device attempts on the requested booted iPhone 18 Pro, iOS 27.0, stopped in DetoxXCUITestRunner before Jest assertions with `Unknown kAXError value -25218` from `AXUIElementCopyMultipleAttributeValues`. Terminating only Vasuli before the final retry did not clear the failure. Latest log: `/private/tmp/vasuli-recurring-ui-light-final.log`.

The recurring confirmation sheet and full light/dark flow remain unverified. Ticket 07 is blocked under the implement skill's three-correction-round limit; no further implementation worker may be dispatched until user direction. Existing source changes remain available on `codex/recurring-expenses`. Tickets 08–10 remain unfinished. Requested worker model: `gpt-6-luna`; worker: `/root/create_flow`; review rounds: 3.

### User-authorized simulator restart

User authorized restarting the same iPhone 18 Pro and requested a report if verification still failed. Shutdown, boot, and bootstatus succeeded. The light-mode retry launched Vasuli and started XCTest, then timed out after 60 seconds without completing the test. This retry did not report AX error -25218, but did not establish UI acceptance. Log: `/private/tmp/vasuli-recurring-ui-light-restart.log`. Simulator screenshot: `/private/tmp/vasuli-recurring-ui-after-restart.png`. Simulator remains booted for user inspection; ticket remains blocked.

### User-directed clipping correction

User supplied screenshots showing review clipping and saved waiting state, authorizing a focused correction by the existing GPT-6 Luna worker. Prior review history remains intact. New correction scope is scrollable review layout with safe-area actions; local scheduler setup is handled independently.

### Screenshot and date-selection follow-up evidence

- Existing GPT-6 Luna worker `/root/create_flow` fixed the user-reported clipping: one scrollable review body, pinned safe-area actions, wrapping participants, and explicit heading line heights.
- User confirmed selecting September 30 in the main Date control. Saved rule and screenshot nevertheless had first date September 29 and end date September 30. Installed datetimepicker 9.1.0 legacy `onChange` handles dismissal as well as selection and returns the controlled value on dismissal. Both form pickers now use selection-only `onValueChange`; `onDismiss` only closes them. This removes a plausible stale-value overwrite path; exact native reproduction remains unverified. Recurring start/end labels are now explicit.
- Primary ran three focused files, 29 tests, focused ESLint, and diff checks successfully. Worker ran full lint with zero errors and seven unrelated warnings. Branch, HEAD, and staging remain unchanged.
- Local recurring function and a temporary one-minute scheduler were started in the isolated UI fixture project. The existing saved rule produced exactly one $20 September 29 expense and one activity. It ended because the next weekly date, October 6, exceeds September 30. The previously posted test entry has not been removed or redated.
- Primary checked a September 30 start in a rolled-back local transaction: posting returned `not_due` and created zero expenses on September 29.
- Corrected iOS release build succeeded, was installed and launched on iPhone 18 Pro / iOS 27, UUID `910C5904-E8F1-48F8-814F-36A3816E2298`. Build log `/private/tmp/vasuli-recurring-ui-build-dates.log`.
- Ticket remains blocked for native manual confirmation of selected date persistence and complete light/dark review behavior. Previous three-round history remains intact; broader tickets 08–10 remain unfinished. The implementation lock is released while awaiting user device feedback.

### User diff comment: semantic button foreground

User flagged hardcoded review-action colors. Existing GPT-6 Luna worker will replace the matching button foreground values with the existing `settle.buttonText` theme token. Prior blocked native acceptance and review history remain unchanged.

Existing GPT-6 Luna worker `/root/create_flow` replaced the repeated button foreground mappings in `app/add-expense.tsx` with `settle.buttonText`, including the recurring review spinner and text. Primary independently verified focused ESLint and diff checks, matching light/dark palette values, and preservation of branch, HEAD, staging, and other files. This comment is addressed; ticket remains blocked on the previously recorded native acceptance checks. No new device build was required for this token substitution, whose palette values match the previous literals.

### User manual evidence after corrected build

User screenshots `SCR-20260929-pfpc.png` and `SCR-20260929-pfqi.png` show the complete light-mode review with accessible Save/Back controls, Start date September 30, no end date, correct $15 shares on a $30 total, and Scheduled success with September 30 next due date. The local database independently confirms Uber and Wifi have September 30 first/next due dates and zero posted expenses. This establishes the reported clipping and selected-date corrections in the user's manual flow. Clicking View recurring expenses shows an unmatched route because ticket 08 is not implemented; user-directed continuation claims that runnable ticket. Complete dark/Android and lifecycle verification remains outstanding.

### Independent acceptance after authorized follow-up

Primary completed native review checks on iPhone 18 Pro / iOS 27 in both themes and Pixel 9a Android in both themes. Full review copy, shares and Save/Back actions are visible. User screenshots already prove September 30 selection survives save and Scheduled state; isolated database proves no future occurrence affects balances. Source and focused form/service tests cover guards and ordinary submission. Native keyboard visibility remains limited by hardware keyboards; final ticket 10 owns integrated device script corrections and remaining keyboard checks.

Evidence: /private/tmp/vasuli-recurring-native-review/detox-light-equal-final.log, detox-dark-equal-final.log; /private/tmp/vasuli-recurring-android-review-light.png, recurring-android-review-dark.png, recurring-android-save-disabled.png; /private/tmp/vasuli-final-management-focused.log. Requested worker model gpt-6-luna; earlier correction history retained. Branch, HEAD and staged changes preserved.
