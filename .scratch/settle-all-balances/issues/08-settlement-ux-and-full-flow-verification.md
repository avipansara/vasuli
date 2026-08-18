# 08 — Settlement UX, accessibility, and full-flow verification

**What to build:** Friend and Group settlement flows clearly communicate scope, payment amount, transfers, partial/zero-net outcomes, and refresh/error states across supported appearances and accessibility modes.

**Blocked by:** 03 — Partial and zero-net Settle All; 04 — Group-only settlement isolation; 05 — Transfer-aware projections and cross-surface refresh; 06 — Reversible settlement-operation history; 07 — Splitwise-style reversible group deletion.

**Status:** ready-for-agent

- [ ] Friend detail presents “Settle all balances” and Group detail presents group-only settlement.
- [ ] Confirmation UI explains the net payment, affected scopes, remaining balances, and transfer-only outcomes in plain language.
- [ ] Partial amount caps, zero-net clearing, stale-balance refresh, retry, loading, and error states are handled clearly.
- [ ] After success, affected screens refresh from the authoritative read models without stale or contradictory balances.
- [ ] Light and dark appearance states remain legible.
- [ ] Settlement mode, amount, affected scopes, and result are accessible to assistive technologies.
- [ ] Focused settlement, projection, refresh, activity, deletion/restoration, and Supabase migration checks pass.

