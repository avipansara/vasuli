---
status: accepted
date: 2026-08-18
decision-makers: Varun Yadav, Vasuli maintainers
consulted: Codex synthesis of the Vasuli settlement code and public Splitwise documentation
informed: Future Vasuli implementation agents and maintainers
---

# Adopt Splitwise-style cross-scope settlement operations

## Context and Problem Statement

Vasuli calculates a relationship balance from two scopes:

- Direct expenses and direct settlements between two friends.
- Group expenses and group settlements for groups shared by those friends.

The Friend detail screen needs to let a user settle the net relationship
balance across both scopes. The current settlement model records payments in
one scope at a time and rejects opposite-direction scopes. For example:

- A friend owes the user $15 in direct expenses.
- The user owes the friend $8 in a shared group.
- The net friendship balance is that the friend owes the user $7.

Showing `$7` while recording only a direct `$7` payment would leave the group
ledger incorrect. Recording the direct `$15` instead does not provide the
expected net-settlement experience.

Splitwise documents a similar user-facing behavior: a friendship payment can
clear balances across shared groups and non-group expenses by creating
balancing entries in the relevant scopes. It also supports moving group debt
into the personal friendship ledger through expense simplification.

References:

- [Splitwise: fully settled friendship balances](https://kb.splitwise.com/balances-and-expenses/what-does-it-mean-if-im-fully-settled-up-with-a-friend)
- [Splitwise: friendship and group balances](https://feedback.splitwise.com/knowledgebase/articles/117962)

## Decision Drivers

- Friend detail must settle the net balance users see.
- Group detail must remain strictly group-scoped.
- Payments and non-cash balance reclassifications must be distinguishable.
- All related writes must be atomic and retry-safe.
- Existing expenses, settlements, relationship projections, and group history
  must remain compatible.
- Group members must be able to understand changes to group balances.
- The implementation must remain narrower than a full double-entry accounting
  system.
- Deleted groups must preserve historical financial records and remain
  restorable.

## Considered Options

* Direct-only settlement from Friend detail
* Generic double-entry accounting ledger
* Atomic settlement operation with explicit scope-transfer records

## Decision Outcome

Chosen option: **Atomic settlement operation with explicit scope-transfer
records**.

Friend detail always creates an `all_balances` settlement operation. Group
detail creates a `group` settlement operation. An all-balances operation may
contain non-cash scope transfers followed by one actual payment:

```text
Direct balance: friend owes user $15
Group balance:  user owes friend $8

Scope transfer: move $8 of group debt into friendship ledger
Net balance:    friend owes user $7
Actual payment: friend pays user $7
Final state:    direct $0, group $0
```

The exact table names and implementation details in this ADR are the chosen
contract for the first implementation; they are not claims about Splitwise's
private schema.

### Consequences

* Good: Friend detail can settle the displayed net balance without corrupting
  group balances.
* Good: Group detail remains predictable and cannot silently settle direct or
  other-group balances.
* Superseded: The initial design applied scope transfers before partial
  payments. The implemented contract instead reserves transfers for full-net
  and zero-net operations, as recorded in the 2026-08-19 clarification below.
* Good: Zero-net relationships can be cleared with scope transfers and no cash
  payment.
* Good: Payment rows and scope-transfer rows provide an auditable history.
* Good: Existing settlement rows remain readable as legacy actual payments.
* Bad: Balance projections, activities, and settlement RPCs must understand a
  second financial event type in addition to payments.
* Bad: Group activity must explain scope transfers to all affected members.
* Bad: Reversal and deletion must treat one settlement operation as a unit.
* Neutral: Each currency remains independent; USD is the only executable
  settlement currency in the first implementation.

## Implementation Plan

* **Affected paths**:
  * `supabase/migrations/` for settlement operation and scope-transfer tables,
    constraints, indexes, RLS, and atomic RPCs.
  * `services/friend-detail-service.ts` and the relationship read-model seams
    for transfer-aware direct, group, and net balances.
  * `services/friend-settlement-allocation.ts`,
    `services/combined-settlement-service.ts`, and
    `services/settlement-service.ts` for cent-based plans, operation receipts,
    idempotency, and legacy payment compatibility.
  * `services/group-detail-read-model.ts` and `services/group-service.ts` for
    group-scoped balances, activity, and reversible group lifecycle behavior.
  * Friend detail and Friend settle-up routes for all-balances mode, partial
    payment caps, zero-net clearing, confirmation copy, and receipt handling.
  * Group detail and Group settle-up routes for group-only mode.
  * Friend/group activity components and query invalidation/realtime seams for
    payment versus scope-transfer presentation.
  * Existing settlement, relationship, group read-model, receipt-effect, and
    UI/controller test suites.
* **Dependencies**: No new runtime package dependencies.
* **Patterns to follow**:
  * Use the existing Supabase `SECURITY DEFINER` RPC pattern for atomic writes.
  * Preserve the existing payment-intent idempotency and stale-balance checks.
  * Keep business rules in services, pure allocation helpers, and database
    functions rather than embedding them in route components.
  * Use the existing relationship projection as the single balance source for
    Home and Friend detail.
  * Use existing group membership and RLS helpers for authorization.
* **Patterns to avoid**:
  * Do not record a scope transfer as if it were cash.
  * Do not settle group balances by inserting direct-only payment rows.
  * Do not net different currencies.
  * Do not trust client-provided allocations without recomputing and validating
    them in the RPC transaction.
  * Do not hard-delete groups or cascade away historical expenses, payments,
    or scope transfers during normal deletion.
  * Do not introduce a parallel balance calculation for Home or Friend detail.
* **Configuration**: No new environment variables or feature flags. The
  migration is applied to the Dev Supabase project first; production remains
  untouched until the implementation is verified and explicitly approved.
* **Migration steps**:
  1. Add the operation parent and scope-transfer tables with RLS and indexes.
  2. Add operation references to actual settlement rows without rewriting
     existing payments.
  3. Update read-model RPCs and client projections to include transfers.
  4. Add the all-balances RPC while preserving the group settlement path.
  5. Update Friend detail and settle-up to remove direct-only fallback.
  6. Verify existing and new flows in Dev, then document production rollout.
  7. Keep group soft deletion as reversible metadata on `groups`; retain
     `group_members` and all financial rows for restoration.

### Data contracts

The first implementation will use these conceptual records:

* `settlement_operations`: one user action, with actor, friend, optional group,
  mode (`all_balances` or `group`), currency, expected balance, payment amount,
  payment intent, timestamp, and status.
* `settlement_scope_transfers`: a non-cash reclassification linked to an
  operation, with group, pair, currency, signed group balance delta, note, and
  timestamp. The direct-ledger delta is the exact opposite.
* `settlements.operation_id`: optional link from an actual payment to its
  operation. Existing rows without this link remain valid legacy payments.

An all-balances operation may create zero or more scope transfers and zero or
one actual payment. A zero-net operation creates transfers but no payment.

### Verification

- [ ] Direct-only Friend detail settlement still records the correct payment.
- [ ] Same-direction direct and group balances settle to zero through one
  operation.
- [ ] Opposite-direction balances, such as direct `+15` and group `-8`, create
  the required scope transfer and one net `$7` payment.
- [x] A partial payment changes only the Direct or same-direction Group scopes
  receiving cash allocations and leaves opposing balances unchanged.
- [ ] A zero-net relationship can clear scope balances without creating a cash
  payment.
- [ ] Group detail settlement changes only the selected group.
- [ ] Different currencies cannot be combined in one operation.
- [ ] Overpayments and stale expected balances are rejected in the database
  transaction.
- [ ] Retrying one payment intent returns the original receipt and creates no
  duplicate payment or transfer rows.
- [ ] Authorization requires an accepted friendship and shared group
  membership for every affected scope.
- [ ] Group activity distinguishes cash payments from scope transfers.
- [ ] Home, Friend detail, and Group detail agree after every operation.
- [ ] Soft-deleting a group hides it from active lists while preserving members,
  expenses, payments, transfers, and activity.
- [ ] Restoring a deleted group makes its original history available again.
- [ ] Focused settlement and relationship tests pass.
- [ ] Supabase migration lint passes with no schema errors.
- [ ] `npm run lint`, `npm run typecheck:supabase`, and `npm test` pass, apart
  from any pre-existing unrelated failures documented in the handoff.

## Pros and Cons of the Options

### Direct-only settlement from Friend detail

Keep Friend detail limited to the direct ledger and require group settlement
from Group detail.

* Good, because it requires minimal schema and RPC changes.
* Good, because group visibility and accounting remain simple.
* Bad, because the Friend detail action does not settle the net balance shown to
  the user.
* Bad, because opposite direct/group balances produce confusing amounts and
  require users to understand internal scopes.
* Bad, because it does not match the agreed Splitwise-style behavior.

### Generic double-entry accounting ledger

Replace or wrap expenses, payments, groups, and transfers in a general journal
and balanced-entry model.

* Good, because all future accounting operations could use one mathematically
  rigorous model.
* Good, because reversals, audit trails, and new transaction types would have a
  common foundation.
* Bad, because it would require a broad migration of mature expense, group,
  and settlement read models.
* Bad, because it is larger than the current product requirement and increases
  implementation and verification risk.

### Atomic settlement operation with scope-transfer records

Add an explicit operation parent and linked non-cash transfers while retaining
the existing expense and payment model.

* Good, because it directly models the required user behavior.
* Good, because the migration is additive and existing payments remain valid.
* Good, because the transaction boundary, retry identity, and audit history
  are explicit.
* Bad, because every balance projection and relevant activity surface must learn
  about scope transfers.
* Bad, because the system must define and test reversal semantics for linked
  payment and transfer records.

## More Information

### Partial-payment clarification — 2026-08-19

The implemented contract reserves scope transfers for full-net and zero-net
operations. A partial cash payment reduces only the Direct or same-direction
Group scopes that receive a cash allocation; it does not reclassify opposing
balances. This clarification supersedes the earlier consequence and verification
example that described applying scope transfers before a partial payment.

The original implementation-path list is historical. The current public client
boundary is `settlementModule` in `services/settlement-service.ts`; the current
database command boundaries are `commit_settlement_operation`,
`commit_zero_net_settlement_operation`, and `reverse_settlement_operation`.

### Implementation and review follow-up — 2026-08-18

This decision is accepted and is now implemented through the combined
SettlementOperation flow, explicit SettlementScopeTransfer records, and the
authoritative relationship-projection work. The `$1,449.12` versus `$981.62`
values in the context are a historical regression fixture for the original
double-counting failure mode, not a current production discrepancy claim.
Current discrepancies must be reproduced against the relationship projection
contract, currency rules, and scope-transfer invariants before reopening this
decision.

Group detail mutation controllers consume the accepted settlement operation
interfaces; they do not create a second settlement model or alter the chosen
scope-transfer semantics. Remaining implementation verification is tracked in
the relationship-projection and Group-detail mutation specs, including runtime
database characterization and mounted route/visual checks.

Implementation tickets should reference this ADR. Code entry points
implementing the operation and read-model changes should include a lightweight
`ADR-0001` reference.

Revisit this decision if Vasuli adds non-pair debt simplification, external
payment providers, non-USD settlement execution, or requirements for a general
ledger covering every financial event.
