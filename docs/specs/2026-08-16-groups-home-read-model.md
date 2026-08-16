# Deepen the Groups home read model

## Problem Statement

The Groups home screen still performs a client-side query waterfall after the
existing splash and startup prefetch work. Recent startup traces show that the
Groups shell becomes visible around 3.4–3.8 seconds, while the Groups home
query completes around 1.1–1.5 seconds later. The measured balance phase alone
takes about 684 ms for an account with two groups.

The current path is:

1. Fetch the current user’s group memberships.
2. Fetch group records for those memberships.
3. Fetch every expense in those groups.
4. Fetch every settlement in those groups.
5. Fetch every split belonging to those expenses.
6. Calculate each group balance on the device.

The Groups screen only needs group-card fields and the current user’s balance.
Downloading complete expense, settlement, and split histories adds network
round trips, transfers unnecessary data, and makes startup time grow with the
account’s history.

## Solution

Create a secured Supabase PostgreSQL RPC that returns the display-ready Groups
home read model in one request. The RPC will resolve the authenticated app
user, identify groups where that user is a member, calculate the user’s net
balance per group from group expenses, expense splits, and settlements, and
return only the fields required by the Groups home screen.

The existing Groups screen, React Query key, cache behavior, loading/error
states, and public service seam should remain stable. The screen should
continue to consume `GroupWithMembers[]`; the implementation behind the query
should change from a multi-query client assembly to the RPC adapter.

The existing splash remains unchanged. The existing startup prefetch policy
may later prefetch this same Groups seam, but this spec focuses on replacing
the Groups home data waterfall with a server-shaped read model.

## User Stories

1. As a user, I want my groups and balances to appear shortly after the splash,
   so that the app feels responsive.
2. As a user with many historical expenses, I want Groups startup to avoid
   downloading full expense history, so that launch time does not grow with
   account age.
3. As a user, I want each displayed group balance to match the existing
   balance calculation, so that financial information remains trustworthy.
4. As a user who paid an expense, I want the other participants’ shares to
   reduce the amount owed to me correctly.
5. As a user who owes part of an expense, I want my share to be reflected in
   the group balance correctly.
6. As a user who recorded a settlement, I want that settlement applied to the
   group balance without changing its sign convention.
7. As a user, I want only groups where I am a member to appear, so that the
   home screen does not expose unrelated groups.
8. As a user, I want the RPC to derive my identity from the Supabase session,
   so that changing a client parameter cannot retrieve another user’s groups.
9. As a user without a valid authenticated session, I want no private group
   data returned.
10. As a user, I want the existing empty, loading, error, and retry states to
    continue working if the RPC fails.
11. As a user, I want realtime updates to refresh the same Groups read model,
    so that new expenses, settlements, and membership changes are reflected.
12. As a maintainer, I want the current client-side balance calculation to
    remain available as a correctness oracle during migration.
13. As a maintainer, I want authenticated query timing and result counts to be
    measurable without logging user identifiers or financial values.

## Implementation Decisions

- Preserve the existing Groups home query seam and React Query key.
- Add a service method that calls a no-argument RPC such as
  `get_groups_home_summaries()`; the RPC must derive the app user from
  `auth.uid()` rather than trusting a user ID for authorization.
- Return only the projection needed by `GroupWithMembers` on the home screen:
  - Group identity and display fields.
  - `your_balance` for the authenticated app user.
- Do not return raw expenses, splits, settlements, or all group members from
  this RPC unless the existing Groups home UI demonstrably requires them.
- Preserve the existing balance convention and arithmetic:
  - Add the full expense amount to the payer’s group balance.
  - Subtract each split amount from the corresponding participant.
  - Add settlement amounts to `from_user_id` and subtract them from
    `to_user_id`, matching the existing client implementation.
- Restrict all balance inputs to groups in which the authenticated app user
  is a member.
- Use set-based SQL and avoid invoking the expensive per-row RLS helper chain
  for every expense and split.
- Use `SECURITY DEFINER` only if required for the measured RLS overhead. If
  used, the function must:
  - Set an explicit safe `search_path`.
  - Fully qualify table references.
  - Resolve identity from `auth.uid()` and the app-profile bridge.
  - Return no rows for anonymous or unmapped sessions.
  - Explicitly revoke execution from `anon` and `PUBLIC`.
  - Grant execution only to `authenticated`.
- Select explicit columns rather than `select *` in the RPC projection.
- Verify existing indexes before adding new ones. Candidate access paths
  include membership by user, expenses by group, splits by expense, and
  settlements by group.
- Keep `calculateGroupBalances` as a parity oracle until database results are
  verified against representative fixtures and linked-project data.
- Keep the current Groups loading, error, retry, animation, and empty states.
- Keep realtime invalidation pointed at the existing Groups query. Realtime
  events should cause the RPC-backed query to refetch rather than introduce a
  second cache.
- Add development-only telemetry for RPC duration, result count, and query
  completion. Do not log balances, group names, or user identifiers.
- Do not change the splash duration, artwork, animation, or handoff.

## Testing Decisions

Add focused tests around the existing Groups home service seam and the RPC
adapter.

Behavior and parity tests should cover:

- Groups are limited to memberships of the authenticated app user.
- A user with no groups receives an empty result.
- Payer and participant split arithmetic matches `calculateGroupBalances`.
- Multiple expenses in one group aggregate correctly.
- Settlements adjust balances with the existing sign convention.
- A group with a zero balance returns zero rather than a floating-point noise
  value where the existing behavior normalizes it.
- The RPC response maps into the existing `GroupWithMembers` contract.
- The adapter does not pass an authorization-bearing user ID to the RPC.
- Anonymous and unmapped sessions cannot read group summaries.
- An authenticated user cannot retrieve another user’s group summaries.
- RPC failures flow through the existing Groups error and retry behavior.
- Realtime invalidation refetches the Groups query through the same seam.
- The existing splash behavior remains unchanged while Groups data loads.

Database verification should run under the authenticated role before and after
the migration. Compare:

- Total Groups home execution time.
- Expense, split, and settlement rows scanned.
- RLS helper evaluation behavior.
- Result row count and returned columns.
- Anonymous execution behavior.

Performance acceptance target: the authenticated Groups home read should
complete in under 500 ms on the linked project for the current test account,
and the actual end-to-end first-data timing must be confirmed with startup
telemetry.

## Out of Scope

- Replacing or redesigning the splash screen.
- Changing the Groups home layout, copy, animations, or navigation.
- Changing group-detail or group-stats read models.
- Changing expense, split, settlement, or membership authorization rules.
- Removing RLS from the underlying tables.
- Creating a general-purpose expense, split, or settlement RPC.
- Changing balance signs, currency behavior, or financial business rules.
- Removing realtime invalidation.
- Removing `calculateGroupBalances` before parity coverage is complete.
- Adding offline persistence beyond the existing React Query cache.
- Building or submitting production binaries as part of this spec.

## Further Notes

The initial measurement suggests the Groups membership lookup itself is not the
primary bottleneck: an authenticated indexed lookup returned two memberships
in about 11 ms. The dominant work is the balance phase, which performs three
history reads and client-side aggregation. The RPC should therefore target the
entire Groups home projection rather than optimizing only the group list query.

The safest implementation sequence is:

1. Add parity fixtures and define the stable Groups summary contract.
2. Write the secured RPC migration after confirming query plans and indexes.
3. Add the mobile adapter and response mapping tests.
4. Verify anonymous, authenticated, and mismatched-identity behavior.
5. Switch the Groups home query to the RPC while preserving cache behavior.
6. Compare startup telemetry and authenticated `EXPLAIN ANALYZE` results.
7. Remove only redundant client orchestration after parity and performance are
   confirmed.

## Tracker

- Project Hub task: pending creation
- Status: ready-for-agent
- Priority: High
- Label: `ready-for-agent`
