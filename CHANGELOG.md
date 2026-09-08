## 2026-09-08

- Fixed the invite deep link reporting success when the accept was skipped:
  `acceptInvitationFromLink` now returns an outcome
  (`accepted`/`already-accepted`/`declined`/`expired`/`invalid`) and only
  writes on a real accept; the invite screen blocks declined/expired/invalid
  links instead of connecting anyway.
- Fixed one unloadable profile blanking the whole Received/Sent tabs: pending
  and sent request lookups now skip (and log) unresolvable rows.
- Fixed accepting a stale invitation row: tab Accept re-reads the invitation
  via a new `getById` and bails when it is no longer pending or has expired.
- Fixed the Received tab stacking its empty illustration under request cards
  when no email invites exist.
- Fixed sent invitations missing name/email details: Add Friend now collects
  an optional name, stores it trimmed, and the Sent tab shows both name and
  email (never a blank row) via a tested display helper.
- Fixed outgoing friend requests being invisible to the sender: the Sent tab
  now lists pending requests sent to existing Vasuli users (with recipient
  name/email and Cancel), with realtime updates for rows you sent.
- Fixed stale "pending" invites lingering in Sent after the friendship formed
  through another path: `getByInviter` now suppresses pending rows whose
  invitee is already an accepted friend, mirroring the Received tab.
  Accepted/declined history still shows. (Rows addressed to a mistyped email
  can never link to an account; cancel those from Sent.)
- Moved Invitations-screen colors into `InvitationsTheme` light/dark tokens
  (`constants/theme.ts`, exposed via `useThemeColors`) instead of scattered
  hex values.

## 2026-09-07

- Fixed group member rows showing the combined pair net instead of the
  group-only balance (e.g. $93.99 instead of $49.49 when $44.50 of it is a
  direct-ledger debt). Member rows, bilateral lines, and Group Settle amounts
  now derive direction and amount from the group component of the pair
  totals; direct balances stay on the friend screens where they belong.

- Fixed deleting transfer-bearing settlements: the reversal stale-balance
  guard now ignores converted (backfilled) group legs, matching the
  friend/group readers that keep those legs activity-only. Previously any
  operation with converted legs failed deletion with `SETTLEMENT_STALE_BALANCE`
  against the displayed balance. Covered by a self-contained SQL regression
  and a migration contract test.

- Final pre-production cleanup verification: root `tsc --noEmit` is clean,
  `npm run precommit` passes (84 Vitest files, 680 tests, 0 lint errors), and
  `npx expo export` succeeds for both iOS and Android. The 4 remaining lint
  warnings (guarded data-load effects in Friend/Group Settle Up and Add
  Expense) were reviewed as benign with no render-loop risk. The npm audit
  reports 25 transitive findings (5 high, 0 critical), all in Expo/Metro/Detox
  build tooling with no production runtime exposure; no audit fix was applied
  because the proposed changes force incompatible Expo downgrades.
- Fixed the root type check after the Supabase type regeneration: the
  settlement-cancellations migration contract now pins the required
  `signed_group_balance_delta` column in the migration, the checked-in types,
  and the compile-time probe.
- Fixed `npx supabase test db` failing on `\ir ../fixtures/...` includes: the
  harness executes each test file in a container where only that file is
  visible, so `supabase/tests/e2e-run-scoped-fixtures.sql` now inlines
  byte-identical copies of the run-scoped and purge-groups fixtures (installed
  twice, preserving the re-run idempotency check). All 87 pgTAP assertions
  execute and pass; a Vitest contract test fails if the inlined copies drift
  from the fixture sources. The 8 NOTICE-based settlement regression files are
  unchanged and still report their pre-existing "No plan found" TAP parse
  noise with exit 0.
- Pre-deploy database note: migrations `20260905100000` through
  `20260906060000` are verified applied on the local database only. Apply them
  to production with `supabase db push` (or the linked project flow) only
  after confirming a current production backup; the production database was
  not modified during this cleanup.

- Aligned Friend and Group Settle Up screens with the same compact card layout,
  amount controls, quick choices, theme treatment, and safe-area-aware actions.
  Group settlement keeps its member radio selection and now presents it before
  the amount it controls.
- Removed friendship-only direct balance callouts from the Group summary card,
  which now shows the group balance, member count, and Settle Up action only.
- Changed Group member cards on the All tab to show each bilateral relationship
  as `You owe`, `Owes you`, `settled`, or `No balance`; the Balances tab keeps
  the full group and pair breakdown.

## 2026-09-06

- Ruled the freeze-vs-cancellation conflict (issue 17, option B): full-payment
  cancellation is a transfer-free non-cash effect, not an exemption of the old
  transfer path. The server full-settlement contract now builds
  creditor-originated legs with strictly negative from-user-oriented signed
  deltas and rejects absolute/positive deltas, so preview, commit validation,
  and participant-based readers agree. Partial, overpayment, and naturally-zero
  plans still carry no cancellation. A dedicated cancellation storage/RPC
  surface remains follow-up work.

- Restored the card-based Friend Settle Up layout in light and dark themes,
  including the relationship summary, prominent amount entry, quick amount
  choices, settlement preview, and safe-area-aware actions.

- Revised the settlement specification: partial payments preserve opposing
  balances, full overall payments clear included direct/group balances, and
  naturally zero totals create no settlement. Whole-settlement Delete also
  undoes associated cancellation. Rewrote unpublished ADR-0004 to match these
  rules, capped payments at the current overall amount, and aligned the ADR
  index, related decision note, and domain glossary. Implementation remains
  pending.

- Fixed the server home/groups relationship projections misreading scope
  transfers (ticket 09): transfer deltas are from-user-oriented on disk, but
  the readers applied them actor-oriented, so a transfer-bearing pair showed
  -$31 server-side while the row set and the group page prove $0. The readers
  now share the one participant-based orientation with the group ledger
  engine, pair totals, validation priors, and the backfill conversion; the
  same change makes reversal rows cancel to neutral instead of
  double-counting. Converted transfers are now excludable by every
  transfer-touching reader through the backfill marker, so a future backfill
  cannot double-count; transfer-free pairs, signatures, auth, stale-balance
  guards, and grants are unchanged. Verified with a failing-then-passing
  server/client regression pair (dev-shaped -$15.50 decoy) locally in
  rollback-only transactions; no hosted deployment.

## 2026-09-05

- Blocked new scope-transfer writes at both boundaries (ADR-0004): the commit
  RPCs reject any newly created operation carrying transfer legs with
  `SETTLEMENT_TRANSFERS_FROZEN`, and settlement preview/commit planning
  surfaces the same typed error before any write. Transfer-free payments,
  idempotent retries, reads, and Delete of existing operations (including
  transfer-bearing history) are unchanged.
- Fixed balance-clearing receipts failing to load and group payments that run
  opposite to the combined balance failing to delete: zero-net receipts now
  build reliably for new and retried requests, and Delete derives the expected
  balance from the original payment direction so opposing-sign group payments
  reverse correctly. Either participant can delete with their own current
  balance; stale, unauthorized, and later-activity rejections still leave all
  rows unchanged.
- Corrected the shared Delete flow to confirm through a cross-platform modal
  (Alert buttons do not render on web), serialize the whole dialog with a
  synchronous lock, honor real React Query refetch error results, and render
  the local Deleted state on both screens when refresh fails. Copy, mutation
  idempotency, and the `settlementModule.reverse` boundary are unchanged.
- Added one shared whole-operation Delete confirmation flow for Friend,
  Group payment, and balance-clearing entries: spec-exact `Delete settlement?`
  / `Delete balance clearing?` copy with the original operation cash amount,
  authorized details loaded before confirming (retryable error, never guessed),
  `Already deleted` on reused receipts, `Balance changed` refresh-then-retry
  for stale balances with no auto-loop, and `Unable to delete` permission /
  offline / unexpected variants. Deletion still uses `settlementModule.reverse`
  and refreshes Friend, Home, Group detail, and pair totals.
- Implemented Friend detail one-activity-per-settlement presentation: each
  operation renders once (`You paid Avee` / `Avee paid you`, or `Balances
  cleared with Avee` with `No payment was made`), linked balance adjustments
  fold into expandable `Balance details` (`Balance adjustment` + `No additional
  payment`, group links kept, no per-adjustment Delete), legacy payments keep
  existing presentation, deleted operations stay in place marked `Deleted` with
  compensating rows folded into details and Delete hidden. Accounting, balance
  math, and the `settlementModule.reverse` mutation boundary are unchanged.
- Revised the settlement activity specification and clarified ADR-0001 to plan
  one activity with whole-settlement Delete and balance adjustments in details;
  implementation is pending and accounting behavior is unchanged.
- Fixed pair-facing group balances being computed from global group nets, which
  overstated personal debts in multi-member groups and wrongly rejected full
  settlements (`SETTLEMENT_TRANSFER_BALANCE_MISMATCH`). Balances, commit checks,
  transfer validation, and reversal checks are now bilateral (pair-scoped).
- Added a Balances tab on group detail with per-pair combined totals, including
  settled-with-flows pairs, plus with-you captions on member rows and bilateral
  amounts on the group settle screen.
- Fixed balance caches (including the new pair totals) invalidating on every
  settlement, reversal, and expense mutation, with refetch on focus.

## 2026-09-03

- Added `npm run start:prod` for simulator Fast Refresh with credentials explicitly
  loaded from `.env`, isolated from development environment files and Metro's default port.
- Fixed friend and group settlement amount fields cropping long decimal values
  by reducing numeral size and widening the responsive input area.
- Prepared the iOS 1.0.21 release since 1.0.20 is already live in the App Store.

## 2026-09-02

- Configured production Android builds to compile device architectures only and
  cache native compilation outputs, avoiding Expo's 45-minute free-plan build
  timeout without changing development or preview emulator support.

## 2026-09-01

- Fixed the production Friends Home read failing for signed-in users when the
  database function confused its `created_at` result column with a settlement
  timestamp.
- Fixed the production Activity feed failing when its user-group CTE confused
  `group_id` with a function result column.
- Prepared the iOS 1.0.20 release after Apple closed the 1.0.19 release train
  for further TestFlight uploads.

## 2026-08-30

- Hardened the iOS E2E runs against cold or transient simulator launches by
  booting and pinning the CI device before Detox starts and giving the smoke
  journey enough time to finish on hosted runners.

## 2026-08-29

- Hardened the iOS E2E smoke run against slow or transient simulator app
  launches, repaired stale accessibility selectors, and corrected CI timing
  artifact collection.

## 2026-08-26

- Fixed the "Build once and run smoke suite" CI job: the `expo-updates` Xcode
  build phase runs Metro to generate update resources, and Metro requires
  `EXPO_ROUTER_APP_ROOT` to be set so it can inline the expo-router context
  root as a string literal.  The e2e build script now sets
  `EXPO_ROUTER_APP_ROOT` to the absolute `app/` path before invoking
  `detox build`.

## 2026-08-24

- Replaced the unbounded 6-query client-side activity-feed merge in `getUserActivities` with a single `supabase.rpc('get_user_activities')` call backed by a new `SECURITY DEFINER` PostgreSQL function. The function merges `activities` and `settlements` server-side, applies optional `ILIKE` search, and uses `LIMIT`/`OFFSET` for true server-side pagination; added supporting indexes on `activities` and `settlements`. Every infinite-scroll page now requires exactly one network round-trip instead of growing with history size and page count.
- Fixed the currency selector so choosing GBP or INR now persists across app restarts; `CurrencyProvider` awaits an async `hydratePreferredCurrency()` read from `AsyncStorage` on mount instead of synchronously reading the in-memory default that was still `USD` while storage hydration was pending.
- Added static exchange-rate conversion (`USD/GBP/INR`) to `formatCurrency` so amounts stored in one currency render correctly when the user picks a different display currency; new expenses and group settlements now write the user's selected currency code instead of the hardcoded `'USD'`.
- Aligned the "How to split?" button row on the Edit Expense screen with the Add Expense screen: replaced the fixed vertical layout with a horizontally scrollable row of pill buttons, updated styles to match (`flexDirection: 'row'`, `minWidth: 112`, `minHeight: 44`), and shortened the label from `'Percentage'` to `'Percent'` to prevent text wrapping.

## 2026-08-22

- Removed animated wrappers from Friend and Group Detail cards and Add Friend lookup results so card surfaces stay visually stable while scrolling and loading.
- Restored dark-mode card depth with a visible cool-gray shadow and Android elevation across detail, activity, profile, settlement, and loading-card states.
- Restored the same dark-mode depth for Home Friend, Group, and Activity cards, which had separately disabled their shadows and elevation, without changing card surfaces.
- Standardized dark-mode card surfaces to the shared black, borderless, slate-shadow elevation style while preserving existing light-mode card styling.

## 2026-08-23

- Fixed deleted expenses leaving Friends and Group balances stale until a
  matching Realtime event arrived.
- Added an implementation-ready specification for reducing Detox E2E runtime
  through measured baselines, run-scoped fixtures, focused device coverage,
  deterministic helpers, cheaper cleanup, and safe sharding.
- Configured the repository's local Markdown issue tracker and published the
  E2E performance plan as ten dependency-linked, agent-ready tickets.
- Adapted the specification implementation workflow to use GPT-5.6 Luna
  workers with primary-agent review, correction loops, and persistent local
  ticket execution state.
- Consolidated the Detox release suite to 11 focused journeys, moved removed
  setup coverage to retained device or Vitest tests, and documented the
  coverage map. The default full run no longer repeats the smoke journey.
- Added separate macOS GitHub Actions workflows for PR smoke coverage and
  scheduled or manually started full-suite verification, with native-input
  caching and retained timing, logs, and Detox artifacts.
- Hardened legacy E2E cleanup so it requires the development fixture boundary
  and allowlisted actor, deletes only that actor's prefixed Groups, and removes
  the retired broad history-cleanup RPC from existing development installs.

## 2026-08-20

- Fixed edited expenses taking tens of seconds to show updated amounts:
  cache invalidations now run immediately after the expense update
  persists instead of waiting on activity logging and push notifications.
- Fixed group renames not appearing in the Groups list after saving: the edit
  screen now invalidates the groups list cache like group creation does.
- Clearing the Activity search now also dismisses the keyboard.
- Expanded Detox E2E coverage with four new scenario files: friend-level
  settlement from the Friend detail screen, the expense edit → delete lifecycle
  via Expense Detail, group rename (list swipe action) and deletion, and an
  Activity-feed search plus group-balance settlement verification.
- Added stable testIDs to the friend settle form, edit-expense form, expense
  detail actions, edit-group form, activity search, and the Friend detail
  Settle Up button; NavigationHeader back buttons now expose a "Go back"
  accessibility label.
- Added a development-only purge_e2e_groups fixture so E2E cleanup can delete
  Detox groups whose combined settlements create restricting settlement scope
  transfers and operations; cleanup now runs through it instead of direct
  group deletes.
- Added a Detox/Jest iOS simulator E2E setup targeting the Vasuli Xcode scheme
  and iPhone 17 Pro, with launch, email-input, and environment-driven OTP login
  coverage that bypasses the OTP resend countdown and dismisses notification
  onboarding during automation.
- Added an Expo Router native-intent rewrite for the Groups deep link, providing
  a stable navigation seam for native E2E coverage.
- Added Detox coverage for native Groups-tab navigation and the create-group →
  add-expense flow, including keyboard-safe amount entry on iOS simulator.
- Split Detox coverage into authentication, groups, expenses, and settlement
  scenario files with shared login and group-flow helpers.
- Fixed the Detox iOS build wrapper so the simulator bundle uses the development
  Supabase project consistently with E2E cleanup and test credentials.
- Added an idempotent development SQL fixture for connecting the reviewer account
  to the E2E friend account required by settlement coverage.
- Added guarded development-database cleanup before and after Detox runs for
  groups created by the E2E account.
- Removed the obsolete alternative E2E reference; Detox is now the project’s
  supported mobile E2E runner.
- Removed real E2E/reviewer account identifiers and OTP fallbacks from tracked
  source; local environment configuration now supplies those values.

## 2026-08-19

- Moved swipe-to-reveal actions to ReanimatedSwipeable so finger-driven motion and action opacity stay on the UI runtime, and removed per-row Group entrance animation that could replay during list virtualization.

- Fixed pasted and autofilled OTP codes so the newly entered six-digit value is
  verified reliably while consolidating sign-in and sign-up into one shared flow.
- Fixed Group Detail balances flickering through incorrect intermediate values
  after adding an expense by atomically replacing the optimistic cache entry
  and waiting for persistence before returning to the Group.
- Fixed Group Detail occasionally showing a false not-found state by confirming
  a transient missing response before replacing the screen.
- Fixed Group Detail showing a false “Group not found” alert on the first open
  after a settlement populated an empty detail cache entry.
- Fixed Friend and Group settlement amount entry so currency markers remain
  clearly separated, and completed values display two decimal places without
  clipping.
- Fixed account deletion errors so outstanding balances show the settlement
  requirement while unexpected failures use a readable generic message.
- Fixed received invitations so inviter names are trimmed and always display a
  useful identity instead of a blank label.
- Fixed group expense percentage, share, equal, and unequal splits so generated
  rows always add up to the expense total at database cent precision.
- Fixed Friend Group balance projection to apply signed scope-transfer deltas,
  keeping it aligned with Group Detail and Home after cross-scope settlements.
- Fixed the deployed positive settlement RPC fingerprint column typo that caused
  valid payments to fail with `42703` before creating a settlement operation.
- Fixed sign-out retaining cached Friend relationship data that could otherwise
  remain visible when a different account signs in on the same device.
- Fixed Friend activity so pair-relevant Group settlements appear once with
  their Group context without changing the direct Friend balance.

## 2026-08-18

- Collapsed the settlement pipeline into one deep `settlementModule`
  (`commit`/`reverse`/`preview`) in `services/settlement-service.ts`, absorbing
  `combined-settlement-service`, `friend-settlement-allocation`,
  `settlement-reversal`, `combined-settlement-receipt-effects`, and
  `combined-settlement-errors`; low-level CRUD stays available as
  `settlementService`.
- Made settlement reversal validation scope-aware by including cross-scope
  transfer deltas in the server-side stale-balance check.
- Removed the unused legacy Friend settlement path and its per-group allocator;
  Friend settlement now has one operation-based commit path.
- Centralized settlement reversal execution and refresh invalidation across
  Friend and Group detail screens.
- Fixed stale balance projections by invalidating Friend surfaces and refreshing
  Group Home/detail data when settlement scope-transfer rows change.
- Aligned Friend settle-up with the authoritative transfer-adjusted Home
  relationship projection so partial payments follow the current net direction;
  added Dev diagnostics and regression coverage for positive Group balances.
- Fixed server-side Group allocation validation to include existing scope
  offsets from earlier all-balance settlements.
- Fixed Direct allocation validation for full settlements that reclassify a
  Group balance after earlier scope offsets already exist.
- Corrected scope-transfer integrity validation to apply existing offsets from
  the settlement actor's perspective.
- Hardened settlement RPC boundaries in Dev by removing the legacy callable
  settlement overload, protecting payment-intent replays from changed payloads,
  and validating cross-scope transfer offsets against server-calculated group
  balances.
- Refreshed Group detail balances whenever the screen regains focus so recent
  settlements cannot remain hidden behind a fresh query cache.
- Corrected scope-transfer sign handling so Group detail and Group settle-up
  balances do not double-count cross-scope offsets.
- Removed the legacy settlement RPC overload and anonymous access to settlement
  reversal operations.
- Added the backend foundation for atomic settlement-operation reversal with
  compensating payment and scope-offset records, authorization for the two
  involved users, and idempotent reversal responses.
- Labeled reversal offset entries distinctly in Friend settlement history.
- Added reversal actions for operation-linked cash settlements in Friend history;
  legacy settlements without an operation link remain read-only.
- Updated Friend Settle Up allocation so partial payments stay Direct-first
  without moving opposing Group balances, while full-net and zero-net flows
  preview and record explicit cross-scope offsets.
- Fixed the sign-up verification action so the Create account button fills its
  control, keeps the confirmation icon aligned, and matches the sign-in button.
- Refreshed the Groups home query after creating a group so newly created groups
  appear immediately when returning to the list.
- Refreshed the Groups home query after deleting a group so removed groups no
  longer remain visible when returning to the list.
- Clarified Friend detail balance states so same-currency direct and group
  balances are not mislabeled as multiple currencies.
- Condensed the Friend detail split-balance summary so the status stays compact
  while detailed direct and group amounts remain visible below.
- Updated Friends home cards to show the one-currency net balance across direct
  and group scopes, labeled as a net balance when those scopes stay separate.
- Made the Friends home relationship RPC return that same one-currency net
  balance while preserving separate-scope settlement safeguards.
- Restored the simple Friend detail balance wording and Settle Up action; when
  direct and group balances point in opposite directions, the action settles
  the direct ledger independently.
- Clarified the direct-only settlement screen so it no longer labels the direct
  amount as a combined relationship balance.
- Changed group deletion to Splitwise-style reversible soft deletion: groups
  are hidden from active views while expenses, payments, and history remain
  preserved.
- Added a shared relationship freshness contract across Home, Friend detail,
  and settle-up, including Realtime refreshes for ledger and membership inputs,
  stale-load protection, and sign-out cache isolation.
- Routed Home Friend summaries through the currency-aware relationship projection,
  preserving direct-versus-Group scope and avoiding incompatible-currency totals.
- Added Dev-backed settlement operations and scope-transfer records, including
  idempotent all-balance/group RPCs, zero-net clearing, transfer-aware Friend and
  Group refreshes, and reversible group deletion metadata.
- Fixed group balance calculation in `balance-utils` to include scope transfers,
  so the Group settle-up screen shows the same reduced balance as the Group
  detail page after partial or cross-scope settlements.

- Updated the iOS `preview` submit configuration with the newly registered App Store Connect App ID to resolve TestFlight submission errors.
- Cleaned up CI/CD workflows by offloading Google Services JSON keys, Supabase URLs, and keys directly to native EAS Environment Variables and Credentials.
## 2026-08-17

- Deepened the Friend relationship read seam so Friend detail and combined
  settle-up consume one currency-aware Direct and shared Group projection,
  including multi-currency and opposite-direction safeguards.

- Hardened combined settlement receipts and retries with explicit timestamp and
  direction fields, supported-currency validation, pair serialization, and
  retryable transient-error handling.
- Finalized the combined settlement receipt flow with centralized cache updates,
  activity deduplication, and regression coverage for direct, Group, and
  combined payments.
- Added stale-balance detection, server-derived settlement authorization,
  exact-cent validation, and recoverable Friend settle-up errors.
- Routed combined Friend settlement through a dedicated commit service and
  allocation receipt, preserving direct and shared Group settlement scopes.
- Added a transactional combined settlement RPC with payment-intent
  idempotency, scoped authorization, and receipt reuse for safe retries.
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
