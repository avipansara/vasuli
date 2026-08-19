# 03 — Move GroupMember lifecycle mutations behind the seam

**What to build:** Group administrators can add and remove GroupMembers, and Users can send Friend requests from Group detail, while Activity, notification isolation, Friendship state, and Settled-Balance guards remain correct.

**Blocked by:** 01 — Establish the Group detail mutation seam through Expense deletion.

**Status:** complete

- [x] Adding one or more GroupMembers succeeds through the mutation seam and records the expected Activity.
- [x] Notification delivery is attempted after successful membership changes and cannot roll back membership.
- [x] Removing a GroupMember with a Settled Group Balance succeeds.
- [x] Removing a GroupMember with an outstanding Balance is rejected without changing the read model.
- [x] A Friend request updates cached Friendship state only after persistence succeeds.
- [x] External-behavior tests cover successful and rejected lifecycle mutations and side-effect isolation.
