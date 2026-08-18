# AGENTS.md

## Project overview

Vasuli is a mobile-first Expo Router application targeting Expo SDK 57, React
Native 0.86, and React 19.2. It supports iOS and Android, with a web tab
layout for web development. Prioritize cross-platform behavior, accessibility,
performance, and the existing visual language.

The app uses Supabase for authentication, data, and Edge Functions. Routes live
under `app/`; reusable UI and feature components live under `components/`;
shared logic lives in `lib/`, `hooks/`, `services/`, and `utils/`; database
schemas, migrations, and Edge Functions live under `supabase/`.

## Before changing code

- Inspect nearby screens, components, services, and tests before introducing a
  new pattern.
- Use TypeScript for new code and keep strict type checking passing.
- Use Expo Router for navigation and follow the existing route conventions.
- Consult the official Expo or React Native documentation when changing Expo
  APIs, Router behavior, native modules, or EAS configuration. The project’s
  primary AI-readable references are:
  - <https://docs.expo.dev/llms.txt>
  - <https://docs.expo.dev/llms-full.txt>
  - <https://docs.expo.dev/llms-eas.txt>
  - <https://docs.expo.dev/llms-sdk.txt>
  - <https://reactnative.dev/docs/getting-started>

## Development commands

```bash
npx expo start
npx expo start --clear
npx expo start --dev-client
npx expo install <package>
npx expo install --check
npx expo install --fix
```

Use `npx expo install` for Expo and React Native packages so compatible
versions are selected. After changing the `expo` dependency, run:

```bash
npx expo install --fix
npx expo-doctor
```

## Quality checks

Run focused checks while developing and the full suite before handing off a
behavior change:

```bash
npm run lint
npm run typecheck:supabase
npm test
npm run precommit
```

`npm run precommit` runs linting, Supabase type checking, and Vitest. When
adding or changing behavior, add or update focused tests, especially for
helpers, services, and Supabase Edge Functions. Use stable `testID` props for
important interactive UI when screen or device automation needs them.

Keep production logs actionable: use `console.warn` for deprecations and
`console.error` for actual errors; remove temporary debugging output.

## UI and theming standards

- Preserve the existing Vasuli visual language: warm, social, calm, and
  legible rather than corporate or spreadsheet-like.
- Treat light and dark appearance as first-class states. Every new or changed
  screen must be checked in both modes, including loading, empty, error,
  disabled, selected, and modal states.
- Use `useThemeColors()` and the semantic palettes in `constants/theme.ts` for
  surfaces, text, borders, accents, status colors, and component states. When
  a new reusable surface needs a color, add a light/dark token to the relevant
  theme object instead of scattering a new hex value through route code.
- Prefer `ThemedText`, `ThemedInput`, `NavigationHeader`, shared cards, shared
  modals, and existing skeleton/error components before creating one-off UI.
  Raw `Text` and `TextInput` are acceptable when their foreground,
  placeholder, background, and border colors are explicitly theme-aware.
- Do not leave white or black backgrounds, text colors, borders, shadows, or
  placeholder colors that are visible in the opposite appearance. Accent
  colors must retain readable contrast on both light and dark surfaces.
- Keep interactive controls at comfortable mobile touch sizes (at least 44pt
  where practical), expose accessibility roles/labels/state, and provide
  useful loading, disabled, empty, offline, and error feedback.
- Keep business behavior separate from presentation. Put split, balance,
  settlement, and query logic in services or pure utilities; keep route files
  focused on composing the screen and handling navigation.
- For native UI changes, verify safe-area and keyboard behavior on iOS and
  Android, preserve platform gestures, and avoid web-only interaction patterns.
- When changing Expo or React Native native dependencies, use `npx expo
  install` and regenerate/rebuild the development client as needed. JavaScript
  package versions and native Pods/Gradle artifacts must be kept in sync.

Before handing off a UI change, run the relevant checks and manually inspect
the changed flow in light and dark mode. For visual changes, include the
affected route(s) and the states checked in the handoff.

## EAS and deployment

Build profiles are defined in `eas.json`:

- `development`: internal development client builds
- `development-simulator`: iOS simulator development build
- `preview`: internal preview builds
- `production`: store builds with auto-incrementing versions

Existing workflow shortcuts are available through:

```bash
npm run development-builds
npm run draft
npm run deploy
```

The workflows are in `.eas/workflows/`. The production workflow builds and
submits binaries when needed, or publishes platform updates when a compatible
build already exists. Manual `eas update` commands must include an explicit
`--environment` such as `preview` or `production`.

Use a development build when native modules or config plugins are not
available in Expo Go, or after native dependencies/configuration change.

When changing EAS workflows, consult the existing workflow files and the
official workflow documentation:

- <https://docs.expo.dev/eas/workflows/>
- <https://exp.host/--/api/v2/workflows/schema>

## Implementation conventions

- Prefer clear function components and hooks with correct effect dependencies.
- Keep business logic in reusable services or pure helpers rather than route
  components.
- Use the existing query, storage, theme, image, animation, and error-state
  utilities before adding alternatives.
- Add error boundaries and explicit loading, empty, offline, and error states
  where a user flow can encounter them.
- Do not add stale compatibility code or speculative fallbacks. If a fallback
  is required for a supported platform or migration, document why it exists.
- Avoid unrelated refactors and preserve user changes already present in the
  worktree.

## Git and release notes

- Do not commit, tag, push, or submit builds unless explicitly requested.
- Significant features, fixes, refactors, specification changes, deployment
  changes, and documentation changes should be recorded in `CHANGELOG.md`
  under the current date. Keep entries concise and describe user-visible or
  operational impact.
- Update the relevant version metadata when preparing a release, then follow
  the repository’s requested commit, tag, push, and submission process. Do not
  invent release steps or perform them without explicit instruction.
