# AGENTS.md

## Project Overview

This is an Expo/React Native mobile application (**Expo SDK 57**, React Native 0.86, React 19.2.3). Prioritize mobile-first patterns, performance, and cross-platform compatibility.

After changing the `expo` version, run `npx expo install --fix` and `npx expo-doctor`. Manual `eas update` requires `--environment` (e.g. `production`, `preview`); EAS Workflow update jobs in this repo set `environment` explicitly.

## Documentation Resources

When working on this project, **always consult the official Expo documentation** available at:

- **https://docs.expo.dev/llms.txt** - Index of all available documentation files
- **https://docs.expo.dev/llms-full.txt** - Complete Expo documentation including Expo Router, Expo Modules API, development process
- **https://docs.expo.dev/llms-eas.txt** - Complete EAS (Expo Application Services) documentation
- **https://docs.expo.dev/llms-sdk.txt** - Complete Expo SDK documentation
- **https://reactnative.dev/docs/getting-started** - Complete React Native documentation

These documentation files are specifically formatted for AI agents and should be your **primary reference** for:

- Expo APIs and best practices
- Expo Router navigation patterns
- EAS Build, Submit, and Update workflows
- Expo SDK modules and their usage
- Development and deployment processes

## Project Structure

```
/
├── app/                   # Expo Router file-based routing
│   ├── (tabs)/            # Tab-based navigation screens
│   │   ├── index.tsx      # Friends screen
│   │   ├── groups.tsx     # Groups screen
│   │   ├── activity.tsx   # Global activity/history feed
│   │   ├── profile.tsx    # Profile and settings screen
│   │   ├── _layout.tsx    # Native tabs layout
│   │   └── _layout.web.tsx # Web tabs layout
│   ├── _layout.tsx        # Root layout with theme provider
│   └── modal.tsx          # Modal screen example
├── components/            # Reusable React components
│   ├── ui/                # UI primitives (IconSymbol, Collapsible)
│   └── ...                # Feature components (themed, haptic, parallax)
├── constants/             # App-wide constants (theme, colors)
├── contexts/              # Authentication and theme providers
├── hooks/                 # Custom React hooks (color scheme, theme)
├── lib/                   # Shared clients and app utilities
├── services/              # Supabase and domain services
├── utils/                 # Shared pure helpers
├── assets/                # Static assets (images, fonts)
├── .eas/workflows/        # EAS Workflows (CI/CD automation)
├── app.json               # Expo configuration
├── eas.json               # EAS Build/Submit configuration
└── package.json           # Dependencies and scripts
```

## Essential Commands

### Development

```bash
npx expo start                  # Start dev server
npx expo start --clear          # Clear cache and start dev server
npx expo install <package>      # Install packages with compatible versions
npx expo install --check        # Check which installed packages need to be updated
npx expo install --fix          # Automatically update any invalid package versions
npm run development-builds      # Create development builds (workflow)
```

### Building & Testing

```bash
npx expo-doctor      # Check project health and dependencies
npx expo lint        # Run ESLint
npm test             # Run unit tests (Vitest)
npm run test:watch   # Vitest in watch mode
npm run draft        # Publish preview update and website (workflow)
```

### Git hooks (Husky)

Pre-commit runs `npm run precommit` (ESLint via `expo lint` + `typecheck:supabase` + `npm test`). After `npm install`, the `prepare` script wires Husky. If hooks do not run, set `git config core.hooksPath .husky` and ensure `.husky/pre-commit` is executable.

```bash
npm run precommit    # Run the same checks locally without committing
```

### Production

```bash
npx eas-cli@latest build --platform all --profile production # Build Android and iOS production binaries
npx eas-cli@latest build --platform ios --profile production # Build iOS only
npx eas-cli@latest build --platform android --profile production # Build Android only
npm run deploy                                      # Deploy to production (workflow)
```

Building does not submit binaries to the stores. Use EAS Submit or the production workflow when store submission is required.

## Development Guidelines

### Code Style & Standards

- **TypeScript First**: Use TypeScript for all new code with strict type checking
- **Naming Conventions**: Use meaningful, descriptive names for variables, functions, and components
- **Self-Documenting Code**: Write clear, readable code that explains itself; only add comments for complex business logic or design decisions
- **React 19 Patterns**: Follow modern React patterns including:
  - Function components with hooks
  - Enable React Compiler
  - Proper dependency arrays in useEffect
  - Memoization when appropriate (useMemo, useCallback)
  - Error boundaries for better error handling

### Navigation & Routing

- Use **Expo Router** for all navigation
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`
- Docs: https://docs.expo.dev/router/introduction/

### Recommended Libraries

- **Navigation**: `expo-router` for navigation
- **Images**: `expo-image` for optimized image handling and caching
- **Animations**: `react-native-reanimated` for performant animations on native thread
- **Gestures**: `react-native-gesture-handler` for native gesture recognition
- **Storage**: Use `expo-sqlite` for persistent storage, `expo-sqlite/kv-store` for simple key-value storage

## Debugging & Development Tools

- Use the Expo development server and React Native DevTools available in the local development build for runtime, network, and component inspection.
- Use `console.warn` for actionable deprecation notices and `console.error` for actual errors. Remove temporary debugging logs before production.

### Testing & Quality Assurance

#### Unit tests (Vitest)

When you **change existing behavior** or **add a feature**, **add or update automated tests** that cover the new logic, and **run `npm test`** before finishing (alongside `npm run precommit` when appropriate). Co-locate tests as `*.test.ts` next to **Edge Functions** (`supabase/functions/`), **shared helpers** (`lib/`, `utils/`), and **services** (`services/`). Prefer pure helpers and mocked Supabase clients; add screen-level or E2E tests only when needed (see [`README.md`](./README.md)).

#### UI and device testing

- Add stable `testID` props to important interactive components when screen-level or device automation is needed.
- Prefer focused unit tests for business logic and add screen-level or E2E coverage only for important user flows.

## EAS Workflows CI/CD

This project is pre-configured with **EAS Workflows** for automating development and release processes. Workflows are defined in `.eas/workflows/` directory.

When working with EAS Workflows, **always refer to**:

- https://docs.expo.dev/eas/workflows/ for workflow examples
- The `.eas/workflows/` directory for existing workflow configurations
- You can check that a workflow YAML is valid using the workflows schema: https://exp.host/--/api/v2/workflows/schema

### Build Profiles (eas.json)

- **development**: Development builds with dev client
- **development-simulator**: Development builds for iOS simulator
- **preview**: Internal distribution preview builds
- **production**: Production builds with auto-increment

## Troubleshooting

### Expo Go Errors & Development Builds

If there are errors in **Expo Go** or the project is not running, create a **development build**. **Expo Go** is a sandbox environment with a limited set of native modules. To create development builds, run `npx eas-cli@latest build --profile development --platform all`. After installing native packages or adding config plugins, a new development build is often required.

## AI Agent Instructions

When working on this project, consult the relevant official Expo or React Native documentation before changing platform APIs, Expo Router behavior, EAS configuration, or SDK modules. Follow existing components and screens for local patterns. For feature work, add or update focused tests and run `npm test` before finishing.
