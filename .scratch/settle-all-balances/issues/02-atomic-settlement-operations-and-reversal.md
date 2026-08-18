# 02 — Atomic settlement operations and reversal

**What to build:** Full-net and zero-net Settle Up operations commit cash settlements and internal offsets atomically, safely retry, and reverse as one auditable unit.

**Blocked by:** 01 — Settlement allocation rules.

**Status:** ready-for-agent

- [ ] One operation records the actor, friend, currency, expected balance, requested amount, payment intent, and affected scopes.
- [ ] Cash settlements and internal offsets either all commit or all roll back.
- [ ] Server-side validation enforces friendship, shared Group membership, stale balances, currencies, amounts, and pair-scoped offsets.
- [ ] Reusing a payment intent returns the original receipt without duplicates.
- [ ] A zero-net operation can commit offsets without a cash payment.
- [ ] Only the two involved users can reverse an operation.
- [ ] Reversal restores every linked payment and offset atomically and is idempotent.
- [ ] Historical operations remain reversible after a Group is archived or deleted.
