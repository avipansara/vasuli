# 01 — Settlement allocation rules

**What to build:** Settle Up plans Direct-first partial payments, full-net settlements with explicit offsets, and zero-net clearing consistently across Direct and Group balances.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Direct-only and Group-only balances produce the correct payment allocation.
- [ ] Partial payments allocate Direct first and never trigger opposing-scope offsets.
- [ ] Remaining payment is allocated to same-direction Groups by oldest activity.
- [ ] A full combined-net payment plans the required cash allocations and offsets so every scope settles.
- [ ] A zero-net relationship plans offsets without a cash payment.
- [ ] Mixed currencies, sub-cent amounts, and overpayments are rejected.
- [ ] Pure allocation and service tests cover the agreed scenarios in cents.
