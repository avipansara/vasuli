## [Unreleased]

- Upgrade to Expo SDK 58, React Native 0.88, and React 19.3. Rebuild development clients and ship a new native binary before publishing updates; SDK 57 binaries cannot load this runtime.
- Preserve input focus and friend-detail return navigation, and keep browser controls clear of device safe areas.
- Remove routine production logs containing user and notification details.
- Correct setup, security, testing, and release guidance for contributors.

## 2026-11-12

- Notify the other person when a friend or group payment is recorded.
- Improve push notification diagnostics and remove invalid device tokens. Apply the receipt migration, deploy both push functions, and schedule the receipt worker to enable the checks.
- Prevent a spurious “Group not found” alert while deleting a group.
- Make the group and friend “Settle Up” buttons available to screen readers.
- Make settlement deletion easier to reveal with a swipe.

## [1.0.29] - 2026-11-07

### Highlights

- Sign in or create an account with Apple on iOS, including with Hide My Email. Apple relay addresses stay hidden in friend and group screens.
- Invite people who haven't joined Vasuli by sharing a link. Vasuli no longer sends referral emails to those addresses from the app.

### Upgrade notes

This release requires a new iOS binary and the Apple sign-in capability on the production provisioning profile. The Apple provider must be enabled in Supabase. See the [setup guide](docs/sign-in-with-apple.md). No database migration is needed for these changes.

[Full changelog](https://github.com/avipansara/vasuli/compare/v1.0.28...v1.0.29)

## [1.0.28] - 2026-10-01

### Highlights

- Add weekly and monthly recurring expenses, with schedule review, future edits, pause/resume, stop, and missed-date management (#44).
- Show stamped receipts after friend and group settlements, including remaining balances for partial payments and reduced-motion support (#45).
- Improve friend QR scanning with duplicate-scan protection, camera permission recovery, clearer QR borders, and direct navigation for existing friends (#46).
- Apply preferred-currency changes immediately across balances, expenses, and settlement flows.
- Preserve expense calendar dates across time zones and improve settlement cancellation amount handling.

### Upgrade notes

A new native binary is required for the Expo SDK 57 dependency updates and iOS 27 scene support.

Recurring expenses require applying the seven recurring-expense database migrations, deploying `process-recurring-expenses`, and configuring the trusted Cron/Vault scheduler separately in production. The tag workflow only promotes `supabase/pending_migrations`; it does not apply the recurring migrations already stored in `supabase/migrations` or deploy the scheduler. See [scheduler setup](https://github.com/avipansara/vasuli/blob/v1.0.28/docs/recurring-expense-scheduler.md).

The production workflow builds and auto-submits Android to the internal track and iOS to App Store Connect. It requires GitHub Actions secrets `EXPO_TOKEN`, `SUPABASE_ACCESS_TOKEN`, and `SUPABASE_PROD_PROJECT_ID`.

[Full changelog](https://github.com/avipansara/vasuli/compare/v1.0.27...v1.0.28)

## Earlier changes

- Added friend and group expense tracking, including expenses paid by another participant, flexible splits, and searchable activity.
- Added direct and group settlement flows with partial payments, settlement history, and reversals.
- Added shareable friend invite links and QR codes, plus friend requests and notifications.
- Added CSV export for group expenses and in-app prompts for store updates.
- Preserved expense and group history after deletion, and improved balance consistency across screens.
- Added privacy controls for product analytics and server-side analytics deletion when an account is removed.

Detailed development notes before this cleanup are available in [Git history](https://github.com/avipansara/vasuli/blob/fbd5788/CHANGELOG.md).
