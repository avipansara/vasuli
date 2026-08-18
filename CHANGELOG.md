## 2026-08-17

- Routed combined Friend settlement through a dedicated commit service and
  allocation receipt, preserving direct and shared Group settlement scopes.
- Added an implementation-ready specification for deepening the combined
  settlement module with transactional writes, idempotent retries, and scoped
  allocation receipts.

- Switched expense deletion to soft deletion, preserving split history and
  permanent deletion activity while excluding deleted expenses from active
  lists, balances, summaries, and edit/delete flows.
- Corrected friend balances for expenses paid by a friend whose own split is zero, while still excluding zero-share nonparticipants.
- Included payer-led expenses when the payer has no split row, as can happen with share-based group expenses.
- Prevented unrelated zero-share group expenses from appearing in friend activity.
- Added a defensive friend-detail filter so only pair-relevant group expenses
  can appear even when an older or cached read-model response includes them.
- Added a specification for separating direct Friend balances from
  Group-scoped balances and settlement flows.
- Separated direct Friend balances from Group balances, showing shared Group
  summaries without mixing Group expenses into direct Friend activity or
  settlement calculations.
- Aligned shared Group summaries with the Group settle-up calculation so they
  show the selected Friend's actual Group settlement balance.
- Documented combined Friend settlement allocation across direct and shared
  Group scopes.
- Added combined Friend settlement allocation with direct-first ordering,
  Group-scoped settlement records, and currency safeguards.
- Added read-only shared Group expenses to Friend activity with group, payer,
  and share context while keeping them out of direct balances and expenses.
- Clarified shared Group activity cards with a neutral “No balance impact”
  label instead of displaying a misleading individual share amount.
- Showed Group-scoped “owes” context when either Friend paid for the other,
  while retaining “No balance impact” for third-party-paid expenses.
- Updated home Friend-card totals to include each Friend's net balances across
  shared Groups in addition to the direct Friend ledger.
- Changed the home Friend-card empty activity label to “Group activity” when
  the balance has no direct pending expense to display.
- Included pair-relevant Group expenses in the home Friend-card activity list,
  without adding them to Friend balance calculations.
- Fixed home Friend totals by excluding Group settlements from the direct
  ledger and requiring both Friends to belong to a shared Group.
- Fixed expense deletion activity metadata by preserving its jsonb type.
- Made deleted expense activity cards open the retained read-only expense
  history.
- Added direct-versus-group source indicators to expenses and update events in friend detail.
- Restored All, Expenses, and Updates tabs on individual friend detail screens,
  including filtered activity counts and empty states.
- Matched settlement member selection to the add-expense row pattern by removing floating card treatment from unselected rows and using a full-row selected state.
- Matched settlement avatars to add-expense selection behavior, using an accent avatar only for the selected member and a neutral avatar otherwise.
- Kept the settlement group and amount context visible while allowing long member lists to scroll independently.
- Refined the group settlement screen with a calmer member-card hierarchy,
  clearer selection treatment, shared theme tokens, and friendlier guidance copy.
- Documented the current product and visual system in `PRODUCT.md`,
  `DESIGN.md`, and `.impeccable/design.json` for future contributors and
  design-aware agents.
- Documented the shared contribution standards for theming, accessibility,
  native UI behavior, dependency synchronization, and UI validation in
  `AGENTS.md`.
- Fixed dark-mode surfaces across expense setup, group settlement, and group creation, including themed member avatars and the group info panel.
- Added a pair-scoped Friend detail read model backed by a session-derived
  Supabase RPC, reducing broad client-side history assembly and exposing
  development-only load timing metrics.
- Simplified Friend detail tab switching by removing stacked feed and row
  animations that caused visible choppiness while filtering activity rows.

## 2026-08-16

- Smoothed Friends detail activity filters by keeping activity rows stable
  between tabs and using one lightweight feed transition instead of replaying
  staggered row animations on every switch.
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
