# Deepen the Group detail mutation module

## Status update — 2026-08-18

The Group detail route now consumes one public
`groupDetailMutationController` for Expense deletion, settlement reversal,
GroupMember lifecycle changes, Friend requests, and Group deletion. The
operation-specific implementations remain internal seams with replaceable
dependencies and focused tests.

The architecture review’s Group-detail mutation finding should not be reopened
as an unstarted problem. Remaining work is mounted route-level testing and
manual loading/empty/error/disabled, multi-currency, light, and dark-state
verification. Multi-member addition uses compensating cleanup if a later
membership insert fails; this is not a database transaction and should be
revisited if true atomicity becomes necessary.

## Problem Statement

Group detail users can inspect a Group, manage GroupMember records, delete
Expenses, reverse SettlementScopeTransfers, and remove a Group. The screen
works, but the Group detail route currently owns the mutation policy, service
calls, optimistic cache changes, rollback behavior, notifications, Activity
creation, alerts, and navigation alongside rendering, gestures, animations,
search, and tab state.

The Group detail read model is already a useful seam: it loads the Group,
Expenses, GroupMember records, Settlements, SettlementScopeTransfers,
friendship state, and balances in one result. The mutation side has no
equivalent seam. Understanding or testing one mutation requires mounting or
reasoning through a large route and several unrelated presentation concerns.

This creates concrete risks:

- failed Expense deletion can leave Group detail and Home caches inconsistent;
- notification or Activity failures are mixed with mutation success handling;
- Group deletion, GroupMember removal, and settlement reversal each implement
  their own guard, refresh, and error behavior;
- a new mutation can update the read model but omit a related Home, Group list,
  Friend, or Activity cache;
- route tests cannot exercise mutation policy through one stable interface.

## Solution

Deepen Group detail mutation behavior behind one mutation module/controller.
The module accepts the current Group detail state and operation data, applies
the domain guards, delegates persistence and side effects through replaceable
adapters, reconciles the Group detail read model and related caches, and
returns an operation result or typed failure.

The Group detail route remains responsible for rendering, gestures, local
modal state, alerts, and navigation. The existing Group detail read model
remains the read seam. Settlement operation reversal continues to use
`settlementModule.reverse`; this spec does not change the settlement ADR or
SettlementOperation semantics.

## User Stories

1. As a GroupMember, I want to delete an Expense from Group detail, so that the
   Expense no longer affects active Group balances.
2. As a GroupMember, I want a failed Expense deletion to restore the previous
   Group detail state, so that a failed operation does not hide valid data.
3. As a GroupMember, I want a successful Expense deletion to update Group
   detail and Friends Home consistently, so that related balances do not drift.
4. As a GroupMember, I want deletion Activity to remain recorded, so that the
   Group history explains what happened.
5. As a GroupMember, I want notification failure not to undo a successful
   Expense deletion, so that delivery problems do not corrupt the mutation.
6. As a GroupMember, I want to add one or more Users to a Group, so that the
   right people can participate in the Group Ledger.
7. As a Group administrator, I want successful GroupMember additions to create
   the appropriate Activity, so that membership history is auditable.
8. As a Group administrator, I want newly added GroupMembers to receive a
   notification when possible, so that they know they were added.
9. As a Group administrator, I want notification failure not to make a
   successful membership change appear failed, so that the Group state remains
   authoritative.
10. As a User, I want to send a Friend request from Group detail, so that I can
    connect with another GroupMember without leaving the Group.
11. As a User, I want the Friend request state to update immediately after a
    successful request, so that I do not submit it twice.
12. As a Group administrator, I want to remove a GroupMember only when their
    Group balance is Settled, so that outstanding Group Ledger records are not
    orphaned.
13. As a Group administrator, I want removal to fail with a clear reason when
    the GroupMember has an outstanding Balance, so that I know what must happen
    first.
14. As a Group administrator, I want a Group to be removable only when all
    Group balances are Settled, so that financial history remains coherent.
15. As a Group administrator, I want Group deletion to preserve historical
    Expenses, Settlements, and SettlementScopeTransfers, so that the Group
    Ledger remains auditable.
16. As a GroupMember, I want a deleted Group removed from active Group lists,
    so that normal navigation shows only active Groups.
17. As a GroupMember, I want to reverse an eligible SettlementScopeTransfer
    from Group history, so that the affected balances are restored.
18. As a GroupMember, I want an ineligible or already reversed transfer to
    remain unchanged, so that history cannot be reversed twice.
19. As a GroupMember, I want settlement reversal to validate the current
    relationship Balance, so that a stale screen cannot overwrite a newer
    financial state.
20. As a GroupMember, I want successful reversal to refresh Group detail,
    Friends Home, Friend detail, and affected Group lists, so that every visible
    scope reflects the restored Balance.
21. As a GroupMember, I want realtime Group changes to refresh the same Group
    detail read model used after a local mutation, so that local and remote
    changes converge.
22. As a GroupMember, I want focus refresh to preserve current mutation state,
    so that returning to the screen does not reintroduce stale data.
23. As a User, I want loading, empty, error, disabled, and in-progress states
    to remain visible during Group mutations, so that I understand whether an
    operation is still running.
24. As a User, I want all Group mutation controls to remain accessible in light
    and dark appearance, so that state and errors are legible.
25. As a maintainer, I want Group mutation policy tested through one stable
    module interface, so that changes do not require mounting the full route.
26. As a maintainer, I want the route to depend on Group detail mutation
    outcomes rather than persistence details, so that cache and notification
    changes remain local to the mutation module.
27. As a maintainer, I want SettlementOperation reversal to remain delegated to
    the established settlement module, so that Group detail does not duplicate
    settlement rules.

## Implementation Decisions

- Introduce one Group detail mutation module/controller as the highest seam for
  Group detail mutation policy. The route calls this seam and remains focused
  on presentation, gestures, navigation, alerts, and local display state.
- Keep the existing Group detail read model as the read seam. Mutations update
  or invalidate that read model rather than introducing a second Group balance
  calculation.
- The mutation seam covers Expense deletion, GroupMember addition,
  GroupMember removal, Friend request creation, Group deletion, and
  SettlementScopeTransfer reversal.
- Expense deletion remains a soft delete. The operation must preserve the
  Expense and ExpenseSplit history, remove the Expense from active Group
  projections, and preserve the existing positive-participant visibility
  rules for deletion Activity.
- Expense deletion uses optimistic Group detail and Friends Home updates only
  when the existing cache contains enough data to make the update safely. It
  captures a rollback snapshot before mutation and restores it on failure.
- GroupMember addition remains an atomic membership mutation from the caller's
  perspective. Activity creation and notification delivery occur after the
  membership succeeds; notification failure is reported diagnostically and
  does not roll back membership.
- GroupMember removal must reuse the existing Group Balance settled guard and
  must not remove a User with an outstanding Group Balance.
- Group deletion must reuse the existing all-members-settled guard and retain
  historical financial records through the existing Group soft-delete policy.
- Friend request creation may update the cached friendship state optimistically
  after successful persistence. It must not invent a Friendship status that the
  persistence operation rejected.
- SettlementScopeTransfer reversal delegates operation reversal to
  `settlementModule.reverse`, passing data such as operation identity,
  expected relationship Balance, current User identity, Friend identity, and
  the query cache adapter. Group detail must not reimplement reversal
  validation or receipt mapping.
- Cache effects are owned by the mutation module. The module must coordinate
  Group detail, Group list, Friends Home, Friend detail, and Activity invalidation
  or targeted updates according to the affected mutation.
- Persistence, Activity, notification, and cache dependencies must be
  replaceable at the mutation seam so tests can exercise external behavior
  without a mounted React Native route or live notification delivery.
- Side effects that are not part of the authoritative mutation, such as push
  notification delivery, must not turn a successful mutation into a failed
  mutation.
- Error results must preserve the existing user-visible behavior while giving
  the route enough information to choose an alert, retry state, or navigation
  response.
- The module must preserve existing realtime and focus-refresh behavior and
  must not add a parallel Group balance formula.
- The implementation must not split or redesign the accepted settlement
  operation module. The Group detail mutation module is a consumer of
  `settlementModule`, not an alternative settlement implementation.

## Testing Decisions

- Good tests assert external behavior through the Group detail mutation seam:
  authoritative persistence calls, returned results or failures, cache
  reconciliation, rollback, Activity behavior, notification isolation, and
  settlement delegation. They must not assert route helper order or individual
  React rendering details.
- Test Expense deletion success, rollback after persistence failure, rollback
  after a side-effect failure where appropriate, active read-model removal,
  Friends Home reconciliation, deletion Activity, and positive-participant
  notification behavior.
- Test GroupMember addition success, multi-User addition, Activity creation,
  notification delivery, and notification failure isolation.
- Test GroupMember removal for Settled and outstanding Balances, including the
  refusal path and unchanged read-model state.
- Test Friend request success, rejected persistence, and cached Friendship
  status behavior.
- Test Group deletion for Settled and outstanding Group balances, preservation
  of financial history through the existing soft-delete operation, Group list
  invalidation, and failure recovery.
- Test SettlementScopeTransfer reversal delegation, stale-Balance handling,
  already-reversed protection, affected Group refresh, and relationship cache
  invalidation.
- Test mutation-specific cache effects through the existing query cache adapter
  seam or an equivalent injected cache substitute. Verify that unrelated
  caches are not invalidated unnecessarily where the current behavior promises
  narrower updates.
- Test realtime and focus refresh convergence after each mutation category
  through the Group detail read model, without requiring a mounted route for
  every case.
- Add route-level tests only for the smallest presentation contract: mutation
  loading and disabled state, alert selection, navigation after Group deletion,
  and accessibility state on important controls.
- Prior art includes the existing Group detail read-model builder and tests,
  Group detail data-source injection tests, Group expense optimistic cache
  helpers, settlement module interface tests, and Friend detail mutation/cache
  tests. Reuse their fixture and adapter patterns.
- Verify the focused mutation tests, Group detail read-model tests, settlement
  tests, lint, Supabase function type checking, and the full test suite before
  handoff.

## Out of Scope

- Redesigning the Group detail visual experience, information architecture,
  navigation, gestures, animations, or theme language.
- Replacing the existing Group detail read model or changing Group balance
  mathematics.
- Changing Expense split mathematics, Settlement semantics, or
  SettlementOperation atomicity and idempotency.
- Creating a new physical ledger, SettlementOperation table, or database
  transaction for the mutation module.
- Adding restore controls for deleted Expenses or Groups.
- Adding a notification delivery queue, retry system, or push-provider change.
- Refactoring Friends Home, Friend detail, or Group settle-up beyond the cache
  effects required to preserve cross-surface consistency.
- Splitting the accepted settlement module solely because its implementation
  file is large.
- Replacing all route-level UI tests with a new end-to-end device harness.

## Further Notes

- The current Group detail route is a shallow seam on the mutation side even
  though the read model is already deep enough to reuse. The deletion test is
  to remove the route's mutation orchestration while leaving the screen's
  rendering and navigation behavior intact.
- The first implementation slice should characterize Expense deletion because
  it combines financial state, optimistic cache behavior, rollback, and
  multiple surfaces. SettlementScopeTransfer reversal follows as the second
  slice because it adds stale-Balance handling and settlement delegation.
- The Group detail mutation module should be introduced incrementally. Preserve
  the current route behavior while moving one mutation category at a time,
  keeping the existing read-model and cache helper tests green.
- The accepted settlement-module ADR remains governing context for reversal:
  Group detail passes operation data to `settlementModule.reverse` and does not
  own settlement persistence or error mapping.
