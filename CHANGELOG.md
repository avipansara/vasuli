## 2026-08-16

- Fixed push notification taps so they navigate to the related expense, group,
  friend, or invitations screen, including when the app was closed. Notification
  payloads now include the destination IDs needed for navigation.
- Polished the Activity screen hierarchy by removing the redundant Recent label
  and tightening the spacing between search and the activity feed.
- Reduced the redundant top spacing on the Profile screen while preserving its
  native safe-area inset.
- Made Group Details quick actions responsive on narrow phones so “Add Expense”
  and other labels stay within their buttons.
- Added a trip snapshot to Group Stats and moved CSV export into the top action
  bar as a quieter utility action.
- Made the Top contributors section expandable so groups can inspect every payer
  without making the default view taller.
- Refined the Group Stats trip snapshot so total spending leads, with per-person
  and expense count metrics grouped into a quieter footer.
- Added store-only in-app update prompts with Supabase-backed release notes,
  optional and mandatory update states, platform-specific store links, and
  safe version checking.
- Fixed a recursive expenses RLS path that caused friend detail requests to
  fail with a Supabase 500 for split participants.
- Added the Friends home read-model adapter and a secured Supabase RPC
  migration that returns display-ready summaries without downloading the full
  expense and split history to the device.
- Corrected an RPC balance-column ambiguity discovered during linked-database
  verification.
- Restricted the Friends home RPC to authenticated callers explicitly.
- Added the Groups home read model RPC, replacing the startup balance query
  waterfall with a single authenticated projection.
- Expanded Groups home realtime invalidation to refresh balances when group,
  membership, expense, split, or settlement data changes.
- Prefetched the initial Friends home data while the existing splash screen is
  visible, reusing the shared React Query cache after the splash and
  deduplicating concurrent startup requests.
- Centralized optimistic query-cache capture, restore, and invalidation for expense workflows, and made group-detail data fetching injectable for independent substitution.
- Restored the group-not-found error state, centralized React Query cache adapter wiring, and moved expense-deletion balance projection into the group read-model service.
- Deepened group detail into an indexed read model with nested, relationship-resolved expense splits and centralized optimistic expense/settlement transitions.
- Deepened expense intake into a tested workflow module that centralizes
  optimistic updates, rollback, persistence, and best-effort follow-up effects
  for both group and friend expenses.

## 2026-08-15

- Added an implementation-ready specification for exporting group expenses as
  CSV from Group Stats across iOS, Android, and web.
- Bumped the iOS/Android marketing version to `1.0.17` for the next store
  release train.
- Fixed Unequal and Shares expense splits to use consistent validation during
  entry and save, including rejecting negative or empty share allocations.
- Fixed newly created expenses paid by another friend being rejected by the
  creator's immediate read policy.
- Prevented Friend and Group settlements from recording amounts above the
  outstanding balance.

## 2026-08-10

- Group expense rows now open their expense details when tapped.
- Added search across activity descriptions, groups, and people.

## 2026-08-08

- Added the ability to record an expense paid by another group or friend participant while preserving the creator for authorization and audit history.
- Allow both the expense creator and listed payer to edit or delete an expense.
- Removed the duplicate group expense modal in favor of the shared full-screen expense flow.

## 2026-08-07

- Fixed received friend requests showing an anonymous requester. Requester
  profiles are now resolved in the friendship service, with an explicit error
  when a referenced requester profile cannot be loaded. Removed the unused legacy
  invitations section and added coverage for requester-name resolution.

## 2026-08-15

- Fixed pending friend requests remaining visible after the users became
  friends, and added a profile-email fallback when a requester name is blank.
- Prevented new friend requests from being created for existing friendships.

## 2026-07-23

- Fixed splash screen animation playing twice on launch. `useProtectedRoute` now
  delays navigation redirects until the animated splash completes, preventing
  the root layout from remounting mid-animation. Added animation cleanup to
  `AnimatedSplash` so looping effects stop on unmount.

## 2026-07-22

- Documented Vasuli’s product direction: a playful shared tab focused first on
  fast trip and outing expense capture, clear balances, and respectful
  settlement.
