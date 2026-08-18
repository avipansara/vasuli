# 01 — Direct-only Settle All operation

**What to build:** Friend detail always submits an `all_balances` settlement operation for a direct-only relationship, producing one atomic operation-linked payment and a receipt that is safe to retry.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Friend detail uses the all-balances settlement mode even when only direct expenses exist.
- [ ] The schema persists one settlement-operation parent with actor, friend, mode, currency, expected balance, requested amount, payment intent, status, and timestamps.
- [ ] Actual payment rows can reference their settlement operation while existing rows without that reference remain valid legacy payments.
- [ ] The operation validates participants, currency, expected balance, amount limits, and stale balances inside the transaction.
- [ ] A successful operation returns a receipt with payment and idempotency information.
- [ ] Retrying the same payment intent returns the original receipt without duplicate financial rows.
- [ ] Existing direct-only settlement behavior and legacy payment rows remain compatible.
