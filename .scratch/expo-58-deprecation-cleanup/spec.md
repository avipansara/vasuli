# Expo SDK 58 deprecation cleanup

Replace remaining deprecated APIs and address the web safe-area compatibility follow-up identified during the SDK 58 review. Work on codex/upgrade-expo-58 in this worktree. Existing upgrade edits and other checkouts must be preserved.

## Scope

1. Remove deprecated notification presentation option without changing banner, list, sound or badge behavior.
2. Replace legacy filesystem usage in native group CSV export, preserving sharing and cleanup.
3. Migrate browser safe-area spacing to CSS environment insets while preserving native inset handling and theme behavior.

Already migrated by the upgrade: TextInput instance refs, removed beforeRemove navigation event, stable native tabs import, and obsolete iOS scene-support option. Optional widgets, receipt scanning, App Intents and experimental tooling are outside this effort.

## Verification

Focused behavioral checks, application TypeScript, Expo dependency check and npm run precommit. Inspect browser light/dark safe-area behavior if a browser is available. Report device checks honestly. No commits, pushes, releases or external builds.
