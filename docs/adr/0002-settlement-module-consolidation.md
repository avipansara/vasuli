---
status: accepted
date: 2026-08-18
decision-makers: Vasuli maintainers
---

# Consolidate settlement operations into one deep module

We consolidated six settlement-related modules into a single deep `settlementModule` inside `services/settlement-service.ts`. The module exposes three public operation methods (`commit`, `reverse`, `preview`) and owns settlement-operation rules, cache invalidation, and activity logging internally.

## Context

The settlement flow originally spanned six modules: `combined-settlement-service.ts` (orchestrator), `friend-settlement-allocation.ts` (pure plan builder), `settlement-service.ts` (CRUD + RPC), `settlement-reversal.ts` (UI callback wrapper), `combined-settlement-receipt-effects.ts` (cross-domain cache invalidation), and `combined-settlement-errors.ts` (error mapping). Routes had to remember to call effects after commit, and the plan was built twice (once for preview, once for commit).

## Decision

Absorb all six into `settlement-service.ts` as a single deep operation module. Routes now import `settlementModule` and call one of three methods. Post-commit cache invalidation is automatic — routes pass data, not callbacks. The low-level CRUD and RPC persistence methods remain as a separate `settlementService` export for Group settlement, read-model, and compatibility callers that do not use the combined operation flow.

The decision applies to the combined `SettlementOperation` flow. It does not require every settlement read or legacy single-`Settlement` write to pass through the three-method operation interface. `settlementService` is the persistence-facing surface; `settlementModule` is the domain-operation surface. Feature-specific mutation controllers may consume `settlementModule`, but they must not duplicate its operation validation, error mapping, receipt mapping, or persistence rules.

## Trade-offs

- **Depth over separation**: The module is intentionally large, but the
  operation interface is three methods. Splitting it would spread one lifecycle
  across several shallow files again.
- **Testability via interface**: Tests hit `settlementModule.commit()` directly, exercising plan building, persistence, error mapping, and cache effects in one call. The old approach required mocking five modules to test one flow.
- **Locality**: Bugs in the settlement flow now concentrate in one file. The old approach scattered logic across modules, making it hard to trace a commit from route to RPC.

## Consequences

- `settlement-service.test.ts` is comprehensive and intentionally exercises one
  public operation interface rather than several shallow wrappers.
- Routes no longer need to remember to call effects after commit. Forgetting is no longer possible.
- The `queryClient` is injected as an adapter, keeping the module stateless and testable.

## Governed boundary

- **Affected paths:** `services/settlement-service.ts`,
  `services/settlement-service.test.ts`, Friend settle-up routes, and mutation
  controllers that reverse a settlement operation.
- **Follow:** Call `settlementModule.preview`, `commit`, or `reverse` with data
  and injected adapters; keep allocation, error mapping, receipt mapping, and
  post-commit effects behind that boundary.
- **Avoid:** Do not recreate route-specific settlement orchestrators, duplicate
  the preview plan in a screen, or require callers to remember receipt effects.
- **Dependencies and configuration:** This decision adds no runtime dependency,
  environment variable, or feature flag.

## Verification

- [x] `settlementModule` exposes `commit`, `reverse`, and `preview` for the combined operation flow.
- [x] Friend and Group routes use `settlementModule` for combined commits and operation reversals.
- [x] The legacy combined-settlement orchestrator, allocator, reversal wrapper, receipt-effects module, and error module were removed.
- [x] `settlementModule.commit()` applies relationship and Group cache effects and activity logging after a successful persistence call.
- [x] Preview and commit share `buildCombinedSettlementPlan()`.
- [x] Focused verification passes in `services/settlement-service.test.ts`.
- [x] `git diff --check` passes for the consolidation changes.

## Revisit Triggers

Reconsider this decision only when one of these conditions becomes real:

- The persistence-facing `settlementService` surface needs a different lifecycle, dependency set, or error contract from the operation module.
- Receipt effects require independent retries, durable delivery, or transactional coordination that cannot remain a post-commit module effect.
- The three-method `settlementModule` interface no longer provides locality for the combined operation, such as a second independent operation family sharing only implementation details.

If a trigger occurs, update or supersede this ADR with the affected callers, preserved SettlementOperation invariants, and interface-level verification before splitting the module.

## More Information

### Relationship-projection and Group-detail review follow-up — 2026-08-18

The implementation review identified relationship projection, freshness,
settlement-module depth, and
Group-detail mutation depth as separate opportunities. Subsequent work closed
the relationship-projection and Group-detail mutation seams at the service/test
level. The historical `$1,449.12` versus `$981.62` example belongs to the
relationship-projection regression fixture; it is not a current discrepancy
unless reproduced against the authoritative projection contract.

The Group detail mutation controller is a consumer of this ADR’s
`settlementModule.reverse` interface. It does not reopen or split the accepted
cross-scope settlement decision. Further adapter extraction is optional and
must preserve the public `commit`, `reverse`, and `preview` contract unless a
revisit trigger below is met.

Verification references:

- `docs/specs/2026-08-18-relationship-balance-projection.md`
- `docs/specs/2026-08-18-group-detail-mutation-module.md`
- `services/settlement-service.test.ts`

The canonical scope-transfer sign convention and settlement RPC boundary are
recorded separately in [ADR-0003](0003-canonical-settlement-balance-signs-and-rpc-boundary.md).
