---
status: accepted
date: 2026-09-06
decision-makers: Varun Yadav
consulted: User-provided settlement screenshots and Vasuli settlement code
informed: Future Vasuli implementation agents and maintainers
supersedes: 0001-cross-scope-settlement-operations.md
---

# Settle the overall balance while preserving partial-payment behavior

## Context and problem statement

Friend detail combines direct expenses and shared-group balances between two
users. Users expect paying the full overall amount to finish settling with
that friend, including groups. They also expect partial payments to reduce
only the amount paid and naturally offsetting balances to remain unchanged.

The previous local version of this ADR prohibited new scope transfers and
required payments to stay within each scope. That cannot meet the agreed
full-settlement outcome: with $22 owed directly and $10 receivable in a group,
a $12 direct payment alone leaves $10 outstanding in each direction.

On 2026-09-06 the user approved partial-payment, full-payment, naturally zero,
and Delete behavior, then authorized overwriting this unpublished ADR.
The number and filename are retained to preserve links. This version replaces
the earlier local decision; implementation is pending.

The user's screenshots show a $3 partial payment leaving $19 direct debt and
a $10 group receivable, and a naturally zero overall balance with an open
group balance. Full payment clearing all included balances is an explicit
user requirement. The screenshots do not establish full-payment or deletion
parity with Splitwise.

## Decision

Use one settlement operation between two users to record actual payment and,
only for a full payment of a nonzero overall balance, associated non-cash
cancellation. Keep the two kinds of effect distinguishable internally and
present one payment record with details to the user.

| Scenario | Required behavior |
|---|---|
| Partial friend payment | Apply the actual payment direct first, then to smaller same-direction group balances. Leave opposing balances unchanged. |
| Full payment of the remaining nonzero overall balance | Apply actual payment and cancel remaining opposing balances so every included direct/group pair balance becomes $0. |
| Naturally zero overall balance | Display `You are settled up overall`; retain individual balances and create no settlement or cancellation record. |
| Group settlement | Change only that group's balances. |
| Delete | Undo the entire operation's payment and cancellation together, preserving unrelated activity and retaining deleted history. |

The friend operation includes the supported USD direct and shared-group
balances between these two users that contribute to the displayed total.
It must not change another member's balance. The same rules apply with the
payer and recipient exchanged.

### Examples

Each row below starts with $22 owed directly and $10 receivable in a group.

| Actual payment | Direct afterward | Group afterward | Overall afterward |
|---|---|---|---|
| $3 | You owe $19 | Friend owes $10 | You owe $9 |
| $6 | You owe $16 | Friend owes $10 | You owe $6 |
| $10 | You owe $12 | Friend owes $10 | You owe $2 |
| $12 | $0 | $0 | $0 |

For the $12 payment, cancelling the remaining $10 owed each way is not an
additional payment. The activity says `You paid your friend $12`; details
show the direct/group balances cleared.

After a $3 partial payment, paying the remaining $9 is a full settlement.
Deleting that final operation restores $19 direct owed and $10 group
receivable, leaving $9 owed overall and preserving the earlier $3 payment.

If balances instead start at $10 owed directly and $10 receivable in a group,
the overall total is $0 but both balances remain. Merely viewing or refreshing
a screen must never clear them or create a zero-payment settlement.

### Operation contract

- Retain the settlement-operation parent as the unit of confirmation,
  idempotency, history, and Delete. Payment and any cancellation commit
  atomically under one payment intent.
- Keep actual cash distinct from non-cash effects. Persist enough attribution
  to recover each affected pair/scope, original effect, and actual amount paid
  for history and reversal. Do not manufacture extra cash payments to make
  per-scope totals reach zero.
- Validate the current balances, participants, currency, and allocation on
  the server. Compare amounts in integer cents. Preview and commit must agree
  on partial versus full status and every affected balance. A stale plan
  requires refreshed confirmation, never silent reclassification on retry.
- Keep `reverse_settlement_operation` as the internal Delete command if it
  satisfies whole-operation reversal. Its retirement is not required.
- Preserve ADR-0003's participant-based durable sign convention wherever
  existing transfer records are read or reused. Any replacement representation
  must prove the same projection and reversal outcomes.
- The blanket ban on all new cross-scope effects is no longer the target
  architecture. Existing frozen-transfer guards remain in place until a
  validated implementation can enforce this narrower contract. Do not simply
  remove the guard or revive unrestricted legacy transfer planning.
- The precise cancellation storage/RPC changes remain implementation work.
  This ADR accepts the operation contract; it does not claim an existing
  table, migration, or planner already implements it.

### Presentation

Friend detail shows net overall with access to the direct/group breakdown.
A group headline claims only that group. Partial confirmation shows where
money goes and which opposing balances stay unchanged. Full confirmation
shows the actual payment and all included balances that will clear.

History shows one settlement record with the actual money paid. Group entries
refer to that same operation. Delete from any entry affects the entire
operation and explains all affected balances before confirmation. Avoid
ledger, scope-transfer, and reversal-command vocabulary in user-facing copy.

## Alternatives considered

- Per-scope payments only: simpler writes, but a full overall payment leaves
  opposing group/direct balances open. Rejected because it fails the user's
  full-settlement requirement.
- Cancel opposing balances on every partial payment: reduces outstanding
  scopes sooner, but a $3 payment would clear the $10 group receivable.
  Rejected after the user supplied the partial-payment example.
- Automatically clear naturally zero totals: removes open balances, but
  changes groups without a payment or explicit settlement action. Rejected.
- Payment plus cancellation only on full settlement: chosen. It matches the
  agreed examples while requiring atomic non-cash effects and their reversal.

## Consequences and constraints

The UI becomes simpler, but non-cash accounting remains necessary internally.
Removing ledger terminology does not remove the need to explain and undo
balance changes. Partial and full settlement need distinct plans and tests.

Existing per-scope tickets, frozen-transfer checks, legacy backfill work, and
read models cannot be assumed to satisfy this revised decision. Review them
before reuse. Preserve old balances, history, timestamps, attribution, and
currencies during migration, with before/after projection parity. Do not
purge existing records or rewrite deployed migrations. Existing deletion
protections for stale or later activity continue to apply.

No new dependency, environment variable, or configuration change is selected.
Non-USD support, general accounting journals, other-member debt simplification,
zero-payment `call it even`, and production deployment are outside this decision.

Friend Settle Up accepts amounts greater than zero and no more than the
absolute current overall balance. Entering more must be blocked with an error
that states the current maximum. The old same-direction eligible-scope cap is
superseded.

## Implementation plan

1. Reconcile the tickets under `.scratch/per-scope-settlement/issues/` with
   the [spec](../../.scratch/per-scope-settlement/spec.md). Prior completion
   evidence remains historical; add work for full-settlement cancellation.
2. Update `services/settlement-service.ts` and its planner tests with separate
   partial/full plans. Preserve direct-first and smallest-group partial order.
   Audit existing `ADR-0004` code comments for the superseded blanket ban.
3. Design and implement the atomic payment/cancellation contract under
   `supabase/migrations/` and `supabase/tests/`. Inspect actual deployed state
   before writing additive migrations. Retain authorization, idempotency,
   stale checks, and whole-operation Delete. Validate legacy/backfilled
   history and participant orientation before enabling revised writes.
4. Update `app/friend-settle/[id].tsx`, shared settlement components, and
   `services/friend-settlement-operation-view.ts` so previews, receipts, and
   history distinguish actual cash from cancellation without ledger copy.
5. Update friend/group read models, operation projections, and activity views
   so confirmed operations refresh all affected balances. Keep
   `app/groups/settle/[id].tsx` group-only.
6. Verify `services/settlement-delete-flow.ts` and shared Delete handling undo
   the entire operation from either friend or group activity, preserving
   earlier independent payments and unrelated activity.
7. Update unit, mounted, SQL, and E2E coverage, then inspect light/dark flows
   on migrated dev. Production rollout requires a separate instruction.

## Verification

- [ ] Every example produces the stated cash record and per-scope balances.
- [ ] $3 then $9 clears all included balances; deleting $9 restores the state
  after $3, without undoing that earlier payment.
- [ ] Naturally zero totals cause no writes and leave group balances open.
- [ ] Multiple groups, both payer directions, and cent precision are covered;
  unrelated members' balances remain unchanged.
- [ ] Payment and cancellation are atomic, retries are idempotent, and stale
  plans cannot silently change from partial to full or vice versa.
- [ ] Receipts count actual cash once; cancellation is never extra cash.
- [ ] Whole-operation Delete restores its effects and keeps deleted history.
- [ ] Legacy/backfilled projections and deletion remain correct after any
  migration; deployed migration files are unchanged.
- [ ] Friend, group, history, and Delete flows are inspected in light/dark
  mode, including loading, error, retry, and success states on migrated dev.
- [ ] `npm run precommit` and relevant SQL regression checks pass.
- [ ] An amount above the absolute current overall balance is blocked before
  commit and covered by component, planner, and stale-balance tests.

## Related decisions

This ADR supersedes [ADR-0001](0001-cross-scope-settlement-operations.md).
Its analysis of net payment leaving residual scope balances remains useful;
its broader operation rules do not override the cases above.
[ADR-0002](0002-settlement-module-consolidation.md) continues to govern module
ownership. [ADR-0003](0003-canonical-settlement-balance-signs-and-rpc-boundary.md)
continues to govern canonical signs and command boundaries. Revisit this
ADR for zero-payment clearing, other currencies, or other-member debt
simplification.
