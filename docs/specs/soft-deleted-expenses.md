# Soft-deleted expenses and deletion activity

## Status update — 2026-08-19

Implemented in the current application. Expense deletion retains
the row and splits, active read models exclude deleted expenses, historical
activity can resolve the deleted target, and pair-participant filtering prevents
zero-share Group members from gaining unrelated visibility. Remaining work is
operational verification of historical production fixtures.

## Problem Statement

Deleting an expense currently removes the expense row from the database. Its
split rows are then removed by the database cascade, and a separate activity
row is written afterward. This creates several problems:

- The original expense and split history cannot be inspected after deletion.
- A failure between the database delete and activity insert can leave no
  deletion activity.
- Deleted-expense visibility is reconstructed from activity metadata. The
  current participant snapshot can include people with a `$0` split, causing
  deleted expenses to appear in unrelated friend activity feeds.
- Active lists, balances, group summaries, friend summaries, and detail pages
  need a consistent definition of “active expense.”
- A user who follows an old activity or notification needs a clear deleted
  state rather than an apparently missing or editable expense.

## Solution

Replace hard deletion with soft deletion. An expense remains in the database,
including its split rows, but receives deletion metadata and is excluded from
all active expense lists, balances, summaries, and calculations.

Every successful deletion creates a permanent `expense_deleted` activity. The
activity is visible only to the payer and users whose split amount is greater
than zero. `$0` split rows and other nonparticipants must never grant access to
the deleted expense activity.

There is no restore action, restore API, or user-facing deleted-expense
management screen in this scope.

## User Stories

1. As an expense creator, I want deleting an expense to remove it from active views, so that my current totals no longer include it.
2. As an expense payer, I want the deleted expense to remain stored, so that its historical details and split information are not destroyed.
3. As a participant with a positive share, I want to see that the expense was deleted in my friend activity feed, so that the history is understandable.
4. As a group member with a `$0` share, I do not want to see a deleted expense in a friend activity feed, so that unrelated group expenses remain private and relevant.
5. As a nonparticipant, I do not want a deleted expense to become visible merely because I belong to the same group, so that friend activity remains pair-specific.
6. As the payer, I want a deletion activity even when I have no split row, so that payer-only expenses remain auditable.
7. As a participant, I want deletion activity visibility to be based on the original positive split amounts, so that later active-expense filtering does not erase valid history.
8. As a user viewing a deleted-expense link, I want to see the original expense details with a clear deleted status, so that the link is understandable.
9. As a user, I should not be able to edit a deleted expense, so that historical deletion cannot be silently reversed.
10. As a user, I should not be offered a restore action, so that deletion remains final from the product’s perspective.
11. As a group member, I want deleted expenses excluded from group expense lists and group totals, so that current group calculations are accurate.
12. As a friend, I want deleted expenses excluded from friend expense tabs and pair balances, so that the amount owed reflects only active expenses and settlements.
13. As a user, I want deleted expenses excluded from home summaries and dashboard totals, so that every summary agrees with the detail screens.
14. As a user, I want the deletion activity to retain the original description, amount, group name, payer, and timestamp, so that the event remains meaningful after deletion.
15. As a user, I want push notifications for deletion to continue working, so that affected participants are informed consistently.
16. As a user, I want an unsuccessful deletion to leave the expense active, so that partial failures do not corrupt the current balance.
17. As a user, I want the deletion activity and deletion state to be created consistently, so that a successful deletion cannot silently lose its audit event.
18. As a user, I want repeated delete attempts to be safe and idempotent, so that an already deleted expense is not duplicated or mutated unexpectedly.
19. As a user, I want expenses created or updated after this change to follow the same active/deleted rules, so that behavior does not depend on when an expense was created.
20. As a user, I want light and dark themes to communicate the deleted state clearly, so that deletion status is legible in either appearance.

## Implementation Decisions

- Add nullable deletion metadata to the expense record: a deletion timestamp
  and the user who performed the deletion. Existing expense and split data is
  retained.
- Define an active expense as an expense whose deletion timestamp is null.
  Every active expense query, summary, balance calculation, group read model,
  friend read model, and cache projection must apply this rule.
- Preserve split rows during deletion. The original split amounts remain the
  source of truth for determining who may see the deletion activity.
- Compute deletion participants as the payer plus users whose original split
  amount is strictly greater than zero. Do not include zero-share split rows.
- Make deletion and deletion-activity creation atomic at the data boundary
  where practical. The operation must verify the existing authorization rule:
  only the expense creator or payer may delete the expense.
- Keep the existing `expense_deleted` activity type and notification contract,
  extending its stored metadata only as needed to support precise visibility.
- Keep deleted activities in friend activity projections even though the
  corresponding expense is excluded from active expense projections. Visibility
  must use the stored positive-participant snapshot and payer identity.
- Allow a deleted expense to be loaded for historical detail viewing, but
  expose an explicit deleted state and disable edit/delete controls. Active
  editing and mutation paths must reject deleted expenses.
- Do not add restore controls, restore service methods, restore permissions, or
  a deleted-expense browsing surface.
- Preserve optimistic UI behavior only after the soft-delete operation
  succeeds; on failure, keep or restore the active expense and show the existing
  error state.
- Update the application database schema, fresh schema artifacts, generated
  database types, and migration history together.
- Record the user-visible behavior in the changelog.

## Testing Decisions

- Prefer external-behavior tests at the expense deletion service and friend
  detail read-model seams. The primary contract is what users can see and how
  balances change, not whether a particular query-builder method was called.
- Test that an authorized delete marks an expense deleted, preserves its
  splits, removes it from active lists and balances, and produces one deletion
  activity.
- Test that unauthorized users cannot delete an expense and that failed
  deletion leaves active data unchanged.
- Test idempotency for repeated deletion attempts and ensure duplicate deletion
  activities are not created.
- Test deletion visibility for: the payer with no split row, the payer with a
  zero split, a positive-share participant, a zero-share group member, a user
  outside the group, and a user who is not part of the pair.
- Test that friend activity can include a deleted expense event while the
  active expense and balance projections exclude the deleted expense.
- Test that group lists, home summaries, friend tabs, expense details, and edit
  paths all respect the deleted state.
- Test that the original description, amount, group label, payer, split data,
  and deletion timestamp remain available on historical detail/activity views.
- Test notification dispatch for deletion without making notification failure
  re-create or re-activate the expense.
- Follow existing service tests, read-model/RPC tests, activity-link tests, and
  component tests as prior art. Add only the smallest new seam needed for the
  atomic deletion operation.
- Verify TypeScript/Supabase types, focused lint, the full Vitest suite, and
  the migration against the linked database before handoff.

## Out of Scope

- Restoring deleted expenses.
- Permanently purging deleted expenses from the database.
- A recycle bin, deleted-expense history screen, or administrative recovery
  tooling.
- Changing expense ownership or the existing creator-or-payer authorization
  rule.
- Reworking settlement semantics beyond excluding deleted expenses from the
  balances that feed them.
- Changing the meaning of positive split amounts or introducing new split
  types.
- Backfilling or rewriting historical activity records unless required to
  prevent exposure of known zero-share nonparticipants.
- Redesigning the broader expense or activity UI beyond the deleted-state
  indicator and mutation restrictions required by this feature.

## Further Notes

- This is intentionally a cross-cutting change because “active expense” is
  currently represented in multiple services and database read models.
- The most important regression guard is the pair-participant rule: a group
  member with a zero split must not gain access to a deleted expense merely
  because the expense belonged to their group.
- The repository currently has no configured issue-tracker integration. This
  spec is therefore stored locally and is ready to be published with the
  `ready-for-agent` triage label when tracker access is configured.
