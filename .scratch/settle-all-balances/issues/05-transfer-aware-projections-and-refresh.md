# 05 — Transfer-aware projections and cross-surface refresh

**What to build:** Home, Friend detail, Group detail, and activity surfaces consume transfer-aware balances and converge after one settlement operation or a remote change.

**Blocked by:** 02 — Opposing-scope settlement with explicit transfers; 03 — Partial and zero-net Settle All; 04 — Group-only settlement isolation.

**Status:** ready-for-agent

- [ ] Friend detail and Home balance projections include direct-ledger effects from scope transfers.
- [ ] Group balance projections include transfers retained by the affected group.
- [ ] Friend and group activity distinguish cash payments from “moved to friendship balance” events.
- [ ] Settlement receipts identify every affected group, including transfer-only and zero-net operations.
- [ ] A committed operation invalidates/refetches Friend detail, Home summaries, affected Group details, group lists, and activity queries.
- [ ] Remote transfer changes trigger equivalent refresh behavior through realtime or an explicit documented invalidation path.
- [ ] Home, Friend detail, and Group detail agree after settlement, expense edits/deletions, and concurrent updates.

