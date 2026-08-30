# Make the Detox E2E suite faster and cheaper to maintain

## Status

Proposed on 2026-08-23.

## Problem statement

The iOS Detox suite has 20 test cases across 13 files. Its runtime is dominated
by repeated prerequisite work through the UI rather than by the behavior each
test is meant to verify.

A static count of the current test paths finds approximately:

- 18 authenticated launches or login attempts
- 17 Group creations
- 12 Friend additions to Groups
- 15 Expense creations, including Direct and custom-split Expenses

Most settlement, deletion, balance, payer, and split tests recreate the same
Group and membership state before reaching their unique assertion. The suite
also branches on expected UI state by waiting for timeouts, performs several
database requests during both cleanup passes, and uses one shared account and
one simulator. That shared state prevents safe parallel execution.

The suite already keeps the app installed between test files and reuses the
persisted Supabase session. Those optimizations should remain.

## Goal

Cut the median full-suite execution time by at least 40 percent on the same
machine, simulator, release binary, and development Supabase project while
preserving the current behavior coverage.

Measure build time separately. The primary target is the time from the start
of pre-run cleanup to the end of post-run cleanup.

The completed work should also provide:

- per-test and per-phase timing in normal test output;
- deterministic, test-scoped data that can support future sharding;
- a small smoke suite for routine development;
- a full suite for release and scheduled verification;
- failure exit codes that cannot be hidden by successful cleanup.

## Non-goals

- Replacing Detox with another E2E framework.
- Testing every calculation and validation combination on a simulator.
- Sharing one mutable Group or Expense across otherwise independent tests.
- Raising Jest worker count before test data and devices are isolated.
- Running cleanup or fixture functions against production.
- Changing product behavior solely to make a test pass faster.
- Including the Xcode build in the 40 percent runtime target.

## Measurement plan

Establish the baseline before changing the suite. Use the same built release
app and run the full suite three times. Record the median for:

- pre-run cleanup;
- Detox startup and simulator allocation;
- each test case;
- total Jest execution;
- post-run cleanup;
- total wrapper execution.

Record failures, Detox retries, and tests that consume most of their timeout.
Do not compare a cold Xcode build with a reused binary.

After every implementation ticket, repeat the three-run measurement. Store a
short before-and-after table in this spec or in the pull request that completes
the work.

## Test placement rules

Use the lowest test layer that can prove the behavior.

- Keep one Detox case when native navigation, keyboard behavior, gestures,
  accessibility wiring, or a complete server-backed user journey is the risk.
- Use a component or route test for rendering, form state, disabled controls,
  and error presentation that does not require a real device.
- Use Vitest for split calculations, rounding, balance projection, mutation
  policy, and other pure or service-level behavior.
- Seed prerequisites that are not the subject of the test. A settlement test
  may start with a Group, Friend, and outstanding Expense already present.
- Create data through the UI only when the creation flow is part of the
  behavior under test.
- Keep each test independent. Fixture reuse may reuse immutable definitions,
  but tests must not depend on mutations left by an earlier test.

## Proposed suite shape

| Current coverage | Decision | Resulting Detox coverage |
| --- | --- | --- |
| `auth.test.js` | Keep authentication coverage, combine basic rendering and input checks where practical | Sign-in screen contract and one real configured-account sign-in |
| `groups.test.js` | Fold into Group management | Native Groups navigation is covered by the Group lifecycle |
| `group-management.test.js` | Keep | Create, rename, and delete one Group |
| `expenses.test.js` | Fold into Expense lifecycle | Expense creation remains covered before edit and deletion |
| `expense-lifecycle.test.js` | Keep | Create, edit, and delete one Expense |
| `split-methods.test.js` | Reduce from four cases to two | One successful custom split and one invalid-split UI response |
| `payer-selection.test.js` | Keep with seeded Group membership | Friend-paid Expense flips the visible relationship direction |
| `settlements.test.js` | Fold into Activity and balances | Group settlement success remains covered in the cross-screen journey |
| `activity-balances.test.js` | Keep with seeded prerequisites | Activity search and post-settlement Group balance |
| `friend-settle.test.js` | Keep or fold into reversal after timing comparison | Friend-level combined settlement |
| `settlement-reversal.test.js` | Keep with seeded outstanding balance | Reversal restores Friend and Group views |
| `direct-expenses.test.js` | Keep with seeded friendship | Direct Expense create and delete across Friend and Activity views |
| `deletion-guards.test.js` | Combine the two guards into one scenario or seed each independently | Group deletion and member removal remain blocked by an outstanding balance |

The intended result is 10 to 12 device journeys. The exact count is less
important than removing setup that does not contribute to the assertion.

Split percentage, shares, cent allocation, and unequal-total validation already
have focused coverage in `utils/split-validation.test.ts`. Keep the device cases
focused on wiring the form controls to that tested behavior.

## Fixture and cleanup design

Every run receives a unique `runId`. Every worker receives a `workerId`. Every
created record carries a deterministic E2E marker derived from both values.
Human-visible names should remain readable, for example
`Detox Group <runId> <testName>`.

Add a development-only, authenticated fixture boundary that can prepare these
states:

- accepted Friendship;
- Group with the test account and Friend as members;
- Group with an outstanding Expense and known balance direction;
- Direct Expense with known balance direction;
- completed settlement eligible for reversal.

The fixture boundary may be one guarded RPC with explicit scenario inputs or a
small set of composable guarded RPCs. It must:

- refuse non-development Supabase projects;
- require an authenticated approved E2E account;
- create only records tagged with the current run ID;
- return stable record IDs and display names needed by the test;
- use one database transaction for each prepared scenario;
- avoid service-role credentials in the mobile app and tracked files;
- remain idempotent for a repeated run ID and test key where practical.

Cleanup should delete only records belonging to the requested run ID. Keep a
guarded stale-run cleanup path for interrupted runs. The apply path should not
perform list queries that are used only by dry-run output, and it should not
look up the same User twice.

Dry-run cleanup must remain available. Production cleanup must remain blocked.

## Deterministic helper behavior

Helpers should wait for the state promised by their fixture instead of using a
long failed wait to discover which branch is active.

Required changes include:

- Stop waiting two seconds for `No available users` before selecting the known
  Friend fixture.
- Replace optional alert dismissal based on a three-second failed wait with an
  explicit postcondition or a platform-aware helper.
- Launch authenticated tests into a known tab or route. Do not wait five
  seconds for the Friends screen merely to discover that the app opened on a
  different authenticated tab.
- Add stable navigation identifiers where Expo Native Tabs exposes a supported
  test seam. Until then, keep coordinate tapping in one helper and validate the
  target screen immediately.
- Replace broad text and `atIndex(0)` selectors with stable IDs or specific
  accessibility labels for important actions.
- Keep Detox synchronization enabled except around the existing authentication
  operation that requires an explicit exception.

Timeouts remain safety limits. They must not act as routine branch conditions.

## Runner behavior

The test wrapper must report failure if Detox fails, receives a termination
signal, or post-run cleanup fails. Post-run cleanup should still execute after
a normal Detox failure.

Add scripts for these workflows:

- `e2e:ios:smoke` runs authentication, Group lifecycle, and Expense lifecycle.
- `e2e:ios` runs the complete serial suite.
- A documented command runs one file or one named test without rebuilding.
- An opt-in sharded command becomes available only after worker isolation is
  complete.

Keep release build and test execution as separate commands. Local focused runs
should reuse the existing binary.

## Parallel execution

Serial execution remains the default until the fixture work is complete.

Parallel execution requires:

- one simulator per Detox worker;
- worker-scoped account or data isolation;
- run-scoped cleanup that cannot delete another worker's records;
- names that cannot collide within the same millisecond;
- Activity and Friend-balance assertions restricted to records created by the
  current test;
- a two-worker timing comparison showing a real improvement on the target
  machine.

Start with two workers. Keep serial execution if simulator and Xcode resource
contention makes the two-worker run slower or less reliable.

## Acceptance criteria

- Three baseline and three final full-suite runs are recorded under equivalent
  conditions.
- Median wrapper runtime falls by at least 40 percent, excluding the Xcode
  build.
- The final suite has no expected-state branch that waits for a multi-second
  timeout before proceeding normally.
- UI Group creation drops from approximately 17 executions to no more than 5
  per full run.
- UI Friend addition drops from approximately 12 executions to no more than 3
  per full run.
- Split calculation combinations removed from Detox remain covered by Vitest.
- Each retained behavior in the proposed suite table has an automated test.
- Tests can run repeatedly without depending on data from the previous run.
- Cleanup deletes only records for the selected run or an explicitly selected
  stale run.
- The runner returns a non-zero exit code for Detox failure, Detox termination,
  fixture failure, or cleanup failure.
- The smoke command and single-file command are documented in `README.md`.
- `npm run lint`, `npm run typecheck:supabase`, `npm test`, and the final Detox
  smoke and full suites pass before handoff.

## Ticket breakdown

### E2E-1: Add timing and record the baseline

Scope:

- Add per-test timing and wrapper phase timing.
- Run the unchanged full suite three times against one reused release binary.
- Record the median and identify the five slowest tests.

Done when:

- Timing appears in normal local or CI artifacts.
- The baseline includes cleanup, startup, test execution, and total duration.
- No test behavior changes are included in this ticket.

### E2E-2: Fix runner result handling and focused commands

Scope:

- Correct signal and cleanup exit-code handling in `scripts/e2e-run.cjs`.
- Add smoke and documented single-file commands.
- Preserve cleanup after a failed Detox run.

Done when:

- Automated script tests cover Detox failure, termination, and cleanup failure.
- Each failure returns non-zero.
- Focused runs reuse an existing app binary.

### E2E-3: Remove timeout-driven helper branches

Scope:

- Make authenticated launch land on a known route.
- Remove expected failed waits from Friend selection and optional alerts.
- Add stable selectors for tabs and high-value actions where supported.

Done when:

- No normal successful path waits for a known-absent element to time out.
- Helpers fail with a specific missing-fixture or missing-screen message.
- Existing E2E cases still pass serially.

### E2E-4: Add run-scoped scenario fixtures and cleanup

Scope:

- Add guarded development-only fixture and cleanup database functions.
- Pass `runId`, `workerId`, and test key through the runner and helpers.
- Seed settlement, deletion, payer, balance, and reversal prerequisites.
- Reduce cleanup network round trips and remove duplicate User lookup.

Done when:

- Two different run IDs can coexist without reading or deleting each other's
  records.
- A repeated scenario request is safe.
- Fixture and cleanup database tests cover authorization and environment guards.
- No service-role key is required by the app or test runner.

### E2E-5: Consolidate the device suite

Scope:

- Apply the proposed suite-shape decisions.
- Move calculation and policy combinations to Vitest where coverage is missing.
- Seed prerequisites that are not under test.

Done when:

- The suite contains 10 to 12 focused device journeys unless a documented
  coverage reason requires more.
- The retained-coverage table maps every removed test to another automated
  test.
- UI setup counts meet the acceptance criteria.

### E2E-6: Evaluate two-worker sharding

Depends on E2E-4 and E2E-5.

Scope:

- Configure two isolated Detox workers and simulators.
- Partition tests by scenario without sharing mutable state.
- Compare three serial runs with three two-worker runs.

Done when:

- Workers cannot collide on names, account state, cleanup, Activity, or
  balances.
- Two-worker execution is kept only if it lowers median runtime without adding
  failures across ten consecutive verification runs.
- Serial execution remains available for debugging.

### E2E-7: Add the suite to the appropriate verification workflow

Depends on the stable completion of E2E-1 through E2E-5.

Scope:

- Run smoke coverage on the fastest appropriate change workflow.
- Run the full suite on release candidates or a scheduled workflow.
- Cache reusable native build inputs where the workflow environment supports
  it.
- Upload timing and failure artifacts.

Done when:

- Workflow placement and expected runtime are documented.
- A failed E2E run blocks only the workflow where that policy is intended.
- Artifacts make the failed test and its duration visible without rerunning the
  suite locally.

## Recommended order

Implement E2E-1 first so later decisions use real timings. E2E-2 and E2E-3 can
follow without database changes. E2E-4 unlocks the largest runtime reduction.
Complete E2E-5 after fixtures exist. Treat E2E-6 as an experiment, not a
guaranteed win. Add workflow enforcement last, once local execution is stable.

## Tracker

- Status: proposed
- Priority: High
- Tickets: E2E-1 through E2E-7
