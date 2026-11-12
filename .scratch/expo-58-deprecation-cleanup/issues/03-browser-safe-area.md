# 03 Restore browser safe-area spacing under Expo Router 58

Status: ready-for-agent
Implementation: resolved
Worker: GPT-6 Luna subagent (/root/web_safe_area)
Claimed at: 2026-10-19 22:29 UTC
Review rounds: 2
Requested model: gpt-6-luna
Blocked by: none

## Ownership

shared safe-area utility or hook, its consumers, app/+html.tsx if needed, and focused tests

## Acceptance criteria

Audit all safe-area hook/View usage. Browser spacing must use CSS env(safe-area-inset-*), including computed minimums and offsets. Native must retain numeric insets and existing keyboard/layout behavior. Avoid enabling web deployment or unrelated redesign. Verify light/dark and zero/nonzero browser insets where feasible.

## Source

https://docs.expo.dev/router/migrate/sdk-57-to-58/

## Validation

Run focused relevant tests and application TypeScript. Primary runs full suite and reviews the diff. Record evidence and limitations below. Preserve existing uncommitted work. No commits or pushes. Do not edit package manifests or changelog; primary owns those.

## Comments

- Replaced browser safe-area measurements with CSS `env(safe-area-inset-*)` rules in `app/+html.tsx`, while native routes keep the same numeric inset calculations through the platform-resolved safe-area hook.
- Audited all consumers: floating expense buttons, group settlement actions, group stats scroll content, route error fallback, friend settlement actions, and the recurring-expense review sheet. The review sheet selects a regular `View` on web and retains the original bottom-edge `SafeAreaView` on native.
- Added `viewport-fit=cover` for iOS browser safe-area environment values. Rules use high-specificity data attributes; the stats selector targets RN Web's inner scroll content. A focused `!important` handles its inline content padding and the review sheet's native component styling.
- `npx tsc --noEmit` passes. `git diff --check` passes. A lightweight CSS-string test was removed after test-audit review because it mirrored the implementation; primary's real RN Web browser probe passed eight layout checks in light/dark mode at zero and simulated top 44/bottom 34/right 20 insets. The simulated env values validate spacing and CSS precedence, not physical-device browser detection or full routes.
- A temporary `app.json` web platform change was used to start a local preview, then immediately restored; `app.json` has no diff. Web deployment remains disabled.

- Primary integration checks passed: application TypeScript; npm run precommit, including lint with zero errors and 12 existing warnings, Supabase TypeScript, and 112 files / 903 tests; Expo dependency alignment; Expo Doctor 20/20; iOS and Android JavaScript/Hermes bundle exports; git diff --check. No commits or pushes. Physical-device navigation, keyboard, share-sheet and browser safe-area detection remain unverified.
