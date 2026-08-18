# 02 — Opposing-scope settlement with explicit transfers

**What to build:** Friend detail settles opposing direct and shared-group balances through auditable non-cash scope transfers followed by the correct net payment across all affected shared groups.

**Blocked by:** 01 — Direct-only Settle All operation.

**Status:** ready-for-agent

- [ ] Opposing direct and group balances settle in the net direction shown to the user.
- [ ] Each required group reclassification is recorded as a scope-transfer event, not as cash payment.
- [ ] Scope-transfer records persist the operation, group, participant pair, currency, signed group delta, note, and timestamp with foreign keys, useful indexes, and server-side integrity constraints.
- [ ] Row-level authorization prevents transfers for groups that the actor and friend do not share.
- [ ] Multiple shared groups in one currency are handled deterministically.
- [ ] The operation remains atomic: payment and transfers either all commit or all roll back.
- [ ] The receipt distinguishes the actual payment from scope-transfer records and affected groups.
