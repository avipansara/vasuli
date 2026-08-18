# 07 — Splitwise-style reversible group deletion

**What to build:** Deleting a settled group hides it from active experiences while preserving its members and complete financial history, and restoring it makes that history available again.

**Blocked by:** 02 — Opposing-scope settlement with explicit transfers; 05 — Transfer-aware projections and cross-surface refresh.

**Status:** ready-for-agent

- [ ] Group deletion records reversible metadata instead of hard-deleting the group.
- [ ] The group schema persists deletion timestamp and deleting actor metadata, and its policies allow only authorized deletion/restoration.
- [ ] Deleted groups disappear from active lists, group settlement entry points, and normal navigation.
- [ ] Members, expenses, splits, payments, scope transfers, and activity remain preserved.
- [ ] Restoring a group makes its original members, balances, transactions, and activity visible again.
- [ ] Deleted-group authorization and restoration behavior are covered for all relevant members.
