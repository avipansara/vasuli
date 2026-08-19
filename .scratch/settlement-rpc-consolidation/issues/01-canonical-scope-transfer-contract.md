# 01 — Lock the canonical scope-transfer contract

**What to build:** A single executable contract defines how scope-transfer deltas affect the current user’s Group and direct balances, so projections and settlement commands can be verified against the same relationship fixture.

**Blocked by:** None — can start immediately

**Status:** complete

- [x] Document the current-user-relative meaning of `signedGroupBalanceDelta` and its inverse direct-ledger effect in the shared transfer types.
- [x] Add a regression fixture for direct `-30`, Group `+20`, existing transfer `-20`, and partial payment `$5`.
- [x] Assert expected Group, direct, net, and settlement-direction outcomes through the highest existing public seams.
- [x] Cover both actor/friend orientations so transfer signs do not depend on which person initiated the operation.
- [x] Link the implementation and tests to [ADR-0002](../../../docs/adr/0002-canonical-settlement-balance-signs-and-rpc-boundary.md) and the [settlement RPC spec](../../../docs/specs/2026-08-18-settlement-rpc-consolidation-and-balance-signs.md).
- [x] Focused settlement tests, the full Vitest suite, Supabase function typechecking, and changed-file TypeScript checks pass; unrelated repository-wide baseline TypeScript errors remain documented.
