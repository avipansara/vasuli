# 03 — Transfer-aware balances and shared history

**What to build:** Friend, Home, Group, and activity views stay consistent after payments, internal offsets, reversals, and remote changes while preserving pair-scoped accounting.

**Blocked by:** 02 — Atomic settlement operations and reversal.

**Status:** ready-for-agent

- [ ] Direct, Group, Friend, and Home projections include operation-linked payments and offsets correctly.
- [ ] An offset changes only the involved pair’s balance and leaves other Group members unchanged.
- [ ] All Group members can view clearly labeled offset entries in affected Group history.
- [ ] Reversal events are visible in affected Group and Friend history.
- [ ] Cash payments and internal offsets are presented as distinct event types.
- [ ] Friend, Home, Group, and activity caches refresh after local and remote operations.
- [ ] Archived or restored Groups preserve the operation and history correctly.
