# Supabase Auth RLS Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move email OTP sign-in/sign-up to Supabase Auth sessions while preserving existing `public.users.id` references for expenses, friends, groups, and settlements. Then enforce strict JWT-backed RLS for app data.

**Architecture:** Add `public.users.auth_user_id` as a nullable link to `auth.users.id`. Email auth uses Supabase Auth OTP and profile-linking. Phone auth is not retained as a fallback. App Review/test accounts must be real Supabase Auth password users. RLS hardening replaces broad public policies with JWT-backed authenticated policies and removes app-table anon transition policies.

**Tech Stack:** Expo SDK 56, React Native, Supabase JS v2, Supabase Auth OTP, Postgres RLS.

---

## Status Snapshot

- **Current branch:** `codex/supabase-auth-rls-hardening`
- **Remote Supabase migration state:** `001` through `013` applied
- **Last verified locally:** `npm test` passed, `npm run typecheck:supabase` passed
- **Current RLS posture:** app-table anon policies removed; authenticated policies are JWT-backed through `users.auth_user_id`
- **Next release work:** configure Apple reviewer as a Supabase Auth password user, commit/push local migration and docs, build/submit TestFlight, validate core app flows

### Task 1: Add Auth Link Migration

**Files:**
- Create: `supabase/migrations/007_users_auth_user_id.sql`

- [x] Add nullable `auth_user_id uuid unique references auth.users(id) on delete set null` to `public.users`.
- [x] Add an index for lookup by `auth_user_id`.
- [x] Add authenticated self-profile policies alongside existing anon policies.

### Task 2: Add Profile Linking Service

**Files:**
- Create: `services/auth-profile-service.ts`
- Create: `services/auth-profile-service.test.ts`

- [x] Test that existing profile rows are linked by email without changing `public.users.id`.
- [x] Test that new profile rows are created when no email match exists.
- [x] Implement `linkAuthUserToProfile`.

### Task 3: Enable Supabase Auth Session Persistence

**Files:**
- Modify: `lib/supabase.ts`

- [x] Enable `autoRefreshToken` and `persistSession`.
- [x] Keep `detectSessionInUrl: false` for React Native.

### Task 4: Route Email OTP Through Supabase Auth

**Files:**
- Modify: `services/otp-service.ts`
- Modify: `services/otp-service.test.ts`

- [x] Email sign-in/sign-up sends Supabase Auth OTP after preserving existing public-user checks.
- [x] Email verification calls `supabase.auth.verifyOtp` and links/creates a profile.
- [x] Apple reviewer/test account path uses Supabase Auth password sign-in.
- [x] Remove phone login fallback from the migration path.

### Task 5: Deploy Supporting Supabase Changes

**Files:**
- Create: `supabase/migrations/008_lock_legacy_verification_codes.sql`
- Modify: `supabase/functions/send-otp/*`

- [x] Lock legacy `verification_codes` behind RLS because Supabase Auth OTP replaces custom email OTP storage.
- [x] Deploy updated `send-otp` Edge Function.
- [x] Repair/confirm Supabase migration history through `008`.

### Task 6: Build Auth-Bridge RLS Policies

**Files:**
- Create: `supabase/migrations/009_bridge_auth_rls_policies.sql`
- Modify: `supabase/docs/RLS_EXPENSES.md`
- Modify: `supabase/docs/RLS_INVITATIONS.md`

- [x] Add private helper functions that resolve `auth.uid()` to `public.users.id`.
- [x] Drop older broad public policies on exposed app tables.
- [x] Recreate explicit anon transition policies so existing/demo clients do not break yet.
- [x] Add strict `TO authenticated` policies for users, groups, group members, expenses, expense splits, settlements, friendships, invitations, and activities.
- [x] Update RLS docs to describe the `auth_user_id` bridge and remaining anon-policy gap.
- [x] Apply migration `009` to the linked Supabase project.

### Task 7: Fix Existing-Session Auth Bridge Gap

**Files:**
- Create: `supabase/migrations/010_backfill_users_auth_user_id.sql`
- Modify: `services/otp-service.ts`
- Modify: `services/otp-service.test.ts`
- Modify: `contexts/auth-context-otp.tsx`

- [x] Backfill `public.users.auth_user_id` from `auth.users.email` for existing users.
- [x] Apply migration `010` to the linked Supabase project.
- [x] Reconcile stale local OTP sessions with the persisted Supabase Auth session on app load.
- [x] Reject mismatched local/Supabase Auth sessions for strict expense writes.
- [x] Add tests for session reconciliation and strict expense auth checks.

### Task 8: Remove Anon Transition Policies

**Files:**
- Create: `supabase/migrations/011_remove_anon_transition_policies.sql`
- Create: `supabase/migrations/012_revoke_anon_app_table_grants.sql`
- Modify: `services/otp-service.ts`
- Modify: `services/otp-service.test.ts`
- Modify: `services/expense-service.ts`
- Modify: `services/expense-service.test.ts`

- [x] Remove all app-table anon policies from Supabase.
- [x] Verify no public app-table policies remain for role `anon`.
- [x] Revoke direct `anon` table grants from app tables.
- [x] Require Supabase Auth session before expense writes.
- [x] Make App Review/test account verification use Supabase Auth password sign-in.
- [ ] Configure `apple.reviewer@vasuli.app` in Supabase Auth with password `123456`.

### Task 9: Support Legacy Same-Email User Rows

**Files:**
- Create: `supabase/migrations/013_allow_email_matched_auth_bridge.sql`
- Modify: `supabase/docs/RLS_EXPENSES.md`
- Modify: `supabase/docs/RLS_INVITATIONS.md`

- [x] Add strict JWT-backed helper for acting as a public user row whose email matches the Supabase Auth JWT.
- [x] Update expense, group membership, friendship, and expense visibility helpers/policies to use the helper.
- [x] Apply migration `013` to the linked Supabase project.

### Task 10: Verify Locally

- [x] Run `npm test`.
- [x] Run `npm run typecheck:supabase`.
- [ ] Run `npm run lint` and report warnings separately.

### Task 11: Release to TestFlight

- [ ] Commit local migration/docs and include other release changes as requested.
- [ ] Push the release branch.
- [ ] Build iOS production with EAS.
- [ ] Submit the build to TestFlight/App Store Connect.
- [ ] Validate login for existing users and the Apple reviewer demo account.
- [ ] Validate expenses, groups, invitations, friend-group settle, activity feed, and receipt-scan flows in TestFlight.
