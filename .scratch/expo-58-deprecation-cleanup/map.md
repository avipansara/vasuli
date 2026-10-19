# Expo 58 cleanup tickets

Status: implementation complete and reviewed
Branch: codex/upgrade-expo-58
Workers: three GPT-6 Luna subagents, high reasoning

| Ticket | Implementation | Review |
| --- | --- | --- |
| [01 Notification presentation](issues/01-notification-presentation.md) | resolved | Deprecated field removed; explicit presentation settings retained |
| [02 Modern CSV filesystem](issues/02-modern-csv-filesystem.md) | resolved | Awaited writes, correct share metadata, cleanup on success/failure, unavailable sharing |
| [03 Browser safe areas](issues/03-browser-safe-area.md) | resolved | Live CSS insets, dynamic offsets, inner scroll padding, native safe-area behavior retained |

## Integration evidence

Primary integration checks passed: application TypeScript; npm run precommit, including lint with zero errors and 12 existing warnings, Supabase TypeScript, and 112 files / 903 tests; Expo dependency alignment; Expo Doctor 20/20; iOS and Android JavaScript/Hermes bundle exports; git diff --check. No commits or pushes. Physical-device navigation, keyboard, share-sheet and browser safe-area detection remain unverified.

Browser probe: actual safe-area stylesheet and installed React Native Web View/ScrollView markup passed eight layout checks in light/dark with zero and simulated top44/bottom34/right20 insets. Simulated values prove CSS calculation and precedence, not physical-device env detection or full application flows. Dynamic helper markup also retained a caller-provided 24px minimum. Temporary browser tab and local probe server were closed. Temporary web-platform settings were restored; app.json has no diff.

Logs: /private/tmp/vasuli-sdk58-cleanup-precommit-final.log and /private/tmp/vasuli-sdk58-cleanup-export.log. Probe source remains in /private/tmp/vasuli-sdk58-safe-area-probe for reproduction.
