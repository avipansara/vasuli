# 05 — Group-only isolation and regression verification

**What to build:** Group detail settlement remains limited to the selected Group and currency, while all settlement directions and partial/full outcomes remain regression-safe.

**Blocked by:** 02 — Atomic settlement operations and reversal; 03 — Transfer-aware balances and shared history.

**Status:** ready-for-agent

- [ ] Group-detail settlement changes only the selected Group balance.
- [ ] Direct balances and other Groups remain unchanged after a Group settlement.
- [ ] Group-only operations enforce membership, stale-balance, amount, currency, and idempotency rules.
- [ ] Direct-only, Group-only, same-direction, opposite-direction, partial, full-net, zero-net, reversal, and concurrent-change cases are covered.
- [ ] Cross-surface projections and activity agree after every tested operation.
