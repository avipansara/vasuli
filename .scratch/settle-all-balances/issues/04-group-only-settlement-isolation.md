# 04 — Group-only settlement isolation

**What to build:** Group detail settles only the selected group and currency, without changing direct friendship balances or balances in other groups.

**Blocked by:** 01 — Direct-only Settle All operation.

**Status:** ready-for-agent

- [ ] Group detail submits the group settlement mode for the selected group only.
- [ ] The operation schema requires and validates the selected group for group-mode operations and rejects unrelated direct or group scopes.
- [ ] Direct balances and other shared groups remain unchanged after a group settlement.
- [ ] Group settlement enforces membership authorization, stale-balance checks, amount caps, and idempotent retry behavior.
- [ ] The operation receipt and resulting group activity remain distinguishable from all-balances settlement.
- [ ] Existing group settlement flows remain compatible with legacy payment rows.
