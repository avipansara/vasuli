# 02 — Move SettlementScopeTransfer reversal behind the mutation seam

**What to build:** GroupMembers can reverse an eligible SettlementScopeTransfer from Group history, with current-Balance validation, safe delegation to the established settlement operation, and consistent refresh of affected Group and Friendship surfaces.

**Blocked by:** 01 — Establish the Group detail mutation seam through Expense deletion.

**Status:** complete

- [x] An eligible transfer delegates reversal to `settlementModule` with operation data and the current expected relationship Balance.
- [x] Ineligible or already reversed transfers remain unchanged.
- [x] Stale-Balance and authorization failures produce the existing user-visible error behavior.
- [x] Successful reversal refreshes Group detail, Group list, Friends Home, Friend detail, and Activity surfaces as appropriate.
- [x] External-behavior tests cover delegation, stale state, repeat reversal, and cache effects.
