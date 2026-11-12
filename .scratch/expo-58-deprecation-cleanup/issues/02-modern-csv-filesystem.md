# 02 Migrate native CSV exports to the current filesystem API

Status: ready-for-agent
Implementation: resolved
Worker: gpt-6-luna subagent (/root/csv_filesystem)
Claimed at: 2026-10-19T22:33:51Z
Review rounds: 1
Requested model: gpt-6-luna
Blocked by: none

## Ownership

services/group-expense-csv.ts and services/group-expense-csv.test.ts

## Acceptance criteria

Use File and Paths from expo-file-system. Await File.write, preserve share metadata, availability handling and cleanup after successful or failed sharing. Keep browser downloads unchanged. Verify the actual SDK 58 API before editing.

## Source

https://docs.expo.dev/versions/latest/sdk/filesystem/

## Validation

Run focused relevant tests and application TypeScript. Primary runs full suite and reviews the diff. Record evidence and limitations below. Preserve existing uncommitted work. No commits or pushes. Do not edit package manifests or changelog; primary owns those.

## Comments

- 2026-10-19 , Migrated native export to `File` and `Paths.cache`; `File.write()` is awaited and sharing keeps its MIME type, UTI, and dialog title. Temp cleanup remains in `finally` for success and rejection; checking `exists` keeps already-removed temp files harmless with the new synchronous `File.delete()` API. Expo SDK 58 docs confirm `write()` returns `Promise<void>`, `delete()` returns `void`, and `Paths.cache` is a `Directory`: <https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/>. Installed Android and iOS implementations throw when deleting a missing path, whereas the previous legacy call used `idempotent: true`; the existence guard preserves the missing-file no-op, while actual delete failures still propagate. A disappearance between the existence check and deletion can still reject.
- Evidence: `npm test -- --run services/group-expense-csv.test.ts` passed (5 tests); `npx tsc --noEmit` passed; `git diff --check` passed. Browser download code was left unchanged. Native-device share-sheet validation and the full suite remain with primary integration review.

- Primary integration checks passed: application TypeScript; npm run precommit, including lint with zero errors and 12 existing warnings, Supabase TypeScript, and 112 files / 903 tests; Expo dependency alignment; Expo Doctor 20/20; iOS and Android JavaScript/Hermes bundle exports; git diff --check. No commits or pushes. Physical-device navigation, keyboard, share-sheet and browser safe-area detection remain unverified.
