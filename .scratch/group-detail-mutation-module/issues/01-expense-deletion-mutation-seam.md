# 01 — Establish the Group detail mutation seam through Expense deletion

**What to build:** Expense deletion from Group detail continues to work end-to-end through a Group detail mutation seam, including soft deletion, optimistic Group detail and Friends Home updates, rollback on failure, Activity creation, notification isolation, and route-level feedback.

**Blocked by:** None — can start immediately.

**Status:** complete

- [x] A successful deletion removes the Expense from active Group detail data and preserves its historical ExpenseSplit records.
- [x] Group detail and Friends Home receive the correct optimistic update when sufficient cached data exists.
- [x] A failed deletion restores every optimistic cache changed by the operation.
- [x] Deletion Activity and positive-participant visibility remain correct.
- [x] Notification failure does not turn a successful deletion into a failed mutation.
- [x] The route delegates mutation policy to the Group detail mutation seam and retains presentation, alerts, and navigation responsibilities.
- [x] External-behavior tests cover success, rollback, cache reconciliation, Activity, and notification isolation.
