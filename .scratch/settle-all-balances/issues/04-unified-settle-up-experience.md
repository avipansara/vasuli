# 04 — Unified Settle Up experience

**What to build:** Friend detail provides one Settle Up action that defaults to the full net, supports lower partial amounts, previews cash allocations and offsets, and confirms the resulting balances clearly.

**Blocked by:** 01 — Settlement allocation rules; 02 — Atomic settlement operations and reversal; 03 — Transfer-aware balances and shared history.

**Status:** ready-for-agent

- [ ] Friend detail exposes one Settle Up action for direct-only, group-only, mixed, and zero-net relationships.
- [ ] The full combined net is prefilled and lower amounts are accepted without overpayment.
- [ ] The preview distinguishes cash payment amounts from internal offsets and shows affected scopes.
- [ ] Zero-net confirmation uses the same flow and clearly states that no cash is transferred.
- [ ] Success, stale-balance, retry, loading, validation, and error states are handled.
- [ ] Light/dark appearance and accessibility states remain legible and descriptive.
