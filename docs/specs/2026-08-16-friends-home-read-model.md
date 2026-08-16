# Deepen the Friends home read model

## Problem Statement

The Friends home screen is still slow after the existing splash and startup prefetch work. Runtime measurements show that the app profile is ready in under one second and the Friends prefetch begins while the splash is visible, but the Friends data itself takes about 13.6 seconds to finish.

The slow path is:

- Expense IDs from splits: about 1.6 seconds
- Full expenses query for 84 expenses: about 7.2 seconds
- Full expense splits query: about 4 seconds

Direct database execution as the database owner completes the equivalent expense query in under one millisecond. Running the same query under the authenticated RLS role takes about 7 seconds, and the split query takes about 4.2 seconds. The query plan shows repeated evaluation of `private.can_view_expense`, `private.can_act_as_user`, and `private.is_group_member` for individual rows.

The user experiences this as a long loading period after the splash screen. The current client assembles a Friends summary by downloading expense history and split history, then calculating balances and recent expenses on the device. This creates unnecessary round trips, transfers more data than the screen needs, and repeatedly triggers expensive RLS checks.

## Solution

Create a secure Supabase PostgreSQL RPC that returns the display-ready Friends home read model in one request. The RPC will resolve the authenticated app user, find accepted friends, calculate balances from expenses and settlements, and return only the profile, balance, and recent outstanding expense data required by the Friends screen.

The existing Friends screen, React Query key, cache behavior, and public service seam should remain stable. The current client-side summary builder remains useful as a correctness oracle while the new database-backed read model is introduced and verified.

The existing splash remains unchanged. Prefetch will call the same Friends home seam, but the underlying read model should complete quickly enough to overlap meaningfully with the splash.

## User Stories

1. As a Vasuli user, I want Friends data to appear shortly after the splash, so that the app feels responsive.
2. As a returning user, I want the Friends home read to use one efficient request, so that my screen does not wait for several sequential data fetches.
3. As a user with many friends, I want all current balances to remain accurate, so that I can trust who owes whom.
4. As a user with many historical expenses, I want the Friends screen to avoid downloading my entire expense history, so that startup time does not grow unnecessarily with account age.
5. As a user, I want recent outstanding expenses to remain visible for each friend, so that the existing screen capability is preserved.
6. As a user with settled expenses, I want settled friends to remain grouped correctly, so that the screen’s settled-state behavior does not change.
7. As a user who has paid an expense, I want the balance to reflect the other participants’ shares, so that lending is represented correctly.
8. As a user whose friend paid an expense, I want my share to reduce my balance with that friend, so that owing calculations remain correct.
9. As a user who has recorded a settlement, I want that settlement reflected in the balance, so that the displayed amount matches the remaining debt.
10. As a user who belongs to groups, I want group expenses involving my friends to remain included according to the current behavior, so that the new read model does not silently change financial meaning.
11. As a user, I want to see only friends accepted in the friendship relationship, so that pending or removed contacts do not appear in the home list.
12. As a user, I want the RPC to enforce my identity from the Supabase session, so that I cannot request another user’s Friends data by changing a parameter.
13. As a user, I want the RPC to return no private data when I have no valid authenticated session, so that authentication remains enforced.
14. As a user, I want the existing Friends loading, empty, error, and retry states to continue working, so that a failed RPC is recoverable.
15. As a user, I want the existing splash experience to remain unchanged, so that the performance improvement does not remove the product’s visual handoff.
16. As a user, I want prefetched Friends data to be reused after the splash, so that the screen does not repeat an identical request.
17. As a user, I want a realtime refresh to update the same Friends read model, so that balances remain current after expenses, splits, settlements, or friendships change.
18. As a user, I want monetary calculations to preserve the existing rounding and settled threshold behavior, so that small floating-point differences do not change the UI unexpectedly.
19. As a maintainer, I want the Friends screen to depend on one stable read-model seam, so that database and client implementation details remain localized.
20. As a maintainer, I want the current client-side builder to remain available as an independent correctness reference during migration, so that the RPC can be compared against known examples.
21. As a maintainer, I want performance instrumentation to show RPC duration and first Friends data visibility, so that future regressions are measurable.
22. As a maintainer, I want the RPC to be covered by security and behavior checks, so that performance work does not weaken data isolation.

## Implementation Decisions

- Preserve the existing public Friends home seam: a request for the current user’s `FriendSummary[]`.
- Replace the internal multi-query assembly used by the Friends home read with a single Supabase RPC call.
- The RPC must derive the app user from the authenticated Supabase session. It must not trust an arbitrary user ID supplied by the client for authorization.
- The RPC may accept no user identifier, or accept one only as a consistency check that must match the authenticated app user. The preferred contract is no authorization-bearing user parameter.
- Use a `SECURITY DEFINER` function only if required to avoid the measured per-row RLS overhead. If used, it must:
  - Set an explicit safe `search_path`.
  - Resolve identity from `auth.uid()` and the app-profile bridge.
  - Return only the Friends home projection.
  - Avoid exposing raw expenses, splits, users, or settlements through the RPC.
  - Be granted only to the intended authenticated role.
  - Reject anonymous or unmapped sessions.
- Perform friend discovery, expense participation, settlement application, balance calculation, and recent outstanding expense selection in set-based SQL.
- Preserve the existing balance convention: positive means the friend owes the current user; negative means the current user owes the friend.
- Preserve the existing settled threshold and recent-expense limit semantics.
- Preserve accepted-friend ordering by friend name.
- Return a stable result shape that maps directly to the current `FriendSummary` contract, including optional recent expenses.
- Select only columns required by the Friends home projection. Do not return `select *` data from the underlying tables.
- Add supporting composite indexes where the RPC access pattern benefits from them, especially around expense participation and group membership. Candidate indexes include:
  - Expense splits by user and expense.
  - Expense splits by expense and user.
  - Group membership by group and user.
- Verify existing indexes and query plans before adding duplicate or redundant indexes.
- Keep the current client-side `buildFriendSummaries` implementation as a test oracle until the RPC output has parity coverage. It may be removed or narrowed in a later cleanup after confidence is established.
- Keep the existing React Query key and stale/cache behavior. The Friends screen should not need to know whether data came from the RPC or the previous adapter.
- Keep the existing startup prefetch and ensure it invokes the same Friends home seam used by the visible screen.
- Keep realtime invalidation behavior. Realtime events should invalidate/refetch the Friends home query rather than mutate an unrelated parallel cache.
- Extend development-only startup telemetry to identify the RPC duration, result count, and first Friends data visibility without logging user identifiers or financial values.
- Preserve the existing splash duration, artwork, animation, handoff, and native splash behavior.
- Add a migration that is forward-only, reviewable, and safe to apply to the linked Supabase project. No production migration is executed as part of writing this spec.

## Testing Decisions

Tests should verify behavior through the existing Friends home read-model seam rather than testing SQL implementation details from the mobile client.

Test the following behavior:

- The Friends home seam returns the same summaries for representative expense, split, settlement, and friendship fixtures as the existing client-side builder.
- Positive and negative balances match the established domain convention.
- Settlements reduce or increase balances correctly.
- Recent outstanding expenses are limited and ordered as before.
- Settled friends remain represented correctly.
- Empty friend lists return an empty result without unnecessary work.
- The RPC rejects anonymous or unmapped sessions.
- The RPC cannot be used to retrieve another app user’s Friends data.
- The RPC returns only the intended projection, not raw private table data.
- A failed RPC surfaces through the existing Friends error and retry behavior.
- The startup prefetch uses the same query key and does not cause the visible Friends route to issue a duplicate request.
- Realtime invalidation causes the Friends home query to refresh through the same seam.
- The existing splash behavior is unchanged while prefetch runs in the background.

Testing prior art includes the existing Friends summary tests, balance utility tests, service tests with Supabase boundary mocks, query-cache adapter tests, and the startup prefetch tests. Prefer fixture-driven parity tests for domain behavior and boundary-focused tests for the RPC adapter.

For database verification, run read-only `EXPLAIN ANALYZE` checks under the authenticated role before and after the migration. Compare:

- Friends home total execution time.
- Expense and split scan counts.
- RLS helper invocation shape.
- Rows and columns transferred to the client.

The performance acceptance target is a Friends home read under two seconds on the same linked project and test account, with the exact result confirmed by startup telemetry rather than assumed from local unit tests.

## Out of Scope

- Replacing or redesigning the splash screen.
- Changing the Friends screen layout, copy, animation, or navigation.
- Rewriting the Activity, Groups, Profile, or Friend Detail read models in this task.
- Removing RLS from the underlying tables.
- Exposing a general-purpose expense or settlement RPC to the client.
- Accepting a client-provided user ID as the sole authorization mechanism.
- Changing the underlying financial rules, balance signs, rounding threshold, or recent-expense limit.
- Removing realtime invalidation.
- Adding offline persistence beyond the existing React Query cache.
- Deleting the client-side summary builder before parity coverage is complete.
- Deploying the migration or submitting a production build as part of spec creation.

## Further Notes

The database investigation established that the base query plan is fast when RLS is bypassed, while the authenticated plan spends most of its time repeatedly evaluating nested policy helpers. The RPC is therefore a targeted read-model seam for the Friends home, not a generic database shortcut.

The safest implementation sequence is:

1. Add parity fixtures and define the stable result contract.
2. Write the secured RPC migration and supporting indexes.
3. Verify the RPC under anonymous, authenticated, and mismatched-identity contexts.
4. Switch the existing Friends home adapter to the RPC.
5. Compare startup telemetry and authenticated `EXPLAIN ANALYZE` results.
6. Remove only redundant client orchestration after parity and performance are confirmed.

## Tracker

- Project Hub project: `1786897413442`
- Label: `ready-for-agent`
