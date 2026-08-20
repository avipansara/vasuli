# Friend settlement logic

## Scope

This document defines how Vasuli calculates and applies settlements between two
users who share both a Direct ledger and one or more Group ledgers. It replaces
the previous implicit combined-settlement behavior with explicit per-scope
settlement records and auditable full-net cross-scope offsets.

## Implementation status

The current application implements the settlement model defined
by this specification:

- Direct and Group balances are calculated separately.
- Combined settlement allocation exists and prioritizes Direct balance for
  same-direction debts.
- Partial payments and oldest-activity Group ordering are supported.
- Currency validation and stale-balance protection are implemented.
- Settlement operations, idempotency, realtime refresh, and focused tests exist.
- Group-only settlement flows exist.
- Cross-scope transfers are reserved for full-net and zero-net settlement
  operations and remain explicit, auditable records.
- Cash allocations persist as separate Direct or Group settlement rows.
- Friend detail and settle-up show the Direct, per-Group, and combined
  projections and preview the allocation before confirmation.

Remaining work is live database rollout verification plus mounted light/dark and
error-state UI checks. These checks should not reopen the accounting rules below
without a reproduced projection or settlement-contract failure.

## Ledgers

For any pair of users (current user + friend), there are two independent
ledgers:

1. **Direct ledger** — expenses with no `group_id` that involve both users,
   plus direct settlements between them.
2. **Group ledger(s)** — expenses with a `group_id` that involve both users,
   plus group-scoped settlements between them. Each shared group is a separate
   Group ledger.

A partial payment in one ledger does **not** change the other ledger. A full-net
settlement may also record an explicit cross-scope offset so opposing balances
can be cleared without representing the offset as a cash payment. The combined
relationship total is not a third ledger.

## Balances shown on the Friend page

The Friend detail page displays:

```text
Direct balance
You owe Alex $20

Group balances with Alex
Trip 2026       Alex owes you $5
Roommates       You owe Alex $8

Combined total (same currency only)
You owe Alex $23
```

### Calculation

- **Direct balance** = sum of direct expenses and direct settlements between the
  two users.
- **Group balance (per group)** = the friend’s projected balance in that group,
  calculated from the full group ledger.
- **Combined total** = Direct balance + sum of Group balances, only when all
  outstanding balances share the same currency. If currencies differ, the
  combined total is hidden and the user must settle per currency.

### Combined net and full-net settlement

The combined total is a signed net amount. A partial payment only affects the
scopes that receive an allocation. When the user pays the full combined net
amount, the app settles all scopes by recording the cash allocations and an
explicit cross-scope offset for opposing balances.

For example:

```text
Direct:    You owe Alex $20
Trip 2026: Alex owes you $5
Roommates: You owe Alex $8
Combined:  You owe Alex $23
```

If you pay $20, the payment is applied to Direct first. Direct becomes settled,
while both Group balances remain unchanged:

```text
Direct:    settled
Trip 2026: Alex owes you $5
Roommates: You owe Alex $8
Combined:  You owe Alex $3
```

If you pay the full combined net amount of $23, the app applies $20 to Direct,
applies $3 to Roommates, and records an explicit $5 offset from the Trip 2026
credit against the remaining Roommates balance. All scopes then become settled.
The offset is not an additional cash payment and must be visible in the
settlement history.

## Settlement action

The Friend page offers one **Settle Up** action. It records one or more cash
settlements allocated across Direct and Group scopes, and may record explicit
cross-scope offsets when the user pays the full combined net amount.

When the combined net amount is zero but individual scopes offset each other,
the same action remains available with a `$0` cash payment. The confirmation
preview must explain that no money is being transferred and list the internal
cross-scope offsets that will clear the individual scopes.

The Settle Up form is prefilled with the full combined net amount when one
exists. The user may enter any lower positive amount for a partial settlement,
but may not enter an amount greater than the full combined net amount.

## Combined settlement allocation

When the user chooses **Settle Combined**, the app shows a preview of how the
payment will be allocated before confirming.

### Allocation rules

1. Apply the payment to the Direct balance first.
2. Apply any remaining amount to same-direction Group debts, ordered by oldest
   outstanding activity. Manual scope ordering is out of scope for the initial
   implementation.
3. If the payment equals the full combined net amount, apply explicit
   cross-scope offsets for opposing balances so every scope is settled.
4. Stop when the payment is exhausted.
5. Create one settlement record per scope that receives a cash allocation.
6. Each settlement record stays in its own ledger (Direct settlements have
   `group_id = NULL`; Group settlements have `group_id = <group-id>`).
7. Record each cross-scope offset separately and never treat it as a cash
   payment.

When the combined net amount is zero, skip cash settlement allocations and
apply only the cross-scope offsets. Use the same confirmation flow and show the
zero cash amount and every offset before confirmation.

### Partial payment behavior

A partial payment only reduces the scopes it touches. Scopes that receive no
allocation remain unchanged.

### Example 1: Direct debt only

- Direct: You owe Alex $10
- Group: Trip — settled
- Combined: You owe $10

You pay $5:

- Direct: $5 applied → You owe $5
- Group: $0 applied → unchanged
- Records: one direct settlement of $5

Result:

```text
Direct:   You owe Alex $5
Group:    settled
Combined: You owe Alex $5
```

### Example 2: Group debt only

- Direct: settled
- Group: Trip — You owe Alex $8
- Combined: You owe $8

You pay $5:

- Direct: $0 applied → unchanged
- Group: Trip — $5 applied → You owe $3
- Records: one group settlement of $5 in Trip

Result:

```text
Direct:   settled
Group:    Trip — You owe Alex $3
Combined: You owe Alex $3
```

### Example 3: Mixed direct debt and group credit

- Direct: You owe Alex $20
- Group: Trip — Alex owes you $5
- Combined: You owe Alex $15

You pay $5:

- Direct: $5 applied → You owe $15
- Group: $0 applied → Alex still owes you $5 in Trip
- Records: one direct settlement of $5

Result:

```text
Direct:   You owe Alex $15
Group:    Trip — Alex owes you $5
Combined: You owe Alex $10
```

You pay another $10:

- Direct: $10 applied → You owe $5
- Group: $0 applied → unchanged
- Records: one direct settlement of $10

Result:

```text
Direct:   You owe Alex $5
Group:    Trip — Alex owes you $5
Combined: $0
```

### Example 4: Payment larger than combined net

A payment cannot exceed the absolute combined net unless the user explicitly
chooses to overpay a specific scope. Overpayment is not supported by the Settle
Up flow. The maximum is:

```text
max_payment = |Direct balance + sum(Group balances)|
```

If the user wants to pay more than the combined net (for example, to clear a
Group balance while also clearing Direct), the user must settle the relevant
scope separately; Settle Up must reject the overpayment.

## Settlement records

Each settlement is stored as one row in `public.settlements`:

| Field | Direct settlement | Group settlement |
|---|---|---|
| `group_id` | `NULL` | `<group-id>` |
| `from_user_id` | payer | payer |
| `to_user_id` | receiver | receiver |
| `amount` | allocated amount | allocated amount |
| `currency` | settlement currency | settlement currency |
| `operation_id` | optional operation link | optional operation link |

Full-net cross-scope offsets are stored separately in
`settlement_scope_transfers`, linked to the same settlement operation. They are
not cash payments and must be shown distinctly in settlement history.

Both users must be able to see the same cross-scope offset entries in the
affected Group histories and in the friendship settlement history. All members
of an affected Group may see the offset entry in that Group’s history. The
entries must identify the related settlement operation and clearly state that
they are internal balance offsets, not additional cash payments. An offset is
pair-scoped: it changes only the balances between the two users involved and
must not change any other Group member’s balance.

## Reversals and edits

- A settlement operation is immutable after creation and can only be reversed
  as a whole.
- Reversing an operation restores every Direct settlement, Group settlement,
  and cross-scope offset created by that operation atomically.
- A reversed operation cannot be reversed again; retries are idempotent.
- Reversal must remain available for historical operations even if a Group has
  since been archived or deleted.
- A zero-net operation reverses only its cross-scope offsets.
- The original operation remains visible in history with the reversal actor and
  timestamp; individual settlement rows are not edited or deleted.
- Reversal events for Group-scoped settlements and offsets are visible to all
  members of the affected Groups.
- The operation may be reversed from either the Friend settlement history or
  any affected Group history, and the result is the same atomic reversal.
- Only the two users involved in the operation may reverse it. Other Group
  members have read-only visibility.
- Concurrent changes must be protected by stale-balance validation so a
  reversal cannot overwrite newer activity.
- Editing an amount is not supported. The user must reverse the operation and
  create a new one.

## Edge cases

- **Multiple currencies:** Combined settlement is only offered when all
  outstanding scopes share the same currency. Otherwise the user settles per
  scope/currency.
- **Opposite directions across scopes:** A Direct debt and a Group credit are
  normal. The combined total is the signed sum. Partial allocation applies
  Direct first and does not transfer opposing balances. A full-net settlement
  records an explicit cross-scope offset so the opposing scopes can all be
  cleared.
- **Zero share participants:** A user who is a group member but has no splits or
  settlements in that group has a zero Group balance and receives no allocation.
- **Deleted expenses:** Soft-deleted expenses are excluded from active balances
  but remain visible in history.

## Implementation notes

- Keep `settlement_scope_transfers` as the auditable mechanism for full-net
  cross-scope offsets, but do not use it for partial payments.
- Update combined settlement allocation to produce multiple `settlements` rows
  plus explicit offset records when the full net is settled.
- Update Friend detail to show Direct balance + Group balance list + combined
  total and expose one “Settle Up” action.
- Update cache invalidation so Direct settlements refresh Direct balances and
  Group settlements refresh Group balances independently.
