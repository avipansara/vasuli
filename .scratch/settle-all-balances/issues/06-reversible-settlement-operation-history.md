# 06 — Reversible settlement-operation history

**What to build:** Reversing or deleting a settlement operation handles its linked payment and scope transfers as one auditable unit without leaving partial historical state.

**Blocked by:** 02 — Opposing-scope settlement with explicit transfers; 03 — Partial and zero-net Settle All; 05 — Transfer-aware projections and cross-surface refresh.

**Status:** ready-for-agent

- [ ] A settlement operation can be identified as one unit containing its payment and transfers.
- [ ] Operation and transfer relationships use deletion/reversal constraints that prevent orphaned or partially removed financial records.
- [ ] Reversal or deletion applies consistently to every linked financial event.
- [ ] Partial historical deletion is rejected or prevented atomically.
- [ ] Projections and activity reflect the operation’s final state after reversal.
- [ ] Retried reversal requests are safe and idempotent.
