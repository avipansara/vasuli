# 04 — Move Group deletion behind the mutation seam

**What to build:** Group administrators can delete a Group only after all Group balances are Settled; historical financial records remain preserved and active Group navigation refreshes after success or failure.

**Blocked by:** 01 — Establish the Group detail mutation seam through Expense deletion.

**Status:** complete

- [x] A Group with any outstanding Balance cannot be deleted.
- [x] A fully Settled Group is soft-deleted without removing historical Expenses, Settlements, or SettlementScopeTransfers.
- [x] Active Group lists refresh after successful deletion and navigation leaves the deleted Group detail screen.
- [x] Failed deletion leaves the Group detail state and active Group list unchanged.
- [x] External-behavior tests cover the settled guard, preservation, cache effects, and failure recovery.
