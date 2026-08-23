# Detox coverage map

The release suite runs 11 focused device journeys. The smoke journey is a
separate development check and is excluded from the default full-suite match.

| Previous device case | Replacement | Layer |
| --- | --- | --- |
| `auth.test.js` sign-in screen | `auth.test.js` sign-in contract and email input | Detox |
| `groups.test.js` native Groups navigation | `group-management.test.js` opens Groups before the lifecycle | Detox |
| `groups.test.js` create a group | `group-management.test.js` creates, renames, and deletes one Group | Detox |
| `expenses.test.js` create a Group and Expense | `expense-lifecycle.test.js` creates, edits, and deletes one Expense | Detox |
| `settlements.test.js` Group settlement | `activity-balances.test.js` settles, searches Activity, and checks the Group balance | Detox |
| `split-methods.test.js` invalid unequal split, percentage, shares, and other calculation combinations | `utils/split-validation.test.ts` validation tests | Vitest |
| `deletion-guards.test.js` separate Group and member cases | One combined case with two independently seeded Groups | Detox |

The retained device journeys are:

1. Authentication contract and email input.
2. Configured-account sign-in.
3. Group lifecycle.
4. Expense lifecycle.
5. Custom split.
6. Friend-paid Expense payer selection.
7. Group settlement, Activity search, and settled balance.
8. Friend settlement.
9. Settlement reversal.
10. Direct Expense lifecycle.
11. Group and member deletion guards.

The full suite creates two run-named Groups through the UI. Run-scoped cleanup
purges only the current run's `Detox Group <runId>` prefix. The combined
deletion guards use one run-scoped seeded Group, and the other seeded journeys
create no UI Group or Friend. The smoke journey creates one additional Group
only when run explicitly.
