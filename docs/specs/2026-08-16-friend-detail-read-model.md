# Deepen the Friend detail read model

## Problem Statement

The Friend detail page takes several seconds to become usable on a cold load.
The page requests one friend, but the current detail module assembles the
answer by downloading broad user-scoped datasets and filtering them locally.

The current path contains approximately five network rounds:

- Friend profile, user expenses, and user settlements begin together.
- User expenses then perform three sequential reads: split expense IDs, paid
  expense IDs, and full expense records.
- Only after those reads finish does the detail module request all splits,
  expense-targeted activities, and recent activities.
- Recent activities itself reads group membership before reading up to 200
  activities.

This increases latency, transfers data unrelated to the selected Friend, and
repeats expensive authenticated row-level security evaluation. The screen
already has a stable React Query detail seam, but the implementation behind it
is shallow: the client must coordinate several adapters to reconstruct one
pair-specific read model.

## Solution

Create a secure, pair-scoped Friend detail read model backed by one Supabase
PostgreSQL RPC. The read model will return the selected Friend profile, shared
expenses with the required split amounts, pair settlements, and relevant
expense update/delete activities in the existing `FriendDetailData` shape.

Keep the Friend detail screen and its React Query key stable. Replace the
multi-query orchestration behind the existing detail service with one adapter
call to the RPC, while retaining the existing pure projection and domain
calculation as a correctness oracle during migration.

Add development-only timing instrumentation around the read-model call and
the screen’s first-data visibility so the improvement is measured on a real
device and linked Supabase project.

## User Stories

1. As a Vasuli user, I want the Friend detail page to become usable quickly, so that I can review a balance without waiting through several data loads.
2. As a returning user, I want Friend detail data to load through one efficient read, so that network latency does not accumulate across sequential requests.
3. As a user with many historical expenses, I want Friend detail to avoid downloading unrelated expense history, so that load time does not grow unnecessarily with account age.
4. As a user, I want the selected Friend’s profile information to remain visible, so that I can confirm whose balance I am reviewing.
5. As a user, I want shared expenses with the selected Friend to remain visible, so that I can understand the balance behind the total.
6. As a user, I want each shared expense to preserve the amount, date, payer, group, and my share, so that the existing expense details remain trustworthy.
7. As a user, I want settlements between me and the selected Friend to remain visible as updates, so that completed repayments are part of the activity history.
8. As a user, I want expense updates and deletions involving the selected Friend to remain visible, so that the activity history preserves important changes.
9. As a user, I want All, Expenses, and Updates filters to return the same results as before, so that the performance improvement does not change the meaning of the page.
10. As a user, I want the balance sign and display copy to remain unchanged, so that a positive balance still means the Friend owes me and a negative balance still means I owe the Friend.
11. As a user, I want settlements to affect the balance with the current rounding and settled threshold, so that small floating-point differences do not change the result unexpectedly.
12. As a user, I want deleted or inaccessible expenses to follow the existing visibility rules, so that the new read model does not reveal private data.
13. As a user, I want an empty Friend history to render the existing empty state, so that a new friendship still has a clear next action.
14. As a user, I want a failed Friend detail read to render the existing error and retry state, so that a temporary network problem is recoverable.
15. As a user, I want realtime changes to refresh the same Friend detail read model, so that new expenses, split changes, and settlements become visible without reopening the page.
16. As a user, I want the page to reuse fresh React Query data when available, so that navigating back does not repeat an unnecessary request.
17. As an authenticated user, I want the RPC to derive my identity from the Supabase session, so that changing a client parameter cannot expose another user’s data.
18. As an anonymous or unmapped user, I want the read model to return no private Friend detail data, so that authentication and profile linking remain enforced.
19. As a user, I want the RPC to return only the projection needed by Friend detail, so that private table columns and unrelated records are not transferred.
20. As a maintainer, I want the screen to depend on one stable Friend detail interface, so that database query changes remain local to the read-model module.
21. As a maintainer, I want the existing pure Friend detail builder to remain available as a correctness oracle during migration, so that database output can be compared against known domain behavior.
22. As a maintainer, I want parity fixtures for expenses, splits, settlements, updates, deletions, and empty history, so that the read model can be changed safely.
23. As a maintainer, I want development telemetry to report read duration, row counts, retry count, and first-data visibility without logging user identifiers or financial values, so that latency regressions are diagnosable.
24. As a maintainer, I want the authenticated query plan verified before and after the RPC, so that the change addresses RLS evaluation cost rather than only moving work around.
25. As a maintainer, I want the existing Friends home and Groups detail read-model patterns to remain consistent, so that future read models are easier to navigate and test.

## Implementation Decisions

- Preserve the existing public Friend detail seam and return shape represented by `FriendDetailData`.
- Keep the Friend detail screen, navigation, activity filters, optimistic updates, realtime invalidation, and React Query key unchanged unless a compatibility issue is proven.
- Introduce one pair-scoped read-model adapter behind the existing detail service. The adapter is the single new seam between the mobile module and the database projection.
- Add a Supabase RPC that accepts the selected Friend identifier only as a resource selector and derives the current app user from the authenticated Supabase session.
- Do not use a client-provided current-user identifier as an authorization mechanism.
- Resolve the app user through the existing authenticated profile bridge. Anonymous and unmapped sessions must return no private result or an explicit authorization error consistent with current conventions.
- Return only the selected Friend profile and pair-scoped projection fields required by the current detail screen:
  - Friend identity fields.
  - Calculated pair balance.
  - Shared expense fields and the current-user/Friend split amounts.
  - Pair settlement fields.
  - Relevant expense update/delete activity fields.
- Preserve the existing `FriendActivityItem` categories and namespaced identifiers so stable list keys, filtering, navigation, and optimistic removal continue to work.
- Preserve the existing balance semantics, rounding behavior, settled threshold, settlement direction, date ordering, and activity ordering.
- Perform filtering and joins set-wise in SQL rather than downloading broad user-scoped datasets for client-side filtering.
- Use `SECURITY DEFINER` only if required to avoid the measured RLS overhead. If used, set an explicit safe search path, resolve identity from `auth.uid()`, restrict execution to the authenticated role, and expose no general-purpose table access.
- Select explicit columns rather than returning raw table rows or `select *` through the RPC.
- Verify existing indexes and authenticated query plans before adding indexes. Add only indexes demonstrated to support the pair-scoped access pattern.
- Keep the existing pure Friend detail builder as a correctness oracle until parity tests pass. Remove or narrow redundant client orchestration only after parity and performance validation.
- Add development-only timing instrumentation at the read-model seam and at first Friend detail data visibility. Do not log user IDs, Friend IDs, descriptions, or monetary values.
- Include total duration, RPC duration, result item counts, and retry status in development telemetry.
- Keep React Query caching and invalidation behavior unchanged. Realtime events should invalidate the Friend detail query through its current key.
- Add a forward-only Supabase migration. Spec creation does not deploy the migration or submit a build.

## Testing Decisions

Tests should verify external behavior through the Friend detail service/read-model seam rather than coupling mobile tests to SQL implementation details.

Test the following:

- The read-model adapter maps the RPC result to the existing `FriendDetailData` contract.
- Representative shared-expense fixtures produce the same pair balance and split amounts as the existing pure builder.
- Positive, negative, and settled balances preserve existing semantics.
- Pair settlements are included with the correct direction, amount, date, and group metadata.
- Expense updates and deletions are included only when they match the selected pair’s visibility rules.
- The All, Expenses, and Updates filters receive equivalent activity categories and ordering.
- Empty results preserve the existing empty-state behavior.
- RPC errors preserve the existing loading/error/retry behavior.
- Anonymous and unmapped sessions cannot retrieve another user’s Friend detail.
- A client cannot use a different current-user identifier to bypass session identity.
- The RPC returns only the intended projection fields.
- Realtime invalidation refreshes the same React Query detail entry.
- Fresh cached data is reused without an unnecessary duplicate request.
- Development telemetry records timings without recording identifiers or financial values.

Prior art includes Friend detail builder tests, Friends home read-model tests,
Groups detail read-model tests, Supabase boundary mocks, query-cache adapter
tests, and existing RPC security tests. Prefer fixture-driven parity tests for
domain behavior and boundary-focused tests for the RPC adapter.

For database verification, run read-only `EXPLAIN ANALYZE` checks under the
authenticated role before and after the migration. Compare total execution
time, rows scanned, RLS helper evaluation shape, rows returned, and payload
size. The acceptance target is a Friend detail read under two seconds on the
same linked project and representative test account, with the exact result
confirmed by development telemetry.

## Out of Scope

- Redesigning the Friend detail layout, activity cards, tab interaction, copy, or navigation.
- Replacing the existing React Query cache strategy.
- Removing RLS from underlying tables.
- Creating a general-purpose expenses, splits, settlements, or activities RPC.
- Changing balance rules, rounding, settled thresholds, settlement semantics, or activity visibility rules.
- Adding offline persistence beyond the existing cache.
- Reworking Friends home or Groups detail in this task, except where shared read-model conventions are reused.
- Removing the pure Friend detail builder before parity coverage is complete.
- Deploying the migration, committing changes, or submitting a production build as part of spec creation.

## Further Notes

The safest implementation sequence is:

1. Define representative parity fixtures and lock the stable Friend detail result contract.
2. Add development timing instrumentation at the read-model seam.
3. Write the secured pair-scoped RPC migration and verify supporting indexes.
4. Run authenticated, anonymous, and mismatched-identity security checks.
5. Switch the existing Friend detail adapter to the RPC while retaining the pure builder as an oracle.
6. Compare telemetry and authenticated query plans against the current request path.
7. Remove redundant client orchestration only after parity, security, and performance acceptance criteria pass.

The primary architectural goal is locality: the Friend detail module should own
the pair-specific projection, while the screen remains unaware of whether the
data came from client-side assembly or a database-backed read model.

## Tracker

- Project Hub project: `1786897413442`
- Label: `ready-for-agent`
