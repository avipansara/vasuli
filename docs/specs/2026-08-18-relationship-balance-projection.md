# Relationship balance projection

## Status update — 2026-08-18

The authoritative relationship projection, Home parity, settle-up projection
consumption, and cross-surface freshness work described here are implemented
behind the Friend detail/projection seams. The `$1,449.12` versus `$981.62`
values below are retained as a historical regression fixture documenting the
original failure mode; they are not a current production discrepancy claim.

Remaining verification is runtime/database characterization plus mounted route
and light/dark visual checks. Do not reopen the accounting decision from this
fixture alone; first reproduce a current discrepancy against the projection
contract and its currency/scope invariants.

## Problem Statement

Users need one trustworthy view of what they owe or are owed by a Friend, but
the app currently assembles that relationship through several independent
projections. Home summaries use a Supabase read model, Friend detail uses a
different read model, shared Group balances are calculated in TypeScript, and
the settle screen recombines those values. The recent `$1,449.12` versus
`$981.62` discrepancy showed the failure mode: a Group settlement was counted
in the Direct Friend ledger and then included again through Group balances.

The result is that Home, Friend detail, and settle-up can disagree about the
same relationship. Users cannot tell whether an amount belongs to the Direct
ledger or a Group ledger, and a settlement flow can be given a projection that
does not match the ledger it is about to mutate.

## Solution

Create one relationship balance projection that is authoritative for a pair
of users. It will define, in one contract:

- the Direct Friend ledger and its balance;
- each shared Group balance, separated by Group and currency;
- the combined relationship total only when currency-compatible scopes are
  explicitly requested;
- the activity context needed to explain where the projection comes from; and
- the freshness and scope rules callers must use when rendering or settling.

Home, Friend detail, and the Friend settle flow will consume this projection
through the existing Friend detail module boundary. SQL functions, data-source
adapters, and calculation helpers remain implementation details behind that
boundary. A Group record can contribute to the relationship view, but it must
never become a Direct expense or Direct settlement.

## User Stories

1. As a user, I want Home to show the same Friend balance that Friend detail
   shows, so that I can trust the amount before opening the relationship.
2. As a user, I want Friend detail to show my Direct balance separately from
   shared Group balances, so that I know which ledger owns each amount.
3. As a user, I want every shared Group balance identified by Group name,
   currency, direction, and amount, so that I can understand what contributes
   to the relationship total.
4. As a user, I want a Group balance row to open the correct Group detail,
   so that I can inspect the full Group ledger before settling it.
5. As a user, I want a Group expense paid by a third person to remain in the
   Group context, so that it does not create a false Direct debt between me
   and the Friend.
6. As a user, I want a Group expense paid by my Friend to affect the shared
   Group projection when appropriate, so that the relationship view reflects
   the full Group calculation.
7. As a user, I want a Group expense paid by me to affect the shared Group
   projection when appropriate, so that the relationship view matches Group
   settle-up.
8. As a user, I want a Group settlement to reduce only its Group balance, so
   that paying through a Group does not alter my Direct Friend balance.
9. As a user, I want a Direct settlement to reduce only the Direct balance,
   so that a direct payment does not accidentally clear a Group debt.
10. As a user, I want the Friend settle flow to show the exact scope it will
    mutate, so that I can confirm the right kind of payment.
11. As a user, I want the combined relationship total to be clearly labeled
    as a summary, so that I do not mistake it for a new ledger.
12. As a user, I want balances in different currencies kept separate, so that
    the app never silently treats unlike amounts as one payable total.
13. As a user, I want a currency-specific total when all selected scopes share
    a currency, so that I can understand the total amount relevant to one
    payment.
14. As a user, I want the app to refuse or clearly separate a multi-currency
    settlement, so that no implicit exchange rate changes my debt.
15. As a user, I want a settled Group relationship to be represented as zero
    without inventing a Direct balance, so that settled scopes remain
    mathematically consistent.
16. As a user, I want soft-deleted expenses excluded from active balances, so
    that removed activity does not continue to change what I owe.
17. As a user, I want historical activity context to remain attributable to
    its original ledger, so that deletion or edit history is understandable.
18. As a user, I want a Friend who is not a member of a Group excluded from
    that Group's relationship projection, so that membership cannot be
    inferred merely from matching user IDs in old records.
19. As a user, I want zero-share participants excluded from a Group balance,
    so that membership alone does not imply a debt.
20. As a user, I want payer-without-split cases handled by the Group rules,
    so that incomplete split rows do not create a misleading Direct balance.
21. As a user, I want unequal, percentage, share-based, and exact splits to
    use their stored amounts, so that the relationship projection matches the
    original expense calculation.
22. As a user, I want multiple shared Groups shown independently, so that one
    Group's settlement cannot hide another Group's outstanding balance.
23. As a user, I want the latest expense, split, settlement, edit, and delete
    changes reflected after refresh, so that the projection does not remain
    stale after activity changes.
24. As a user, I want changes made on another device to refresh Home, Friend
    detail, and settle-up consistently, so that I do not act on an obsolete
    relationship amount.
25. As a user, I want an empty Direct ledger distinguished from an empty shared
    Group projection, so that I understand why a relationship has no amount.
26. As a user, I want a Group balance with no outstanding amount to follow the
    product's history policy, so that zero rows do not clutter the active view
    while remaining available when history requires them.
27. As a user, I want the projection to work in light and dark appearance, so
    that scope labels and amounts remain legible wherever I use the app.
28. As a user, I want the projection to preserve the existing sign and
    direction conventions, so that “you owe” and “you are owed” do not change
    meaning between screens.
29. As a user, I want the settle flow to use the same projection that it
    displays, so that the amount validated at confirmation matches the amount
    used by the settlement commit.
30. As a user, I want a stale projection to be refreshed or rejected before a
    settlement is recorded, so that a concurrent payment cannot make me
    over-settle.
31. As a user, I want a third-party payer's Group debt netting to remain
    visible as Group context, so that I can understand why the Friend's Group
    amount differs from a simple pair calculation.
32. As a user, I want the relationship projection to remain stable after
    sign-out, sign-in, and app restart, so that presentation state does not
    change accounting results.

## Implementation Decisions

- The existing Friend detail module boundary is the primary projection seam.
  Its detail operation will return the Direct Friend ledger, shared Group
  projections, and any explicitly requested currency-compatible combined
  totals as one relationship result.
- The projection contract will distinguish Direct records from Group records
  structurally. Callers will not infer scope from payer names, split
  membership, nullable fields, or UI labels.
- `group_id IS NULL` remains the Direct ledger marker and a non-null `group_id`
  remains the Group ledger marker. This feature does not introduce a new
  physical ledger table.
- The Direct balance will include only active, non-Group expenses and
  settlements between the current user and the Friend.
- Shared Group balances will use the complete Group balance algorithm for each
  Group, then project the Friend's resulting Group balance into the
  relationship. The calculation will require that both users are members of
  the Group and will preserve the Group's sign convention when mapping to the
  relationship direction.
- Shared Group balances will be keyed by Group and currency. A Group with
  multiple currencies will produce separate projection entries.
- Combined totals will be derived values, never persisted ledger records. They
  may be produced only for scopes with the same currency and must retain the
  underlying Direct and Group entries for display and settlement decisions.
- SQL read models and TypeScript services may be reorganized or replaced, but
  callers will depend on the projection contract rather than on a specific
  RPC shape.
- Home summaries will consume the same relationship calculation or an
  equivalent adapter proven to satisfy the same contract. No Home-specific
  balance formula may independently add Direct and Group impacts.
- Friend detail will remain pair-only for Direct activity. Group expenses and
  Group settlements may be supplied as clearly marked read-only context, but
  they cannot enter the Direct expenses collection or Direct balance.
- The Friend settle operation will consume the existing combined-settlement
  commit flow through the projection. It must validate one currency, one
  settlement direction, and the current projection before creating separate
  Direct and Group-scoped records. Group settlement ownership remains explicit
  in each allocation; this feature does not redesign the transaction or its
  idempotency behavior.
- Currency selection and conversion remain explicit. No exchange rate or
  implicit conversion will be added by this feature.
- Soft-deleted expenses are excluded from active projections according to the
  existing soft-delete policy. Historical activity keeps its original scope.
- Query invalidation will treat expenses, splits, settlements, and relevant
  Group membership changes as inputs to the relationship projection. Home,
  Friend detail, and settle-up must be invalidated from the same source of
  truth.
- The implementation should prefer one injected read-model/projection adapter
  at the Friend detail module boundary. Existing service-level data sources
  can remain behind that adapter where they are useful for characterization or
  migration compatibility.
- No unrelated UI redesign, settlement atomicity redesign, split mathematics
  change, or Group debt simplification change is part of this work.

## Testing Decisions

- The highest-value test seam is the public relationship read operation exposed
  by the Friend detail module. Tests should assert the returned projection's
  external behavior, not whether SQL, TypeScript, or a particular helper
  produced it.
- Tests will use injected read-model and Group-projection adapters or fixture
  data at that boundary so the same assertions cover Home, Friend detail, and
  settle-up consumers without duplicating ledger formulas.
- Existing balance and Group calculation tests are prior art for sign,
  rounding, stored split amounts, settlement application, deleted expense
  exclusion, and full-Group netting behavior.
- Existing Friend detail module and read-model tests are prior art for adapter
  injection, null results, activity mapping, and rejecting Group settlements
  from the Direct settle flow.
- The test suite will cover at minimum:
  - Direct expenses and Direct settlements between the pair;
  - Group expenses paid by the current user, the Friend, and a third party;
  - full-Group netting where another member changes the projected Friend
    balance;
  - Groups shared by both users and Groups visible to only one user;
  - zero-share participants and payer-without-split records;
  - unequal, percentage, share-based, and exact-amount splits;
  - multiple Groups and multiple currencies;
  - soft-deleted expenses and Group settlements;
  - zero and sub-cent balances with the existing normalization threshold;
  - matching Home, Friend detail, and settle projections for the same fixture;
  - no duplicate counting when a Group settlement is also visible in
    relationship activity;
  - stale or concurrent changes causing refresh/revalidation before commit;
  - Direct settlement rejection when a Group-scoped record is returned; and
  - empty, settled, loading, error, and refreshed projection states at the
    consumer boundary.
- A regression fixture must encode the `$1,449.12` versus `$981.62`
  discrepancy and prove that a Group settlement is included exactly once.
- If the projection is implemented partly in a Supabase RPC, add database
  characterization tests or linked-database verification for membership scope,
  soft deletion, currency grouping, and the invariant that Direct and Group
  impacts are not double-counted.
- UI tests should verify scope labels, Group navigation, disabled Direct settle
  behavior for zero balances, currency separation, and light/dark readability.

## Out of Scope

- Replacing the Group balance algorithm or debt simplification strategy.
- Introducing a new physical ledger or migrating existing financial records.
- Moving a Group debt into the Direct ledger.
- Automatic currency conversion or payment-provider integration.
- Designing or replacing the combined settlement commit transaction; the
  existing idempotent commit flow is a prerequisite consumer of this
  projection.
- Redesigning the entire Friend detail or Group detail experience.
- Changing expense split mathematics or recomputing stored split amounts.
- Restoring, purging, or changing the meaning of soft-deleted records.
- Adding new notification, reminder, or social features.

## Further Notes

- This work is the recommended follow-up to the combined settlement commit:
  settlement correctness depends on the projection used to decide what is
  outstanding and which scopes are eligible.
- The deletion test for this architecture item is: removing screen-specific
  balance assembly should leave one relationship projection contract that can
  serve Home, Friend detail, and settle-up without changing accounting rules.
- The initial implementation should preserve compatibility with current
  callers while the projection contract is introduced, then remove mixed-scope
  compatibility paths after parity is demonstrated.
- The spec intentionally avoids prescribing whether the final projection is a
  single RPC, a composed service, or an adapter over both. The contract and
  accounting invariants are the durable decisions.
