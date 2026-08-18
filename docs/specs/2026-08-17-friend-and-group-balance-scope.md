# Friend and group balance scope

## Problem statement

The Friend detail page currently mixes direct friend expenses with expenses
that belong to a group. This makes the displayed activity and the amount to
settle ambiguous. A group expense can involve several people, but its debt is
owned by the group ledger; displaying it as if it were a direct expense between
two friends can make the Friend balance appear incorrect or cause a user to
settle the same amount twice.

The product needs a clear relationship view without creating duplicate
financial ledgers. Direct expenses and group balances must remain distinct,
while the Friend page should still make shared group balances discoverable.

## Goals

- Keep direct Friend expenses and direct settlements separate from group data.
- Show a trustworthy direct balance between the current user and the selected
  Friend.
- Show group balances involving both people without presenting them as direct
  expenses.
- Make every displayed amount identify its accounting scope.
- Ensure each expense and settlement has one authoritative settlement home.
- Preserve group-level calculations for all group participants.
- Prevent double-counting when a user settles a direct balance or a group
  balance.

## Terminology

- **Direct expense**: an expense with no `group_id`, involving the current user
  and the selected Friend.
- **Group expense**: an expense with a `group_id`; its authoritative balance is
  calculated by the Group ledger.
- **Direct balance**: the net amount created only by direct expenses and direct
  settlements between two Friends.
- **Group settlement balance with a Friend**: the amount shown by the Group
  settlement flow for the selected Friend after calculating the full Group
  ledger. It is settled through that Group, not as a direct Friend payment.
- **Relationship summary**: an optional combined presentation of direct and
  group balances. It is informational unless the user chooses a specific
  scope to settle.
- **Settlement home**: the ledger that owns an expense or settlement and is
  responsible for changing its balance.

## Accounting rules

| Record | Friend page direct balance | Friend page detail | Group page |
| --- | --- | --- | --- |
| Direct expense shared by both people | Include | Show under Direct expenses | Not applicable |
| Direct settlement between both people | Include | Show under Direct activity | Not applicable |
| Group expense paid by a third person | Exclude | Do not show as a Friend expense | Include |
| Group expense paid by current user | Exclude from direct balance | Show only in a Group balances summary, if both people are relevant | Include |
| Group expense paid by selected Friend | Exclude from direct balance | Show only in a Group balances summary, if both people are relevant | Include |
| Group settlement | Exclude | Show only in the relevant Group summary | Include |

The Friend page must never turn a group expense into a direct expense merely
because both people have positive shares. A group expense may be relevant to a
Friend relationship, but its settlement home remains the Group.

For a Group settlement balance with a Friend, use the same full-Group balance
calculation as Group settle-up, then project the selected Friend's balance into
the Friend page. This means other members' expenses can influence the amount
through Group debt netting, but the amount remains explicitly labeled as a
Group settlement balance and is never treated as a direct Friend expense.

## Proposed Friend page

The Friend page should contain these clearly separated sections:

```text
Direct balance
You owe Avee $20

Direct expenses
...only expenses with no group...

Group balances with Avee
Alaska 2026     You owe $100     View group
Roommates       Avee owes $35    View group

Total across all scopes (optional)
You owe $85
```

The combined total is optional for the first implementation. If shown, it must
be explicitly labeled and must not replace the direct balance. The settle action
must always identify its scope before recording a payment.

## Combined relationship settlement

The Friend page may present a combined total across the direct ledger and all
shared Group settlement balances in the same currency. The total is an overview
of scopes, not a new ledger.

When a user records a payment from the combined Friend flow, allocate it in a
deterministic order:

1. Apply the payment to the direct Friend balance first.
2. Apply any remainder to shared Group balances, ordered by oldest outstanding
   activity unless the user chooses a specific order.
3. Stop when the payment is exhausted.
4. Create one settlement record per scope, retaining `group_id` for Group
   allocations.

Before confirmation, show the allocation preview. For example:

```text
Payment                         $500.00
Direct balance                  $34.50
Alaska 2026                     $465.50
Remaining Alaska 2026 balance  $481.62
```

The user may adjust the allocation before confirming. Different currencies
must not be combined automatically; each currency requires its own payment or
an explicit conversion flow.

Group expense cards must not be inserted into the Direct expenses list or
included in the Direct balance. They may appear in the Friend activity feed as
read-only context, matching Splitwise-style relationship visibility. Each card
must show the group name, payer, and the current user's Group share, and must
state that it has no direct Friend-balance impact. It must not offer direct
edit/delete actions. A Group balance row should link to Group detail for the
full expense history and settlement controls.

## Settlement behavior

- The existing Friend-page settle action settles only the Direct balance.
- The combined Friend settlement action may settle Direct and Group scopes in
  one user-confirmed payment, but it must create separate settlement records.
- A Group balance row navigates to Group detail, where Group settlement is
  recorded.
- A user must not be able to settle a Group balance through the Direct settle
  action.
- Partial settlements reduce only the selected ledger and currency.
- A direct settlement must not reduce a Group balance.
- A Group settlement must not reduce the Direct balance.
- A combined payment must never be stored as one direct settlement for its full
  amount.
- If a Group's debt simplification suggests paying a different person from the
  original payer, the UI must label the result as a Group settlement
  recommendation, not as a direct Friend expense.
- Repeated or concurrent settlement actions must not create duplicate balance
  reductions.

## Data and service design

The existing expense `group_id` is the source of truth for settlement home:

- `group_id IS NULL` means Direct ledger.
- `group_id IS NOT NULL` means Group ledger.

Friend detail read models should return separate projections rather than one
mixed `expenses` array:

- `directExpenses`
- `directSettlements`
- `directBalance`
- `groupBalances`

For compatibility, an adapter may temporarily map these into the existing
shape, but the route and presentation components must not infer accounting
scope from payer names or split membership.

Group balance summaries should be computed from the Group balance service or a
dedicated Group-scoped read model. They must not reuse the direct Friend
balance query with a different filter.

Each group balance summary should include:

- `groupId`
- `groupName`
- `currency`
- `amount`
- `direction`
- `lastActivityAt`
- a navigation target for Group detail

Deleted expenses are excluded from active direct and Group balances according
to the soft-delete rules. Historical deletion activity remains governed by
its original ledger and participant visibility.

## Edge cases

- A Group expense paid by Isha and split across everyone belongs only to the
  Group; it must not create a Friend balance between the current user and
  Avee.
- A Group expense paid by Avee and split with the current user belongs to the
  Group; it may increase the Alaska 2026 Group balance, but must not increase
  the Direct balance.
- A user can share multiple Groups with the same Friend; each Group gets its
  own row.
- A Group may have a zero balance; show it only when product requirements call
  for history, otherwise omit it from outstanding balances.
- A zero-share participant must not receive a balance or visibility merely from
  membership in the Group.
- Unequal, percentage, share-based, and exact-amount splits must use stored
  split amounts without recomputing equal shares.
- A payer with no split row still contributes to the Group calculation as the
  payer; this must not create a direct Friend expense.
- Direct and Group balances may have different currencies and must remain
  separate until an explicit conversion is selected.
- A Group settlement between the current user and the Friend must remain in the
  Group ledger even if it resembles a direct payment.
- Removing a Friend from a Group must preserve historical Group records while
  preventing new Group balance rows from being created incorrectly.
- Archived or closed Groups should remain linkable and clearly marked if they
  still have historical balances.
- Concurrent expense edits, deletions, and settlements must refresh the
  originating ledger and not overwrite the other ledger's cached balance.
- A combined relationship total must never be used as the amount for a direct
  settlement without an explicit scope choice.
- A payment larger than the direct balance must show exactly how the remainder
  is assigned across Groups before it is recorded.

## Acceptance criteria

1. The Friend page's direct balance matches only active, non-group expenses and
   direct settlements between the two people.
2. A group expense paid by a third party never appears in the Friend direct
   expense list and never changes the Friend direct balance.
3. Group balances are shown separately by Group and currency when relevant.
4. Every Group balance row links to the correct Group detail page.
5. Group expense history remains complete and correctly calculated on Group
   detail.
6. The Friend settle action cannot settle or mutate a Group balance.
7. Group settlement cannot mutate the Direct balance.
8. Partial settlements update only their selected ledger.
9. Deleted and edited records recalculate only their originating ledger.
10. Direct and Group balances remain correct after refresh, realtime updates,
    sign-out/sign-in, and app restart.
11. Empty states distinguish “no direct expenses” from “no shared Group
    balances.”
12. Light and dark themes clearly distinguish direct balances, Group balances,
    and navigation affordances.
13. Combined settlement preview allocates direct balance first and then Group
    balances, creating one settlement per scope.
14. Different currencies cannot be silently combined.
15. Automated tests cover direct expenses, third-party-paid Group expenses,
    pair-participating Group expenses, multiple Groups, zero shares, unequal
    splits, multiple currencies, partial settlements, allocation previews,
    deletion, and concurrent refresh behavior.

## Implementation sequence

1. Add characterization tests for current direct and Group balance behavior.
2. Add a pure scope-classification and balance fixture suite.
3. Extend the Friend read model with separate direct and Group balance fields.
4. Add a Group-balance summary query/service keyed by Friend and Group.
5. Update the Friend page to render direct expenses separately from Group
   balance summaries.
6. Restrict Friend settlement mutations to the Direct ledger.
7. Add Group navigation and explicit scope labels to settlement flows.
8. Update realtime invalidation so direct and Group changes refresh the correct
   projections.
9. Run migration, adapter, service, and screen-level tests against a linked
   database.
10. Remove temporary mixed-scope compatibility paths after parity is proven.

## Out of scope

- Replacing the Group balance algorithm or debt simplification strategy.
- Introducing automatic cross-ledger debt conversion.
- Automatically moving a Group debt into the Direct ledger.
- Redesigning the entire Group detail screen.
- Adding payment-provider integrations.
- Changing expense split mathematics.
- Purging or restoring soft-deleted expenses.
