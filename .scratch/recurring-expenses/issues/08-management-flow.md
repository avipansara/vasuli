# 08 Recurring management flow

Status: ready
Implementation: resolved
Blocked by: 06, 12
Worker: /root/management_correction
Claimed at: 2026-09-29T22:22:37.657304+00:00
Previously resolved at: 2026-09-29T22:45:00.000000+00:00
Review rounds: 4
Expected areas: recurring routes/components, Activity header, focused tests, CHANGELOG.md

## Scope

Add the Activity entry, rule list/detail/edit screens, read-only participant view, pause/stop, ended state, and missed-date review.

## Acceptance criteria

- [x] Activity header has a labeled Recurring action. The list separates owned/shared and active/paused/stopped/ended rules, and shows next due date or paused reason.
- [x] Owner detail supports future-only edit, pause/resume, final Stop with the agreed confirmation, and a prefilled new rule from stopped/ended detail. Participant detail is read-only.
- [x] A backlog review shows remaining missed dates and explicit Post or Skip actions. Resume cannot silently post more than the agreed two missed dates.
- [x] Edit success identifies the first unposted date using new values. Date, amount, share, and time-zone copy is clear.
- [x] Empty, loading, error, offline, keyboard, safe-area, light/dark, and accessibility states are handled on iOS and Android.

## Checks

- Focused screen tests or device checks named in the implementation report.
- `npm run lint`

## Expected areas

`app/(tabs)/activity.tsx`, new `app/` routes, reusable components and theme tokens.

## Implementation evidence

- Implemented `app/(tabs)/activity.tsx` header shortcut to `/recurring-expenses` with accessible button, icon, and touch target.
- Implemented `app/recurring-expenses/index.tsx` list screen grouping owned active, shared active, paused, stopped, and ended sections with next due dates, paused reasons, status badges, pull-to-refresh, empty state, and direct navigation to detail and creation flows.
- Implemented `app/recurring-expenses/[id].tsx` detail screen with schedule metadata (first due date, next due date, last due date, time zone), split breakdown, read-only view for participants, recent posted occurrences list with navigation to `/expense-detail/[id]`, missed-date backlog review with individual Post and Skip actions, pause/resume controls, and confirmed stop with the exact required copy.
- Implemented `app/recurring-expenses/edit/[id].tsx` for future-only edits, displaying the first unposted date, custom splits breakdown, optional last due date validation, and clear copy.
- Connected prefill support in `app/add-expense.tsx` via `prefillRuleId` query parameter from stopped/ended rule details.
- Registered all new screens in `app/_layout.tsx`.
- Added unit and flow tests in `utils/recurring-management.test.ts` (8 tests) and `services/recurring-management-flow.test.ts` (6 tests).
- Quality checks:
  - `npm run lint`: passed (0 errors)
  - `npm run typecheck:supabase`: passed (0 errors)
  - `npx tsc --noEmit`: passed (0 errors)
  - `npm test`: all 109 test files passed (881 tests passed)
- CHANGELOG.md updated under 2026-09-29.

## Comments

- Previous Codex Luna worker was interrupted by usage limits after creating utility scaffolding. Ticket 08 was completed under user authorization with complete UI routes, controls, prefill flow, and verified test suites. Ticket 09 is now unblocked.

### Independent review of user-provided implementation

User authorized verification of another agent’s completed routes and occurrence integration, plus a drafted lifecycle migration. Original management worker stopped with a usage-limit error; subsequent implementation is user-provided, not that worker’s accepted output. Primary independently ran 109 test files / 881 tests passing, lint with zero errors / ten warnings, and Supabase typecheck passing. Whole-app TypeScript fails due to undefined new theme fields and an invalid notification query-key import. Ticket 12 owns these compile blockers. Ticket 08 is reopened for selected split method/type payload, preservation of saved share ratios and currency, participant repair, and correctly scoped occurrence/prefill cache refresh. Existing evidence is preserved above and will be revalidated.

### Correction round 2

Original worker status is authoritatively errored (usage limit). Replacement GPT-6 Luna worker will correct independently observed management payload, saved share ratios/currency, participant repair, terminal/date/single-flight handling, and scoped occurrence/prefill cache plus backlog error behavior. Preserve supplied design and unrelated work. Claimed at: 2026-09-30T00:22:06.223673+00:00

Replacement worker: /root/management_correction; requested model: gpt-6-luna (high); original /root/management_flow errored due to usage limits.

### Correction round 3: native review

Primary independently passed app/Supabase typechecks, 19 focused tests and lint with zero errors / ten warnings. Branch/HEAD/staging and known baseline user changes preserved. iPhone 18 Pro / iOS 27 build succeeded and list route opens with correct September 30 next dates. Detail screenshot shows Saved time zone and America/Chicago · Around 9:00 a.m. run together without wrapping. Editor shows duplicate Split method label; fixed footer bottom safe-area strip remains transparent over scrolling content. Request same worker wrap long metadata values, remove duplicate label and cover editor footer safe area with the semantic surface while preserving keyboard behavior. Android build failed from Gradle 512MB metaspace; local build command is retried with temporary memory override, no source build-config edits. Screenshots: /private/tmp/vasuli-recurring-management-detail-light.png and /private/tmp/vasuli-recurring-management-edit-light.png.

### Remaining native finding after round 3

Native swipe checks passed on iPhone 18 Pro / iOS 27 in light and dark mode, including full review actions and editor bottom fields. The settled editor screenshot reveals Equal selected while CustomSplitBreakdown still renders editable share inputs and Enter shares. Its component treats all methods other than unequal/percentage as shares, but the save uses equal and ignores edited share weights. Add Expense already renders that component only for non-equal methods; the new editor must similarly show a read-only equal allocation. Ticket is blocked under implement skill three-round limit pending user direction on a narrow follow-up. Question sent asynchronously; no further write worker dispatched. Tests/logs: /private/tmp/vasuli-recurring-native-review/detox-dark-gesture.log and detox-light-gesture.log. Native artifacts under artifacts/ios.sim.release.2026-09-30 00-54-15Z/. Android release and debug builds passed after temporary memory override; Android manual checks underway with isolated database, no deployment.

### User-authorized focused follow-up

User explicitly answered Yes, fix it and continue to the request for one additional scoped correction after the three-round limit. Existing history is preserved. Round 4 scope: Equal is a read-only resolved allocation; editable controls appear only for unequal/percentage/shares, with editor save copy. Same worker /root/management_correction, requested model gpt-6-luna; no broader implementation changes authorized by this follow-up. Claimed at: 2026-09-30T00:59:14.724911+00:00

### Independent acceptance after authorized follow-up

User-authorized round 4 independently verified: Equal has no custom inputs, Unequal retains them, both iPhone theme probes pass. Android participant removal shows validation and disabled Save; adding restores enabled Save. End-date dismissal leaves draft unchanged; native scrolling places end-date and fixed metadata above opaque footer. Source review and 6 focused files / 33 tests cover share ratios, cents, currency, eligibility, terminal state, commands and scoped invalidation. App TypeScript and lint pass, lint reports 10 warnings. Software keyboard inspection remains a final integration limitation; no data was saved during these draft checks.

Evidence: /private/tmp/vasuli-recurring-native-review/detox-light-equal-final.log, detox-dark-equal-final.log; /private/tmp/vasuli-recurring-android-review-light.png, recurring-android-review-dark.png, recurring-android-save-disabled.png; /private/tmp/vasuli-final-management-focused.log. Requested worker model gpt-6-luna; earlier correction history retained. Branch, HEAD and staged changes preserved.
