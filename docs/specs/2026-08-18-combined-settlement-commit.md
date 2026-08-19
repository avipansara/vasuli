# Deepen the combined settlement module

## Status update — 2026-08-19

Implemented in the current application. Combined payments use an
idempotent settlement-operation RPC, return one durable receipt, validate stale
projections, and invalidate affected query surfaces through `settlementModule`.
The migration and service contracts have focused regression coverage. Live
rollout verification remains operational follow-up.

## Problem Statement

When a user records one payment from the Friend settle-up flow, Vasuli may
need to represent that payment as several scoped settlement records: one
direct Friend balance allocation and zero or more shared Group allocations.
The current screen builds those allocations, updates several caches, and sends
independent `settlements` inserts concurrently. A network failure can therefore
persist only part of one payment. A double tap, retry, or concurrent device can
also create duplicate records. Scope rules are split between the screen,
allocation helpers, settlement adapters, and read-model SQL, making the
important invariant difficult to test and easy to violate.

The result can be a payment that appears successful while only some direct or
Group balances were cleared, or a retry that changes the user's balance twice.
Users need one trustworthy payment action whose persisted outcome is atomic,
repeatable, and correctly scoped.

## Solution

Deepen the combined settlement workflow behind one settlement commit module.
The module will own payment planning, currency and direction validation,
idempotency, stale-snapshot checks, and the commit request. Supabase will
persist the complete allocation set in one database transaction and return a
receipt containing every resulting settlement record.

The Friend settle-up screen will provide the confirmed payment intent and
render the returned receipt. It will not loop over settlement inserts or decide
whether a retry is safe. Cache updates, invalidation, and best-effort activity
effects will be driven from the receipt so that a successful payment updates
all affected direct and Group read models consistently.

## User Stories

1. As a Vasuli user, I want one payment across my direct Friend balance and shared Group balances to be recorded as one action, so that the app reflects the payment I actually made.
2. As a Vasuli user, I want the payment to allocate to the direct balance before shared Groups, so that the existing settlement expectation remains predictable.
3. As a Vasuli user, I want the allocation receipt to show each affected scope and amount, so that I can understand how my payment was applied.
4. As a Vasuli user, I want a payment that spans several Groups to clear every intended scope together, so that no partial payment is left by an infrastructure failure.
5. As a Vasuli user, I want a failed commit to leave all balances unchanged, so that I am not asked to reconcile a half-recorded payment.
6. As a Vasuli user, I want retrying after a timeout to return the original receipt, so that uncertainty does not create a duplicate payment.
7. As a Vasuli user, I want double taps and concurrent retries for the same payment intent to be safe, so that one payment cannot be recorded twice.
8. As a Vasuli user, I want a successful retry to be distinguishable from a newly committed payment, so that the interface can give accurate feedback without creating another activity event.
9. As a Vasuli user, I want the payment currency to be explicit, so that a USD payment cannot silently settle an EUR balance.
10. As a Vasuli user, I want mixed-currency outstanding balances to require separate payments, so that exchange rates are not invented by the app.
11. As a Vasuli user, I want the payer and recipient direction to be consistent across direct and Group scopes, so that the receipt does not reverse who paid whom.
12. As a Vasuli user, I want opposite-direction direct and Group balances to be rejected for one payment, so that one payment cannot conceal contradictory debts.
13. As a Vasuli user, I want an amount above the combined outstanding balance to be rejected before any record is written, so that accidental overpayment does not alter my ledger.
14. As a Vasuli user, I want a zero, negative, or sub-cent payment to be rejected, so that settlement records remain financially meaningful.
15. As a Vasuli user, I want a sub-cent rounding remainder to be handled deterministically, so that allocations sum exactly to the confirmed payment or the operation fails clearly.
16. As a Vasuli user, I want a stale balance snapshot to be detected when another device settles first, so that my payment does not overwrite or duplicate newer settlement state.
17. As a Vasuli user, I want a stale-snapshot failure to explain that the balance changed and allow me to refresh, so that I know how to recover.
18. As a Vasuli user, I want Group allocations to be limited to Groups shared by both people, so that a Friend payment cannot write into an unrelated Group ledger.
19. As a Vasuli user, I want direct allocations to remain direct and Group allocations to retain their Group scope, so that home, Friend, and Group balances continue to agree.
20. As a Vasuli user, I want the returned settlement records to include direction, amount, currency, date, and Group context, so that activity and read models can render trustworthy data.
21. As a Vasuli user, I want the Friend balance to refresh after a successful payment, so that the screen does not show the previous amount.
22. As a Vasuli user, I want every affected Group detail and Group list to refresh after a successful payment, so that scoped balances do not remain stale.
23. As a Vasuli user, I want a successful payment to appear once in activity, so that an idempotent retry does not duplicate history.
24. As a Vasuli user, I want activity logging failure not to turn a committed payment into an error, so that the ledger remains authoritative and recoverable.
25. As a Vasuli user, I want the submit control to show progress and prevent duplicate taps while the commit is in flight, so that the action feels safe.
26. As a Vasuli user, I want the confirmation copy to use the committed amount and Friend name, so that the success state reflects what was actually recorded.
27. As a Vasuli user, I want a failed payment to restore optimistic Friend and Group state or invalidate it, so that the interface never leaves a misleading balance behind.
28. As an authenticated user, I want the server to derive and enforce my identity, so that changing client-supplied IDs cannot authorize another user's settlement.
29. As an authenticated user, I want both participants and every Group scope to be authorized by the database transaction, so that client-side scope lists are not trusted as proof.
30. As an authenticated user, I want historical settlement records to remain immutable through this flow, so that retries cannot edit a prior payment.
31. As a maintainer, I want one public commit seam for the whole combined settlement workflow, so that atomicity and retry behavior can be tested without rendering a screen.
32. As a maintainer, I want the planning algorithm to remain deterministic, so that the same validated snapshot always produces the same allocation order.
33. As a maintainer, I want persistence details hidden behind the settlement commit interface, so that the screen does not depend on Supabase insert semantics.
34. As a maintainer, I want the existing allocation behavior captured as characterization tests, so that deepening the module does not silently change settlement semantics.
35. As a maintainer, I want the receipt to be the source for cache updates and activity effects, so that downstream consumers do not reconstruct partial results.
36. As a maintainer, I want transaction and idempotency failures to have typed domain outcomes, so that the UI can distinguish retryable failures, stale data, invalid input, and authorization errors.
37. As a maintainer, I want the commit flow to work consistently on iOS, Android, and web, so that platform rendering does not fork financial behavior.

## Implementation Decisions

- Introduce one deep settlement commit module as the highest application seam. Its public operation accepts the authenticated actor, Friend participant, confirmed amount and currency, the current balance snapshot needed for planning, and a client-generated payment intent key.
- Keep the existing pure combined allocation planner as the deterministic planning core, extending it only where needed to make currency, direction, exact-cent totals, and scope validation explicit. The planner must never perform persistence or cache updates.
- Make the commit operation return an allocation receipt containing the payment intent key, commit status, committed or reused timestamp, total amount, currency, direction, and the complete ordered list of created or previously committed settlement records.
- Treat the payment intent key as stable across retries of one user action and unique per newly confirmed payment. A new user action must not reuse a prior key.
- Add database-backed idempotency for the payment intent. A unique constraint must allow concurrent requests for the same intent to converge on one receipt, while different intents remain independent. A reused intent must return the original allocations rather than insert another set.
- Persist all allocation rows in one transactional database operation. The transaction must either insert every scoped settlement record and its commit metadata or insert none of them.
- Prefer a Supabase RPC or equivalent database function as the transaction boundary. The client-facing service adapter should call that boundary once and map its result into domain types.
- Validate on the server inside the transaction: authenticated actor, Friend participation, shared Group membership, supported currency, positive amount, cent precision, compatible direction, valid scope IDs, and amount not exceeding the current combined outstanding balance.
- Compare the client snapshot or a snapshot/version token with the server's current balance state before inserting. If the state changed, return a typed stale-balance conflict and do not write any settlement rows.
- Recompute or verify the allocation total in the transaction so client-provided allocation amounts are treated as a plan suggestion rather than authorization to write arbitrary scopes.
- Preserve direct-versus-Group scope semantics. A direct allocation has no Group ID; a Group allocation must retain its Group ID and must be counted only by the corresponding Group read models.
- Preserve direct-first ordering and existing chronological Group ordering unless a characterization test demonstrates that a different deterministic order is required for exact-cent remainder handling.
- Represent money in integer cents at the commit boundary or an equivalent exact-decimal representation. The committed allocation amounts must sum exactly to the confirmed payment amount; a non-zero remainder that cannot be assigned safely is a validation failure.
- Keep settlement records append-only in this flow. Idempotency metadata links the one payment intent to its receipt without mutating historical settlement rows.
- Move the Friend settle-up screen's settlement insert loop into the commit module. The route may validate basic input for immediate feedback, but the commit module and database remain authoritative.
- Move optimistic cache capture, rollback, and invalidation to the mutation orchestration around the commit module. The receipt drives Friend detail, Friends home, Group list, and each affected Group detail update or invalidation.
- Make activity creation best-effort after a newly committed receipt and suppress duplicate activity effects when the receipt is reused. Activity failures must be observable for repair but must not roll back a successfully committed ledger transaction.
- Use typed errors or result statuses for invalid payment, currency conflict, opposite-direction scopes, stale balance, authorization failure, idempotency conflict, and transient database/network failure. The UI should provide a refresh or retry path appropriate to each outcome.
- Preserve the existing settlement service read operations and existing single-scope Group settlement flow unless they must share the new transaction adapter. Do not broaden this spec into a rewrite of every settlement caller.
- Add the smallest necessary migration for idempotency metadata, constraints, transaction function, and generated database types. Preserve existing settlement history and existing RLS expectations.
- Do not include specific file paths in the implementation contract; the current screen, settlement service, allocation service, and settlement migrations are the expected change area, but the module boundary should remain domain-named and replaceable.

## Testing Decisions

Tests should exercise external behavior through the settlement commit module's
public interface and the database transaction boundary. They should not assert
component structure, React Query internals, Supabase call ordering, private
helper names, or the number of implementation-level inserts.

Test the following behavior:

- Existing direct-first allocation and deterministic Group ordering remain unchanged.
- Full and partial payments produce receipts whose allocations sum exactly to the requested amount.
- Zero, negative, over-balance, mixed-currency, opposite-direction, invalid-scope, and sub-cent inputs fail without writes.
- Direct-only, Group-only, and combined direct-plus-Group payments preserve their scopes and directions.
- A rounding boundary either assigns the exact-cent remainder deterministically or returns a clear validation failure.
- A transaction failure produces no settlement rows and no successful receipt.
- A successful transaction returns all settlement rows in receipt order.
- Retrying the same payment intent returns the same receipt and row IDs without adding rows.
- Concurrent commits with the same payment intent converge to one committed result.
- Distinct payment intent keys do not collapse into one payment.
- A stale balance token or changed server balance returns a conflict and performs no write.
- Unauthorized actors, non-participants, and non-shared Group scopes cannot commit.
- A receipt reused after a prior activity effect does not duplicate activity.
- Cache and read-model orchestration updates every affected scope after success and restores or invalidates consistently after failure.
- Retryable, stale, invalid-input, and authorization failures map to distinct user-visible outcomes.
- Existing single-scope settlement reads and Group settlement behavior remain compatible.

The primary seam is the settlement commit module with in-memory planning and
adapter doubles. The database RPC/integration test is the second seam only for
transactionality, unique idempotency behavior, authorization, and concurrent
requests. Existing prior art includes combined allocation tests, settlement
service tests, Friend detail module adapter tests, Group detail read-model
tests, query-cache adapter tests, and Supabase RLS/RPC tests. Add a small number
of screen-level tests for disabled submit, receipt success, stale-balance
recovery, and failed-commit rollback.

## Out of Scope

- Redesigning the Friend settle-up UI, copy, visual language, or navigation.
- Adding exchange-rate conversion or allowing one payment to settle multiple currencies.
- Changing the underlying balance semantics, direct-versus-Group definitions, or allocation priority without a separate product decision.
- Rewriting all settlement callers, including the standalone Group settle-up flow.
- Introducing offline settlement queues, background reconciliation, payment-provider integration, or real-money transfer processing.
- Editing or deleting historical settlement rows as part of retry handling.
- Duplicating settlement activity for an idempotent retry.
- Replacing TanStack Query or redesigning the broader read-model architecture.
- Deploying production migrations, submitting builds, committing, or pushing changes as part of this spec.

## Further Notes

Start with characterization coverage around the current combined allocation
planner and the Friend settle-up success/failure paths. Then define the receipt
and typed failure contract, implement the database transaction and idempotency
record, route the existing screen through the commit module, and finally
remove the screen-side write loop and duplicated settlement cache orchestration.

The acceptance signal is stronger than “the screen calls one service.” A
single payment intent must have one durable outcome: all intended scoped
settlement records and one receipt, or no settlement records. A timeout and
retry must be safe, a concurrent device must receive a stale conflict or the
same idempotent receipt, and the Friend and Group read models must agree after
success.
