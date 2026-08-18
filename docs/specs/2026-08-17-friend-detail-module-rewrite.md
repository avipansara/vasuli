# Rewrite the Friend detail module

## Problem Statement

The Friend detail page is difficult to understand and change because one route
owns too many responsibilities. It loads and mirrors Friend detail data,
subscribes to realtime changes, coordinates React Query invalidation, performs
settlements, deletes expenses, removes Friends, sends reminders, updates
related cached read models, and renders three activity shapes with their
navigation and interaction rules.

The page has grown to more than 1,600 lines and imports several independent
domain modules directly. The interface presented to the route is nearly as
complex as the implementation behind it. The current seams do not concentrate
Friend-pair behavior: bugs in balance display, activity visibility, optimistic
updates, or mutation recovery require reasoning across the route and multiple
adapters.

This increases the cost of future Friend and settlement changes, makes route
behavior hard to test, and weakens locality for the most recently changed
detail flow.

## Solution

Rewrite the Friend detail flow around one deep Friend detail module. The route
should own navigation and platform rendering only. The deep module should own
the Friend-pair read model, activity projection, filtering, mutation
orchestration, optimistic state transitions, cache invalidation, and recovery
semantics behind one stable read/action interface.

Keep the existing Friend detail result shape and React Query identity stable.
Retain the pair-scoped read-model adapter as the production data adapter and
retain the pure Friend detail builder as a correctness oracle until parity is
proven. The rewrite should make the implementation behind the interface deep
enough that database, cache, notification, and in-memory adapters remain
replaceable without leaking into the route.

## User Stories

1. As a Vasuli user, I want the Friend detail page to show the selected Friend's identity, so that I know whose balance I am reviewing.
2. As a Vasuli user, I want the current pair balance to retain its existing sign and copy, so that I understand who owes whom.
3. As a Vasuli user, I want shared expenses to remain visible with their amount, payer, date, group, and split amounts, so that I can verify the balance.
4. As a Vasuli user, I want pair settlements to remain visible in the activity history, so that repayments are part of the shared record.
5. As a Vasuli user, I want expense updates involving the pair to remain visible, so that important changes are not lost.
6. As a Vasuli user, I want expense deletions involving the pair to remain visible when existing visibility rules allow them, so that the history remains trustworthy.
7. As a Vasuli user, I want All, Expenses, and Updates filters to preserve their current results and ordering, so that the rewrite does not change the meaning of the page.
8. As a Vasuli user, I want activity items grouped by month as they are today, so that a long history remains scannable.
9. As a Vasuli user, I want to open a shared expense from the Friend history, so that I can inspect or edit its details.
10. As a Vasuli user, I want to delete a shared expense from the Friend history, so that I can correct an expense that should no longer exist.
11. As a Vasuli user, I want expense deletion to remove the item immediately when safe, so that the page feels responsive.
12. As a Vasuli user, I want a failed expense deletion to restore consistent Friend detail data, so that an unsuccessful action does not leave a misleading balance or history.
13. As a Vasuli user, I want to settle up with a Friend from the detail page, so that I can record repayment without leaving the flow.
14. As a Vasuli user, I want settlement direction, amount, currency, notes, and group context to remain correct, so that the recorded repayment is trustworthy.
15. As a Vasuli user, I want a failed settlement to leave the previous balance and history intact, so that transient failures are recoverable.
16. As a Vasuli user, I want to remove a Friend from the detail page, so that I can end a friendship relationship when needed.
17. As a Vasuli user, I want Friend removal to confirm before making the change, so that an accidental destructive action is avoided.
18. As a Vasuli user, I want Friend removal to update the relevant Friends data, so that returning to the Friends list does not show stale state.
19. As a Vasuli user, I want to send a reminder from the detail page, so that I can prompt a Friend about an outstanding balance.
20. As a Vasuli user, I want reminder failures to be communicated clearly, so that I know whether the action needs another attempt.
21. As a Vasuli user, I want realtime expense, split, and settlement changes to refresh this Friend detail, so that I do not need to leave and reopen the page.
22. As a Vasuli user, I want realtime refreshes to be debounced as they are today, so that a burst of database events does not cause excessive reloads.
23. As a Vasuli user, I want cached Friend detail data to remain usable while a refresh is in progress, so that navigation back to the page feels immediate.
24. As a Vasuli user, I want loading, empty, not-found, error, and retry states to remain available, so that every data state has a clear outcome.
25. As a Vasuli user, I want the page to navigate back when the selected Friend no longer exists, so that I am not left on an invalid detail route.
26. As a Vasuli user, I want the current animation, safe-area, theme, and touch behavior preserved, so that the rewrite does not regress the established mobile experience.
27. As an authenticated user, I want the Friend detail read to be scoped to my session, so that changing a client identifier cannot expose another user's data.
28. As an authenticated user, I want Friend removal, settlement, deletion, and reminder actions to enforce the same authorization rules as before, so that the rewrite does not widen access.
29. As a user with a large expense history, I want Friend detail to request only pair-relevant data, so that load time does not grow with unrelated account history.
30. As a maintainer, I want the route to depend on one stable Friend detail interface, so that changes to persistence and cache adapters remain local.
31. As a maintainer, I want the interface to expose domain-level outcomes rather than Supabase, React Query, or notification details, so that tests describe user-visible behavior.
32. As a maintainer, I want the pair balance and activity projection to have locality in one module, so that changes to Friend semantics do not require tracing the route.
33. As a maintainer, I want production adapters for the read model and mutations to be replaceable with in-memory adapters, so that workflows can be tested without network calls.
34. As a maintainer, I want the pure Friend detail builder to remain available during migration, so that the new projection can be compared against known behavior.
35. As a maintainer, I want the rewrite to remove duplicated route-level orchestration, so that the deletion test produces a materially smaller route rather than moving complexity into more shallow modules.
36. As a maintainer, I want development-only timing and outcome instrumentation at the Friend detail interface, so that performance and failure regressions can be diagnosed without logging identifiers or financial values.
37. As a maintainer, I want the module's public interface to remain stable across iOS, Android, and web, so that platform rendering does not fork domain behavior.

## Implementation Decisions

- Rewrite the Friend detail route as a thin platform-facing renderer. It may own route parameters, navigation, theme, animation, safe-area behavior, and composition of presentational elements, but it must not coordinate persistence or cross-module cache effects directly.
- Create one deep Friend detail module as the highest test seam. Its interface should provide the current `FriendDetailData`, activity filtering/grouping inputs, and domain-level commands for settlement, expense deletion, Friend removal, and reminders.
- Preserve the existing `FriendDetailData` shape, activity categories, namespaced activity identifiers, balance semantics, rounding threshold, settlement direction, date ordering, and empty-state behavior unless a compatibility defect is proven.
- Preserve the existing React Query detail key and invalidation behavior from the route's perspective. React Query may remain the delivery mechanism behind the module, but query keys and cache policy must not become part of the route interface.
- Keep the pair-scoped Friend detail read-model adapter as the production read adapter. The adapter derives session identity server-side and returns only the Friend-pair projection required by the module.
- Keep the pure Friend detail builder as a correctness oracle during the rewrite. Remove or narrow redundant client-side assembly only after parity tests pass.
- Introduce mutation adapters behind the same Friend detail module for expense deletion, settlement creation, Friend removal, reminder delivery, notification creation, and related read-model updates.
- The module must own optimistic transitions and rollback decisions. Callers should receive a domain-level success or failure outcome and must not update multiple read models themselves.
- The module must centralize invalidation of Friend detail, Friends home, Groups detail, and activity data that is affected by a successful mutation. It must preserve current freshness behavior and avoid broad invalidation when a narrower update is safe.
- Realtime subscriptions remain an infrastructure concern. The module should expose one refresh/invalidation entry point so the route does not enumerate table subscriptions or duplicate event handling.
- Preserve existing authorization behavior. Client-provided identifiers select the Friend resource only; they must not act as proof of the current user.
- Prefer one in-process seam with local-substitutable adapters. Do not create a separate module for each individual route handler unless a responsibility has independent domain meaning and a test surface.
- Keep presentational activity renderers small and data-driven. The deep module supplies already classified and ordered activity items; renderers do not parse metadata, calculate balances, or decide visibility.
- Preserve accessibility, stable interactive test identifiers, swipe behavior, confirmation prompts, loading states, retry behavior, and platform-specific rendering while moving orchestration behind the seam.
- Add development-only instrumentation at the deep module interface for read duration, mutation duration, result counts, retry status, and first-data visibility. Do not log Friend IDs, user IDs, descriptions, or monetary values.
- Do not introduce a general-purpose expense, settlement, friendship, or activity module as part of this rewrite. The scope is the Friend-pair workflow and its smallest necessary adapters.
- Do not change the Supabase schema or read-model SQL unless parity or measured performance work proves that the existing adapter cannot support the deep module.

## Testing Decisions

Tests should exercise external behavior through the single Friend detail module interface. They should not assert React Query internals, Supabase call order, component structure, private helper names, or implementation-specific state variables.

Test the following behavior through the highest seam:

- A Friend detail read returns the selected Friend, pair balance, shared expenses, settlements, and relevant activity in the existing shape.
- Positive, negative, zero, and near-zero balances preserve current semantics.
- Shared expenses include correct payer labels and current-user/Friend split amounts.
- Settlements include correct direction, amount, currency, date, notes, and group metadata.
- Expense update and deletion activity obeys pair participation and visibility rules.
- Activity filtering and monthly grouping preserve categories, ordering, and counts.
- Empty history, missing Friend, loading, read failure, and retry outcomes remain consistent.
- Successful expense deletion updates Friend detail and all affected read models through the module.
- Failed expense deletion rolls back or refetches to a consistent state.
- Successful settlement updates balance and activity with the correct direction and invalidation behavior.
- Failed settlement leaves existing state consistent and exposes a recoverable failure.
- Friend removal confirms, completes, and updates Friends data without leaving stale detail state.
- Reminder success and failure produce the existing user-visible outcomes.
- Realtime refresh enters through one module refresh seam and preserves debouncing and cache reuse.
- The production read adapter maps the pair-scoped projection to the public detail contract.
- An in-memory adapter can drive the same read and mutation workflows without network or Supabase dependencies.
- Authorization failures and mismatched identity attempts cannot return or mutate another user's Friend data.
- Development instrumentation excludes identifiers and financial values while recording useful timing and outcome data.
- The route renders the module's externally observable states consistently on iOS, Android, and web.

Prior art includes the Friend detail builder and read-model tests, Group detail
read-model and injection tests, expense and settlement service tests,
query-cache adapter tests, route error-state tests, notification-link tests,
and existing Supabase RPC/security tests. Prefer fixture-driven parity tests
for Friend-pair behavior, boundary tests for adapters, and a small number of
screen-level tests for navigation and visible state transitions.

## Out of Scope

- Redesigning the Friend detail layout, visual language, copy, or navigation.
- Changing balance rules, rounding, settlement semantics, activity visibility, or authorization policy.
- Replacing TanStack Query or introducing offline persistence.
- Rewriting Group detail, Add Expense, Friends home, or shared presentational modules.
- Creating a general-purpose domain module for expenses, settlements, friendships, notifications, or activities.
- Removing the pair-scoped read-model adapter or its security checks.
- Removing the pure Friend detail builder before parity coverage is complete.
- Changing the Supabase schema, RPC contract, or indexes without measured need.
- Deploying migrations, submitting a build, committing, or pushing changes as part of the spec.

## Further Notes

The existing pair-scoped read-model work already provides a useful seam and
should be treated as an adapter, not re-litigated. The rewrite should begin by
locking current behavior with characterization and parity fixtures, then move
mutation orchestration behind the Friend detail interface, and only afterward
thin the route and delete duplicated code.

Recommended sequence:

1. Characterize current read, activity, and mutation behavior through the existing tests.
2. Define the Friend detail module interface at the existing read-model seam and add an in-memory adapter.
3. Move read projection, filtering, and activity grouping behind the module.
4. Move settlement, deletion, Friend removal, reminder, optimistic update, and invalidation orchestration behind the module.
5. Reduce the route to rendering, navigation, platform interaction, and composition.
6. Run parity, authorization, adapter, and focused screen tests; then run the project quality suite.
7. Measure first-data visibility and mutation outcomes before removing the old orchestration.

The acceptance signal is not merely fewer lines. The deletion test should show
that removing route-level orchestration concentrates complexity inside one
deep Friend detail module with one test surface and replaceable adapters.
