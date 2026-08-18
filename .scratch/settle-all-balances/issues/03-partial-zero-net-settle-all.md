# 03 — Partial and zero-net Settle All

**What to build:** Friend detail supports cent-based partial payments and zero-net balance clearing while preserving correct direct/group ledger state.

**Blocked by:** 02 — Opposing-scope settlement with explicit transfers.

**Status:** ready-for-agent

- [ ] Partial payments from one cent through the outstanding net balance are accepted and capped.
- [ ] Partial opposing-scope payments apply required transfers and leave the correct remaining friendship balance.
- [ ] A zero-net relationship can clear offsetting scopes without creating a cash payment.
- [ ] The operation rejects mixed currencies, over-settlement, and invalid sub-cent amounts server-side.
- [ ] Transfer-only receipts are distinguishable from failed or empty settlement operations.

