# Spec: Recurring expenses

Status: approved for ticketing

Updated: 2026-09-29

## Problem

People enter the same shared cost each week or month, such as rent, utilities,
or a subscription. Reentering the people, amount, payer, and split invites
mistakes. A future cost must not affect balances until its due date.

## Terms

- **Recurring expense rule**: The owner's saved instructions for future
  expenses. It does not affect balances.
- **Occurrence**: An ordinary expense created for one scheduled local date.
  It affects balances once and remains in expense history even if the rule
  changes or stops.
- **Due date**: The calendar date in the rule's saved time zone on which an
  occurrence may be posted. This is separate from the database creation time.

`CONTEXT.md` records the rule and occurrence terms.

## Proposed first release

- Offer `Repeat` in the second step of Add Expense for group and direct friend
  expenses. Choices are `Does not repeat`, `Every week`, and `Every month`.
  The selected expense date becomes the first due date. A confirmation sheet
  for recurring saves shows the cadence, first due date, payer, participants,
  amount, currency, and split. One-time expense submission keeps its current
  two-step flow.
- The creator owns the rule and is its payer in this release. A person may
  still record a one-time expense paid by somebody else. A later version can
  allow a recurring payer after that person explicitly accepts the rule.
- Affected participants receive a notice when the owner creates or materially
  edits a rule and when each occurrence posts. Their approval is not required
  for automatic posting. They can read the schedule and their share.
- Keep the amount fixed until the owner edits the rule, and keep the currency
  fixed for the rule's lifetime. Save the selected participants and resolved
  shares. New group members are not silently added. Changes to membership,
  shares, or amount require an edit.
- Offer an optional last due date for fixed-term costs. `No end date` is the
  default. A rule reaches `Ended` after its last due occurrence posts; posted
  expenses stay in history.
- Put a labeled `Recurring` action in the Activity header. It opens the
  `Recurring expenses` list without adding a fifth tab. The list separates
  rules the user owns from rules shared with them, and shows active, paused,
  and stopped status with the next due date. Owners can view, edit, pause,
  resume, and stop a rule. Other participants have read-only access. A
  stopped rule cannot resume; the owner can create a new one from its details.
  The creation confirmation links to this list.
- Editing or stopping a rule changes future occurrences only. Each posted
  occurrence retains the ordinary expense detail, edit, and delete actions.
  Deleting an occurrence does not stop its rule or recreate that date.
- On a posted occurrence, keep the existing pencil action and label it
  `Edit this expense` for accessibility. The editor shows `Changes to this
  expense only` above its fields. The first action changes only that
  occurrence's amount, date, and splits, subject to normal permissions. Put
  a `Repeats monthly/weekly` row below the amount card. For the rule owner,
  that row leads to rule details and `Edit future expenses`; for other
  participants, it opens read-only rule details. Rule edits change only due
  dates that have not posted.
- If a price changes after three $120 occurrences, changing the rule to $135
  leaves those three expenses at $120 and posts $135 on the next due date.
  If the fourth expense already posted at $120, the owner must edit that
  expense to $135 as well as the rule. Show this distinction before saving.
  A currency change requires stopping the rule and creating a new one.
- If a due date posts while the owner is editing the rule, the committed
  occurrence keeps the old values. The save response must identify the next
  unposted date to which the new values apply.
- Show a `Repeats weekly/monthly` link on occurrence detail. Show `Created
  automatically` in activity when the scheduler posted it. Rule edits and
  pauses need clear success and error states.
- Do not show pending occurrences in balances, settlement math, expense
  counts, or export. Posted occurrences appear in the existing friend and
  group flows as normal expenses.
- The confirmation sheet must say `Vasuli will add this expense automatically
  on each due date. It cannot verify that you paid the bill.` If a payment
  fails or the bill does not arrive, the owner can delete that occurrence and
  pause or stop the rule. Deleting one occurrence never silently changes the
  schedule.

## Screen placement and flow

1. A user enters Add Expense from the floating button or a friend/group
   screen. Step 1 still chooses people. In step 2, put a compact `Repeat` row
   directly below `Date`, with `Does not repeat` as its default. Weekly or
   monthly selection reveals `First expense: <date>` and `Posts automatically`
   under the row. If the selected payer is somebody else, explain that the
   user must choose `You` before saving a recurring rule.
2. The header action changes from `Add` to `Review` only after a repeat option
   is selected. A confirmation sheet shows what will be posted and when; its
   primary action is `Save recurring expense`. Success shows the next due
   date and a `View recurring expenses` link. A due-today rule says `Waiting
   to post` until the server confirms the occurrence.
3. The Activity header has a text action `Recurring`. The list leads with
   active rules owned by the user, ordered by next due date, then rules shared
   with them. Paused and stopped rules appear below. Each row shows
   description, amount, cadence, friend or group, and next due date. Empty
   state offers `Add a recurring expense`.
4. Rule detail shows the saved amount and split, next due date, time zone,
   recent posted occurrences, and `Edit`, `Pause` or `Resume`, and `Stop`
   actions. Show a paused reason and a clear repair path when participants
   or group membership become invalid.
5. A posted occurrence remains in the normal friend/group activity and
   expense lists. Expense Detail identifies it as recurring. Its pencil
   changes this expense only; the recurrence row leads owners to rule detail
   for future changes. Do not add another tab or mix future rules into the
   historical Activity feed.

### Stop and pause

- The owner opens `Activity` → `Recurring` → the rule → `Stop recurring
  expense`. The same rule detail is reachable from an occurrence. Place Stop
  below the ordinary Edit and Pause controls and give it destructive styling.
- Confirm with: `Stop recurring expense? No future expenses will be added.
  Expenses already posted, and their balances, will stay as they are.` The
  actions are `Keep recurring` and `Stop recurring expense`.
- After confirmation, mark the rule stopped on the server and remove its next
  due date. Show a short success message and move it to `Stopped` in the list.
  Stop does not delete or reverse posted occurrences. The user can still edit
  or delete each posted expense under its normal permissions.
- If today's occurrence committed before Stop, show it in the confirmation
  result and stop subsequent dates. If Stop committed first, the worker must
  not post today's occurrence. The server decides this by locking the rule
  when posting or stopping it.
- `Pause` is reversible and skips dates while paused. `Stop` is final; the
  stopped detail offers `Create a new recurring expense` prefilled from the
  old rule when the user wants to start again.

### Posting behavior

Post each due occurrence automatically, including when the app is closed.
The user chose this behavior on 2026-09-28.

## Calendar rules

- Store the due date as a local `date` and the rule's IANA time zone. Capture
  the device time zone at creation and show it in rule details. A device time
  zone change does not move an existing rule's due date.
- Run the server worker frequently enough to post shortly after 9:00 a.m. in
  the rule's saved time zone. Use the due date as the expense's displayed date; keep the
  actual creation timestamp for audit and activity ordering.
- Show `Around 9:00 a.m.` in the saved time zone. A rule created for today
  after that time posts shortly after saving. Do not promise an exact minute.
- Weekly rules repeat on the start date's weekday. Monthly rules keep the
  start day when it exists and otherwise use that month's last day. A rule
  starting January 31 posts on February 28 or 29, then March 31.
- Do not generate dates before rule creation. After a worker outage, post at
  most two missed due dates in order, without duplicates. If more remain,
  pause the rule for owner review. Show the remaining dates and let the owner
  explicitly post or skip each before resuming with the next future date.
  Delayed occurrences keep their intended due date.
- A deliberate pause skips due dates while the rule is paused. Resuming
  schedules the next future due date; it does not backfill paused dates.
- Start date may be today or later. Saving a rule due today queues its first
  occurrence for the server worker; the save screen must say whether it has
  posted yet. A rule cannot start in the past.

## Data and server work

1. Add `recurring_expense_rules` with owner, group or direct scope, description,
   amount in currency units with the existing two decimal precision, currency,
   payer, cadence, anchor day, time zone, first, next, and optional last due dates, status,
   timestamps, and a last error field. Add child rows for the participant IDs,
   chosen split method, and resolved amounts or percentages. Validate that
   shares total the fixed amount in exact cents.
2. Add nullable `recurring_rule_id` and `scheduled_for` to `expenses`. A unique
   constraint on the pair prevents two posted occurrences for one due date,
   including when an occurrence is soft deleted. Index active rules by next
   due date and owner for list queries.
3. Give the owner write access to the rule and its splits. Give its affected
   participants read-only access to the schedule, amount, payer, and their
   share so they know what will affect their balances; do not expose unrelated
   group or friendship data. The server worker uses a trusted identity.
   Posted expenses remain subject to existing expense policies. Check the
   project's auth profile bridge in every policy and command.
4. A trusted scheduled worker selects due rules in small batches and calls a
   database command. The command locks one rule, rechecks that it is active,
   verifies the owner, payer, group, friendships, and saved participants are
   still valid, inserts the expense and all splits, then advances `next_due_on`
   in one transaction. A retry or concurrent worker must produce the same
   single occurrence. Do not call the current client `expenseService.create`
   from the worker: it inserts the expense and splits in separate requests.
5. If the group was deleted, a participant left, or a direct friendship no
   longer permits posting, pause the rule and expose a useful reason to its
   owner. Other rules continue. Record failures for operator diagnosis.
6. Write the usual expense activity and participant notifications once for
   each posted occurrence. Failures in these follow-up steps must not create
   another expense on retry. Use an occurrence-linked delivery record or
   equivalent idempotent outbox for notification retries.
7. Audit account deletion and group deletion alongside the new rule table.
   Deleting an account must stop that owner's future rules while preserving
   already posted shared expenses under the existing account deletion rules.
8. Detect a likely duplicate rule for the same owner, scope, description,
   amount, cadence, and first due date before saving. Warn the owner and let
   them inspect the existing rule. The database still allows legitimate
   similar rules with different purposes.

## App work

- Extend the Add Expense form with the repeat choice and review copy. Keep
  the existing one-time submit path intact. Add a rule service and query keys
  for create, list, detail, edit, pause, resume, and stop.
- Build a rule list and detail screen using current theme tokens and shared
  loading, empty, and error components. Give the owner a visible next due
  date and any paused reason. Give affected participants a read-only view of
  their upcoming share. Link from posted occurrence detail to the rule when
  the viewer is an affected participant.
- Refresh rule queries after commands and refresh friend, group, expense, and
  activity queries when a new occurrence arrives. Server-created occurrences
  cannot rely on the current client's optimistic cache updates; refetch on
  screen focus and on a useful realtime or push signal.
- Check the complete flow in light and dark mode on iOS and Android,
  including keyboard, date picker, loading, disabled, paused, and failure
  states. Keep controls at usable touch sizes with explicit accessibility
  labels and state.

## Acceptance scenarios

1. A $120 monthly group rule starting January 31 posts one $120 expense on
   January 31, one on February 28 or 29, and one on March 31. The balances
   change only after each occurrence posts.
2. Two workers processing the same due date produce one expense with one
   complete set of splits. A retry after a network timeout does the same.
3. Editing the amount after February leaves January and February expenses
   unchanged; the next occurrence uses the new amount and shares.
   Editing February's posted expense changes February alone. If the price
   changes after March has posted, the owner can edit March and then change
   the rule for April onward.
4. Deleting February's occurrence removes its balance effect and does not
   recreate February or stop March. Pausing before March skips March;
   resuming in April starts with the next future due date.
5. A group member leaves before a due date. The worker pauses the rule and
   creates no partial expense. The owner sees what to fix.
6. A worker outage spanning two due dates catches up in due-date order,
   without changing the saved date or duplicating activity and notifications.
   With three missed dates, it posts two and pauses for owner review of the
   third. A skipped date never posts later.
7. A participant can see the schedule and their share after creation. They
   cannot edit or stop someone else's rule.
   Posted occurrences remain visible under current expense access.
8. Stopping a rule before its due date posts nothing for that date. Stopping
   after an occurrence has posted leaves that expense and its balance intact.
9. A bill fails to charge after an automatic occurrence posts. Deleting that
   occurrence removes its balance effect and preserves the schedule unless
   the owner explicitly pauses or stops it.

## Delivery order

1. Add the schema, owner policies, atomic posting command, scheduler, and
   deterministic date calculation. Cover the calendar and idempotency cases.
2. Add rule creation and management screens, then occurrence links and copy.
3. Add activity and notification delivery, cache refresh, account and group
   deletion handling, and operational visibility.
4. Verify the full scheduled flow with a trusted worker and the app's group
   and friend balances before release.
