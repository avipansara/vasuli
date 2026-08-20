# Group Expense Simplification

## Problem Statement

When several people share expenses in a group, the current balances can create
unnecessary payment chains. For example, one person may owe Person B, Person B
may owe Person C, and Person C may owe the first person. Asking everyone to pay
the person shown in the original balances creates more payments than necessary
and makes it harder to understand how the group can settle efficiently.

Users need a simple, trustworthy way to see the smallest practical set of
payments that settles the group’s current net balances.

## Solution

Add an optional, on-demand “Simplify balances” action inside the existing group
settlement experience. When requested, the app will calculate each group
member’s net balance from all group expenses, expense splits, and recorded
settlements, then recommend direct payments from members who owe money to
members who are owed money.

The recommendations will preserve the total amount owed by every member while
reducing unnecessary intermediary payments. Recommendations are previews, not
payments or historical ledger entries. A payment is recorded only when the
involved user confirms that the real payment occurred, using the existing
settlement flow.

## User Stories

1. As a group member, I want to see whether my group can be settled with fewer payments, so that settling the group is simpler.
2. As a group member, I want the app to calculate recommendations from all group expenses, so that the plan reflects the group’s actual shared costs.
3. As a group member, I want existing settlements included in the calculation, so that I am not asked to repeat a payment that has already been recorded.
4. As a group member, I want people who are owed money and people who owe money to be identified correctly, so that every recommended payment has the right direction.
5. As a group member, I want circular debts to be netted out, so that unnecessary payment loops disappear.
6. As a group member, I want the app to recommend direct payments between debtors and creditors, so that money does not need to pass through an intermediary.
7. As a group member, I want the recommended plan to preserve every member’s net balance, so that simplification changes the route of payment but not the amount each person ultimately owes or receives.
8. As a group member, I want the plan to use as few payments as practical, so that the group has fewer actions to complete.
9. As a group member, I want recommendations to be rounded consistently to currency precision, so that payments do not contain confusing fractional-cent amounts.
10. As a group member, I want negligible rounding differences treated as settled, so that the app does not show meaningless payment recommendations.
11. As a group member, I want to see who should pay whom and how much, so that I can coordinate settlement with the group.
12. As a group member, I want to see that the plan is based on the group’s current balances, so that I can trust the recommendation.
13. As a group member, I want a clear empty state when the group is already settled, so that I know no payment is required.
14. As a group member, I want a clear state when simplification cannot reduce the number of payments, so that I can still use the existing direct settlement options.
15. As a group member, I want to refresh the recommendations after another member adds an expense or settlement, so that I do not act on stale balances.
16. As a group member, I want to request simplification only when I need it, so that my normal group balances remain familiar.
17. As a group member, I want to record a recommended payment when I am the payer or recipient, so that I do not have to re-enter the people or amount manually.
18. As a group member, I want to see recommendations involving other members without falsely recording those payments myself, so that the ledger remains trustworthy.
19. As a group member, I want to record recommendations one at a time, so that I can coordinate with the people involved and correct a plan before continuing.
20. As a group member, I want a recorded payment to update the remaining recommendations and balances, so that the UI always reflects what is still outstanding.
21. As a group member, I want the existing manual settlement flow to remain available, so that I can handle partial or exceptional payments myself.
22. As a group member, I want incomplete, loading, offline, and error states to be understandable, so that I know whether the recommendations are ready to use.
23. As a group member, I want a settlement created through the normal confirmation flow to appear in the group’s activity history, so that the group has an auditable record of what happened.
24. As a group member, I want recommendations separated by currency, so that incompatible balances are never combined or converted implicitly.
25. As a group member, I want members with zero net balance excluded from payment recommendations, so that the plan is easy to scan.
26. As a group member, I want the plan to remain valid when a group has more than three members, so that simplification works for real groups rather than only the circular-debt example.
27. As a group member, I want the feature to avoid changing expense ownership or historical records, so that simplification remains a settlement aid rather than a rewrite of the group ledger.

## Implementation Decisions

- Use the existing group detail data contract as the source for expenses,
  expense splits, settlements, members, and current balances. Do not introduce
  a second balance calculation for the feature.
- Add a pure simplification calculation at the highest reusable service
  boundary. Its input is normalized member balances for one group and one
  currency, and its output is an ordered list of recommended transfers
  containing payer, recipient, and currency amount.
- Interpret the existing balance convention consistently: a positive member
  balance means the member is owed money; a negative member balance means the
  member owes money.
- Match debtors to creditors by transferring the smaller remaining amount at
  each step. Continue until all balances are within the existing settled
  threshold. This removes cycles and produces a deterministic practical
  reduction in payment count; the initial feature must not promise a globally
  optimal minimum for every possible balance set.
- Exclude zero and threshold-level balances from the output. Round transfer
  amounts using the app’s existing currency precision and settled-balance
  threshold.
- Keep the calculation deterministic. When multiple valid matches exist, use a
  stable ordering derived from the input member order so the UI does not jump
  between equivalent plans.
- Keep simplification scoped to one group and one currency at a time. Because
  expenses and settlements already store currency while groups do not, the
  group detail data must be partitioned by currency before balances or
  recommendations are calculated. Never combine or convert currencies
  implicitly.
- Extend the current group settlement experience with a simplification review
  state. The review should show each recommended transfer, the total number of
  payments, and an empty/settled state when appropriate.
- Treat recommendations as ephemeral derived data. Do not store a
  simplification record or create settlements when the preview is generated.
  Reuse the existing settlement creation path only for a confirmed real
  payment, storing it as a normal group settlement with no special settlement
  type.
- After a payment is recorded, update the cached group detail data optimistically
  using the existing settlement application behavior, then invalidate the
  relevant group, group-list, friend-summary, and activity queries as the
  current settlement flow does.
- Preserve the existing manual “settle with a member” flow for partial amounts,
  user-directed payments, and cases where a user does not want to follow the
  recommendation. A user may create a recommended settlement only when they
  are the payer or recipient; recommendations between two other members are
  informational until one of those members records the payment.
- Use the existing member names and group currency presentation conventions.
  The recommendation UI must expose payer and recipient clearly and must not
  rely on color alone to communicate payment direction.
- No database schema change is required for the initial on-demand feature. No
  group-level simplify toggle is persisted initially. No historical expenses
  or settlements are modified when a recommendation is calculated.
- No new network endpoint is required. Recommendation calculation should run
  from the group detail data already loaded by the client; recording a payment
  continues to use the existing settlement service and its existing
  participant authorization rules.
- The recommendation preview must be treated as stale when a relevant expense,
  settlement, membership, or currency-specific balance changes. Before
  recording a recommendation, refresh or validate the current balances and
  require review again if the recommendation no longer matches.

## Testing Decisions

- Prefer external behavior over implementation details. Tests should verify
  the recommended transfers and their financial invariants, not the internal
  queue or sorting implementation.
- Add focused unit coverage alongside the existing group-balance and settlement
  tests for the simplification seam.
- Cover the circular example: A owes B, B owes C, and C owes A; the result must
  remove the cycle and produce only the necessary net transfer(s).
- Cover a multi-member group with several creditors and debtors, including a
  creditor whose balance is fully satisfied before the next debtor is matched.
- Cover exact settlement, partially settled groups, already-settled groups, and
  tiny rounding residuals.
- Cover negative/positive balance direction so every transfer’s payer and
  recipient are correct.
- Cover deterministic ordering when multiple valid outputs are possible.
- Cover conservation invariants: the sum of recommended incoming and outgoing
  amounts must reconcile with the input balances, and no member may be both a
  payer and recipient in the same final recommendation unless the input model
  requires separate currencies (which is out of scope here).
- Reuse the existing test data factories and conventions from group detail,
  group balance, and settlement-service tests.
- Add integration-level coverage for the group settlement experience only where
  practical: the review state should display recommendations, recording one
  recommendation should use the existing settlement path, and the remaining
  plan should reflect the new settlement.
- Do not add tests that assert private component structure, exact styling, or
  implementation-specific React state transitions.

## Out of Scope

- Rewriting or deleting historical expenses or settlements.
- Automatically recording all recommended payments without user review or
  confirmation.
- Cross-group debt simplification. A user’s balances in separate groups remain
  separate.
- Combining friend-level, non-group balances with group balances.
- Currency conversion or exchange-rate management.
- Multi-currency netting inside one group.
- Choosing a socially preferred payer, payment method, due date, or payment
  processor.
- Automatically notifying external payment services or initiating bank/card
  transfers.
- Guaranteeing a mathematically unique minimum when multiple equally minimal
  payment plans exist; the app only needs a deterministic practical plan.
- Changing permissions, RLS policies, settlement authorization, or the database
  schema for the initial version.
- Redesigning the group balance calculation beyond the seams needed to consume
  its existing output.

## Further Notes

- The user-facing concept should be framed as “Simplify balances” or “Simplify
  group settlement,” not as a replacement for recording expenses.
- The feature should be useful even when no reduction is possible: showing the
  current direct payments and explaining that the group is already in its
  simplest form is preferable to hiding the action.
- The proposed testing seam is one pure balance-to-transfer calculation,
  integrated with the existing group settlement route and service. This keeps
  the financial behavior independently verifiable while minimizing changes to
  the existing Supabase-backed data flow.
- Wayfinder gap review resolved these product decisions:
  - Currency is calculated independently per currency because expenses and
    settlements store currency while groups do not. No implicit conversion or
    cross-currency netting is allowed.
  - Simplification is optional and on demand inside “Settle Up”; it is not an
    always-on or persisted group setting in the initial version.
  - Recommendations are previews, not settlements. Only the payer or recipient
    may confirm the real payment through the existing participant-authorized
    settlement flow.
  - The initial algorithm promises a deterministic practical reduction, not an
    exact global minimum for every balance set.
  - A recommendation must be refreshed or revalidated before recording if
    relevant group data changes.
- Remaining implementation decisions:
  - Partial completion needs a recovery rule. If one recommended payment is
    recorded and another fails, the remaining plan must be recalculated from
    persisted balances rather than treated as an all-or-nothing batch.
  - Activity attribution should be confirmed during implementation if the
    current user can confirm a payment while the settlement payer is another
    participant. The initial implementation should preserve the existing
    settlement/activity authorization model unless product requirements change.
- The remaining items are implementation details rather than blockers for the
  product direction.
- This specification is marked `ready-for-agent` conceptually. The configured
  issue-tracker connector and the `ready-for-agent` label vocabulary were not
  available in this session, so it could not be published remotely.
