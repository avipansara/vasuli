# Vasuli

Vasuli tracks shared expenses and what people owe each other, both within
groups and directly between friends.

## Language

**Settlement operation**:
One action that reduces or clears balances between two people. It may include
a payment, non-cash balance adjustments, or both.

**Payment**:
Money recorded as paid by one person to another. A balance adjustment is not
an additional payment.

**Scope transfer**:
A non-cash balance adjustment that moves an obligation between a shared group
and the direct friendship balance without changing the pair's total debt.
The user-facing term is "balance adjustment".

**Balance clearing**:
A historical settlement operation that clears offsetting balances without
a payment. A naturally zero overall balance is a state, not such an operation.

**Balance cancellation**:
The non-cash removal of equal opposing obligations as part of a full
settlement. It does not represent additional money paid.

**Full friend settlement**:
Payment of the remaining nonzero overall amount that clears the included
direct and shared-group balances between two people.

**Partial friend payment**:
A payment below the remaining overall amount that reduces the balances
it is applied to while leaving opposing balances unchanged.

**Settlement deletion**:
Undoing one settlement operation's payment and linked balance adjustments
while retaining its history and preserving other financial activity.
