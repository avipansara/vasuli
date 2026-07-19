# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

To start the app, in your terminal run:

```bash
npm run start
```

### Supabase environment variables

The app needs your Supabase **project URL** and **anon (public) API key** at startup (see [`lib/supabase.ts`](./lib/supabase.ts)).

1. Open the [Supabase Dashboard](https://supabase.com/dashboard), select your project.
2. Go to **Project Settings** (gear) → **API**.
3. Under **Project URL**, copy the URL → set `EXPO_PUBLIC_SUPABASE_URL` in a `.env` file in the repo root.
4. Under **Project API keys**, copy the **`anon` `public`** key → set `EXPO_PUBLIC_SUPABASE_KEY`.

Do **not** use the `service_role` key in the app; it bypasses RLS and must stay server-side only.

**Invitations RLS:** Tight policies require a Supabase Auth JWT where `auth.uid()` matches `public.users.id`. The default OTP-only anon client cannot satisfy that — see [`supabase/docs/RLS_INVITATIONS.md`](./supabase/docs/RLS_INVITATIONS.md) before applying [`supabase/migrations/002_invitations_rls_policies.sql`](./supabase/migrations/002_invitations_rls_policies.sql).

**Expenses RLS:** [`supabase/migrations/004_expenses_rls_policies.sql`](./supabase/migrations/004_expenses_rls_policies.sql) adds payer/group-member rules for **`authenticated`** and permissive **`anon`** policies for the OTP-only client. See [`supabase/docs/RLS_EXPENSES.md`](./supabase/docs/RLS_EXPENSES.md).

**Edge Function `send-invitation` (401):** The gateway defaults to requiring a JWT; this app invokes with the anon key only. [`supabase/config.toml`](./supabase/config.toml) sets `verify_jwt = false` for that function. After changing config, redeploy: `npm run supabase:deploy:send-invitation` (uses `--no-verify-jwt`). You can also toggle **Enforce JWT** off for that function in the Dashboard under Edge Functions → send-invitation → Details / Settings.

```bash
cp .env.example .env
# Edit .env, then restart the dev server (Expo reads EXPO_PUBLIC_* on startup).
```

This app targets **Expo SDK 57**, which matches the **App Store** [Expo Go](https://expo.dev/go) client for day-to-day development on a physical device.

For **custom native code** or modules Expo Go does not include, use a **development build** and the dev-client bundler:

```bash
npx expo start --dev-client
```

Then open the **Vasuli** app installed from your last **EAS development** build. If you see *“Unable to open … exp+vasuli … build and install a compatible Development Build”*, install a **new** iOS development build that matches the current SDK:

```bash
eas build --profile development --platform ios
```

A terminal line like `[redirect middleware]: Unable to determine redirect location for runtime 'custom' and platform 'ios'` usually means the CLI could not open a matching dev client — fixing the install fixes the flow.

#### Development build troubleshooting

If `npx expo start --dev-client` reports `No development build (...) for this project is installed`, install a development build first. The dev-client server connects to an existing native app; it does not create that native app by itself.

For iOS simulator builds, `xcodebuild` error code `70` with `Unable to find a destination matching the provided destination specifier` usually means Expo/Xcode is holding a stale simulator UDID. Pick a currently available simulator or build against the generic simulator destination:

```bash
xcrun simctl list devices available
npx expo run:ios --device generic --no-bundler
```

If a native compile fails in `expo-sqlite` with missing `exsqlite3_*` symbols, refresh pods and do a clean native rebuild:

```bash
cd ios
pod install
cd ..
npx expo run:ios --device generic --no-bundler --no-build-cache
```

Also keep the bundle identifier aligned between [`app.json`](./app.json) and the native iOS project. A mismatch can make Expo look for a different installed dev client than the one Xcode built.

In the dev server output, you'll find options to open the app in:

- [a development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [an Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [an iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go)

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

### Invitation emails (Resend)

If the app creates an invite and the `send-invitation` Edge Function returns **200**, the handler successfully called Resend. Delivery still depends on: **`RESEND_API_KEY`** set for the function (Dashboard → Edge Functions → Secrets), **sender domain** verified in [Resend](https://resend.com/docs) (e.g. `support@split-space.com`), and the recipient inbox (spam / promotions). Check Resend’s **Logs** if the message does not arrive.

### Tests

[Vitest](https://vitest.dev/) runs in Node and covers:

- **Edge Functions** — `supabase/functions/**/*.test.ts` (e.g. `send-invitation` payload parsing)
- **App helpers** — `lib/**/*.test.ts`, `utils/**/*.test.ts` (validation, invite deep links)
- **Services** — `services/**/*.test.ts` (mocked Supabase client for invitations, friendships, users)

```bash
npm test
npm run test:watch
```

**Optional later:** component tests with [Expo unit testing](https://docs.expo.dev/develop/unit-testing/) (jest-expo / React Native Testing Library) and E2E smoke (e.g. Maestro) for full user flows — not wired in this repo yet.

## Workflows

This project is configured to use [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/) to automate some development and release processes. These commands are set up in [`package.json`](./package.json) and can be run using NPM scripts in your terminal.

The default Git branch for this project is **`master`**. Production workflows are triggered by pushes to `master`.

### Previews

Run `npm run draft` to [publish a preview update](https://docs.expo.dev/eas/workflows/examples/publish-preview-update/) of your project. Preview updates are published to the current Git branch; preview builds use the `master` channel, so updates intended for the shared preview build should be published from `master`.

EAS Update publishes JavaScript, styling, and asset changes without requiring a new native build. A preview or production build downloads an applicable update when it starts and applies it after restarting the app. The update channel and runtime version must match the installed build.

### Development Builds

Run `npm run development-builds` to [create a development build](https://docs.expo.dev/eas/workflows/examples/create-development-builds/). Note - you'll need to follow the [Prerequisites](https://docs.expo.dev/eas/workflows/examples/create-development-builds/#prerequisites) to ensure you have the correct emulator setup on your machine.

### Production Builds

Build Android and iOS production binaries together:

```bash
npx eas-cli@latest build --platform all --profile production
```

To build one platform only:

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

Production builds use the `production` update channel. EAS Build may increment Android and iOS build numbers using the remote version source. Building does not submit the binaries to Google Play or the App Store; use EAS Submit or the production workflow for store submission.

The Android build requires the local [`google-services.json`](./google-services.json) referenced by [`app.json`](./app.json). Keep this file out of Git because it contains project-specific configuration, but make sure it is available locally when starting an Android build.

Clearing Metro is only needed for a stale local development server. `npx expo start --clear` is not required before every EAS build.

### Production Deployments

Run `npm run deploy` to [deploy to production](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/). This workflow runs on pushes to `master`, builds or reuses matching production binaries, and publishes production updates. Follow the [Prerequisites](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/#prerequisites) to submit to the Apple and Google stores.

## Hosting

Expo offers hosting for websites and API functions via EAS Hosting. See the [Getting Started](https://docs.expo.dev/eas/hosting/get-started/) guide to learn more.


## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
