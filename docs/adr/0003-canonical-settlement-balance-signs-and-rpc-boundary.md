---
status: accepted
date: 2026-08-18
decision-makers: Varun Yadav, Vasuli maintainers
consulted: Codex synthesis of the deployed Supabase RPC definitions, live settlement data, and settlement code
informed: Future Vasuli implementation agents and maintainers
---

# Adopt canonical settlement balance signs and one public commit RPC boundary

## Context and Problem Statement

Vasuli represents a relationship using direct-ledger balances, Group balances,
and non-cash scope transfers. A scope transfer changes the Group balance and
must apply the inverse change to the direct balance. The meaning of that change
must be identical in relationship projections, settlement previews, commit
validation, and reversals.

The deployed development project exposed a concrete failure. The app showed a
direct balance of `-30`, a Group balance of `+20`, and a net balance of `-10`.
It previewed a `$5` payment from the current user to the friend, but the
deployed commit RPC rejected it with
`SETTLEMENT_ALLOCATION_DIRECTION_INVALID`.

Inspection of the deployed functions showed two problems:

1. `get_friend_home_relationships` orients transfer deltas using the transfer
   participants, while the commit path orients them using the settlement
   operation actor/friend relationship.
2. The deployed commit path still delegates through three layers:
   `commit_settlement_operation` → `commit_settlement_operation_internal` →
   `commit_combined_settlement`.

These separate interpretations and layers allow the read model and write
validation to disagree. The existing cross-scope settlement decision in
[ADR-0001](0001-cross-scope-settlement-operations.md) establishes why scope
transfers exist; this ADR establishes how their signs are interpreted and how
the database command boundary is owned.

## Decision Drivers

* The user-visible balance direction must match the server-accepted settlement
  direction.
* Scope transfers must remain auditable, non-cash records rather than being
  hidden in payment rows.
* Commit validation and persistence must remain atomic and retry-safe.
* Existing settlement operations, payments, and scope transfers must remain
  readable and compatible.
* The deployed function definition, not an unapplied local migration, is the
  authority during rollout verification.
* Future agents need one explicit invariant instead of several sign rules
  inferred from individual queries.

## Considered Options

* Keep the current projection and RPC layers and patch individual failures.
* Make the client projection authoritative and weaken server validation.
* Define one canonical transfer-sign contract and consolidate the public commit
  boundary while keeping reversal and CRUD separate.
* Replace the settlement model with a general-purpose double-entry ledger.

## Decision Outcome

Chosen option: **Define one canonical transfer-sign contract and consolidate the
public commit boundary while keeping reversal and CRUD separate.**

The canonical invariant is:

> `signedGroupBalanceDelta` is the change to the current user’s Group balance.

For a current-user Group balance of `+20`, a transfer with delta `-20`
produces a projected Group balance of `0` and applies an inverse `+20` change
to the direct balance. Transfer signs must be oriented by the settlement
operation’s actor/friend relationship when a projection needs to determine the
current user’s perspective.

The system will have one public settlement-commit RPC boundary. Private
database helpers may remain behind it, but authorization, current-balance
validation, allocation and transfer validation, idempotent operation creation,
persistence, and receipt construction must have one owner.

`reverse_settlement_operation` remains a separate command because reversal has
different lifecycle and authorization rules. Low-level settlement CRUD remains
separate from domain commands. Zero-net transfer-only commits may share the
commit boundary if their invariants are compatible; otherwise they may retain a
separate public entry point but must share canonical validation and sign rules.

### Consequences

* Good: Home, Friend detail, preview, commit, and reversal can agree on one
  balance direction.
* Good: A valid partial mixed-scope settlement is no longer rejected because a
  projection and RPC disagree.
* Good: Commit idempotency and transaction ownership become easier to reason
  about and verify.
* Good: Scope transfers remain explicit and auditable.
* Bad: The rollout requires additive migrations and live verification against
  the deployed function definitions.
* Bad: Existing legacy RPC layers must remain temporarily for compatibility
  until all consumers are migrated and verified.
* Neutral: This does not require a general double-entry accounting system.

## Implementation Plan

* **Affected paths**:
  * `supabase/migrations/` for the corrected relationship projection, shared
    settlement validation, commit boundary, and eventual legacy cleanup.
  * `services/settlement-service.ts` and its tests for the public module
    contract, preview/commit agreement, typed errors, and receipts.
  * `services/friend-detail-service.ts`, relationship projection services, and
    query seams for Home/Friend detail consistency.
  * Friend settlement route tests and cross-surface integration tests for
    partial, full, zero-net, and reversal flows.
* **Dependencies**: No new runtime dependencies.
* **Patterns to follow**:
  * Use `SECURITY DEFINER` RPCs with explicit `search_path` for atomic writes.
  * Preserve payment-intent idempotency and stale-balance validation.
  * Keep domain rules in the settlement module and database command boundary,
    not in route-specific callbacks.
  * Treat the deployed Supabase function definition and migration history as
    the production verification source of truth.
  * Use the existing fake RPC and query-client test seams before adding new
    abstractions.
* **Patterns to avoid**:
  * Do not derive transfer sign from `fromUserId` alone when projecting a
    relationship.
  * Do not weaken server validation to accommodate an incorrect client
    projection.
  * Do not maintain independent sign or balance formulas in Home, Friend
    detail, preview, commit, and reversal.
  * Do not rewrite already-applied migrations or delete historical financial
    records.
  * Do not merge reversal and CRUD into a general-purpose settlement RPC.
* **Configuration**: No new environment variables or feature flags.
* **Migration steps**:
  1. Add regression coverage for the verified direct `-30`, Group `+20`,
     transfer `-20`, partial `$5` scenario.
  2. Correct the deployed relationship projection using an additive migration
     and verify Home/Friend detail direction.
  3. Introduce the consolidated commit implementation while preserving the
     current public contract and idempotency behavior.
  4. Migrate client and test consumers to the canonical public boundary.
  5. Verify positive-amount, zero-net, full-net, partial, and reversal flows
     against the development project.
  6. Revoke or remove obsolete functions only after live consumer and migration
     verification confirms they are no longer required.

### Verification

Status note — 2026-08-19: Local service coverage verifies canonical transfer
planning, Home/Friend projection parity, zero-net transfer payloads, explicit
RPC migration contracts, and repeated reversal receipt mapping. Authenticated
database-flow evidence for balance mutation, retry contention, reversal
projections, and cross-surface refresh is still required before these
verification boxes are checked.

- [ ] The live projection and commit path agree on the sign of every scope
  transfer.
- [ ] The direct `-30`, Group `+20`, transfer `-20`, partial `$5` scenario
  previews and commits with the correct direction.
- [ ] Opposite-direction and same-direction partial settlements preserve the
  correct remaining balances.
- [ ] Full-net and zero-net operations neutralize Group scopes without
  double-counting the direct ledger.
- [ ] Reversal restores the pre-operation projection for payments and transfers.
- [ ] Reusing a payment intent returns the original receipt; changed details
  produce the existing typed conflict.
- [ ] Home and Friend detail return matching direct, Group, total, and
  settleable balances for the same fixture.
- [ ] The live public function definitions and migration history match the
  intended rollout before legacy functions are removed.
- [ ] The repository settlement tests, type checks, lint, and precommit checks
  pass.

## More Information

### Implementation follow-up — 2026-08-19

The positive settlement path now has one authoritative public
`commit_settlement_operation` implementation. Zero-net transfer-only commits
retain `commit_zero_net_settlement_operation` because they contain no cash
allocation but share the same sign, authorization, idempotency, and transfer
contracts. Reversal remains a separate command. The obsolete internal and
combined positive commit functions have been retired through additive
migrations.

Local migration-contract and settlement-module tests cover this topology. The
unchecked verification items above intentionally remain as the evidence needed
from authenticated database-flow and cross-surface rollout checks.

Related records:

* [ADR-0001 — Cross-scope settlement operations](0001-cross-scope-settlement-operations.md)
* [ADR-0002 — Settlement module consolidation](0002-settlement-module-consolidation.md)

The initial production diagnosis was verified against the deployed Supabase
function definitions and live rows in the development project. The local SQL
migrations were used for comparison, not as proof of deployed behavior.

Revisit this ADR if the project adopts a general ledger, if reversal becomes a
variant of the commit lifecycle rather than a separate command, or if the
settlement operation interface is split into multiple independent domain
operation families.
