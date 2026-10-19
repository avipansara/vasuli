# 01 Remove deprecated notification presentation option

Status: ready-for-agent
Implementation: resolved
Worker: GPT-6 Luna subagent (/root/notification_cleanup)
Claimed at: 2026-10-19 22:33 UTC
Review rounds: 1
Requested model: gpt-6-luna
Blocked by: none

## Ownership

services/notification-service.ts and directly related notification tests

## Acceptance criteria

Remove shouldShowAlert. Preserve explicit banner/list presentation, sound and badge settings. Inspect existing tests before adding any. This deprecation predates SDK 58.

## Source

https://docs.expo.dev/versions/latest/sdk/notifications/

## Validation

Run focused relevant tests and application TypeScript. Primary runs full suite and reviews the diff. Record evidence and limitations below. Preserve existing uncommitted work. No commits or pushes. Do not edit package manifests or changelog; primary owns those.

## Comments
- 2026-10-19: Claimed by GPT-6 Luna subagent. Expo Notifications SDK 58 documentation's foreground handler example uses `shouldShowBanner` and `shouldShowList` without `shouldShowAlert`; retain the explicit banner/list, sound, and badge values. No dedicated notification-service tests exist, so no test was added for this property removal.
- 2026-10-19: Removed only `shouldShowAlert` from `services/notification-service.ts`. Validation passed: `npx tsc --noEmit`; `npm test -- lib/notification-link.test.ts` (1 file, 4 tests). There is no dedicated notification-service test. Expo API reference: https://docs.expo.dev/versions/latest/sdk/notifications/ (SDK 58 foreground handler example).

- Primary review: diff removes only the redundant deprecated option; explicit banner/list, sound and badge values are unchanged.

- Read-only completeness audit by the same GPT-6 Luna worker found no additional app-used SDK 58 removed/deprecated APIs outside CSV and web scope. PlatformPressable remains supported; no InteractionManager, Touchable root export, NativeMethods, removed StatusBar props, File.md5, withLayoutContext, NativeArrayBuffer, AppMetrics, or libSQL options were found in app code.

- Primary integration checks passed: application TypeScript; npm run precommit, including lint with zero errors and 12 existing warnings, Supabase TypeScript, and 112 files / 903 tests; Expo dependency alignment; Expo Doctor 20/20; iOS and Android JavaScript/Hermes bundle exports; git diff --check. No commits or pushes. Physical-device navigation, keyboard, share-sheet and browser safe-area detection remain unverified.
