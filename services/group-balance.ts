import type { Expense, ExpenseSplit, Settlement, SettlementCancellation, SettlementScopeTransfer } from '@/types/database';

export const SETTLED_BALANCE_THRESHOLD = 0.01;

/**
 * Resolve the operation pair a cancellation belongs to. Return the two user
 * IDs when known; return `undefined` when the pair cannot be resolved (the
 * cancellation then applies unscoped, see `applySettlementCancellations`).
 * When no resolver is provided at all, every cancellation applies unscoped
 * (single-pair-group semantics, matching the decoy fixture and every
 * pre-cancellation single-pair flow).
 */
export type CancellationPairResolver = (
  cancellation: SettlementCancellation,
) => readonly [string, string] | undefined;

/**
 * Settling pair carried on the cancellation row itself (mapped from the
 * `actor_user_id` / `friend_user_id` columns of the Task 7 fix-round
 * cancellation read RPCs). Returns `undefined` when the row predates the
 * columns so callers fall through to the documented unscoped behavior.
 */
export function cancellationPairFromRow(
  cancellation: SettlementCancellation,
): readonly [string, string] | undefined {
  if (!cancellation.actorUserId || !cancellation.friendUserId) return undefined;
  return [cancellation.actorUserId, cancellation.friendUserId];
}

export function calculateGroupBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  scopeTransfers: SettlementScopeTransfer[] = [],
  cancellations: SettlementCancellation[] = [],
  pairForCancellation?: CancellationPairResolver,
): Map<string, number> {
  const balances = new Map<string, number>();
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  for (const expense of expenses) {
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amount);

    for (const split of splitsByExpenseId.get(expense.id) ?? []) {
      balances.set(split.userId, (balances.get(split.userId) ?? 0) - split.amount);
    }
  }

  for (const settlement of settlements) {
    balances.set(settlement.fromUserId, (balances.get(settlement.fromUserId) ?? 0) + settlement.amount);
    balances.set(settlement.toUserId, (balances.get(settlement.toUserId) ?? 0) - settlement.amount);
  }

  for (const transfer of scopeTransfers) {
    // signedGroupBalanceDelta is the change to the transfer from-user's
    // group balance (ticket 09 shared orientation, matching the backfill
    // conversion and every balance reader). Apply the signed delta to the
    // sender and its inverse to the recipient.
    balances.set(transfer.fromUserId, (balances.get(transfer.fromUserId) ?? 0) + transfer.signedGroupBalanceDelta);
    balances.set(transfer.toUserId, (balances.get(transfer.toUserId) ?? 0) - transfer.signedGroupBalanceDelta);
  }

  applySettlementCancellations(balances, cancellations, pairForCancellation);

  for (const [userId, balance] of balances) {
    if (Math.abs(balance) < SETTLED_BALANCE_THRESHOLD) {
      balances.set(userId, 0);
    }
  }

  return balances;
}

/**
 * Net cancellation amount: originals add, reversals negate (matching the
 * server netting in `private.settlement_pair_scope_balance`). Floored at
 * zero; a negative net never moves a balance away from zero.
 */
export function netSettlementCancellations(cancellations: SettlementCancellation[]): number {
  const netCents = cancellations.reduce(
    (total, cancellation) => total + (cancellation.isReversal === true ? -1 : 1) * Math.round(cancellation.amount * 100),
    0,
  );
  return Math.max(0, netCents) / 100;
}

/**
 * Move one outstanding balance toward zero by the cancellation net, never
 * below zero (the client mirror of the server
 * `combined - SIGN(combined) * LEAST(ABS(combined), net)` projection).
 */
export function moveBalanceTowardZero(balance: number, net: number): number {
  if (net <= 0 || balance === 0) return balance;
  return balance - Math.sign(balance) * Math.min(Math.abs(balance), net);
}

/**
 * Apply balance cancellations to a group ledger. The legacy transfer branch
 * above is untouched. Each cancellation moves its scope's outstanding toward
 * zero by its amount; reversal rows negate through the netting. Nets are
 * computed per (group, operation pair): a resolved pair moves only its two
 * members so other members never change. With no resolver, the pair reads
 * off the cancellation row itself (`actorUserId` / `friendUserId` from the
 * read RPCs), which covers cancellation-only operations with no sibling
 * rows or metadata. A cancellation whose pair cannot be resolved either way
 * applies unscoped (single-pair-group semantics); explicit resolvers should
 * therefore attribute every operation they can — sibling settlement/transfer
 * rows and operation metadata participants — so multi-pair groups keep
 * uninvolved members untouched.
 */
export function applySettlementCancellations(
  balances: Map<string, number>,
  cancellations: SettlementCancellation[],
  pairForCancellation?: CancellationPairResolver,
): void {
  if (cancellations.length === 0) return;

  const resolvePair = pairForCancellation ?? cancellationPairFromRow;

  const netsByScope = new Map<string, { signedCents: number; pair: readonly [string, string] }>();
  const legacyNetsByScope = new Map<string, { cents: number; pair: readonly [string, string] }>();
  const unscoped: SettlementCancellation[] = [];
  for (const cancellation of cancellations) {
    const pair = resolvePair(cancellation);
    if (!pair) {
      unscoped.push(cancellation);
      continue;
    }
    const [first, second] = [...pair].sort();
    const key = `${cancellation.groupId}|${first}|${second}`;
    if (cancellation.signedGroupBalanceDelta === undefined) {
      const entry = legacyNetsByScope.get(key) ?? { cents: 0, pair: [first, second] };
      const amountCents = Math.round(cancellation.amount * 100);
      entry.cents += cancellation.isReversal === true ? -amountCents : amountCents;
      legacyNetsByScope.set(key, entry);
    } else {
      const actorEffectCents = Math.round(cancellation.signedGroupBalanceDelta * 100);
      // Resolvers identify the unordered settling pair and may derive it from
      // cash rows whose order differs from the operation initiator. The row's
      // actor attribution is authoritative for the signed effect.
      const actorUserId = cancellation.actorUserId ?? pair[0];
      const canonicalEffectCents = actorUserId === first ? actorEffectCents : -actorEffectCents;
      const entry = netsByScope.get(key) ?? { signedCents: 0, pair: [first, second] };
      entry.signedCents += cancellation.isReversal === true ? -canonicalEffectCents : canonicalEffectCents;
      netsByScope.set(key, entry);
    }
  }

  for (const { signedCents, pair } of netsByScope.values()) {
    for (const userId of pair) {
      if (!balances.has(userId)) continue;
      const current = balances.get(userId) ?? 0;
      balances.set(userId, current + signedCents / 100 * (userId === pair[0] ? 1 : -1));
    }
  }

  for (const { cents, pair } of legacyNetsByScope.values()) {
    if (cents <= 0) continue;
    const net = cents / 100;
    for (const userId of pair) {
      if (!balances.has(userId)) continue;
      balances.set(userId, moveBalanceTowardZero(balances.get(userId) ?? 0, net));
    }
  }

  const fallbackNet = netSettlementCancellations(unscoped);
  if (fallbackNet <= 0) return;
  for (const [userId, balance] of balances) {
    balances.set(userId, moveBalanceTowardZero(balance, fallbackNet));
  }
}
export function areGroupBalancesSettled(balances: Map<string, number>): boolean {
  for (const balance of balances.values()) {
    if (Math.abs(balance) >= SETTLED_BALANCE_THRESHOLD) {
      return false;
    }
  }

  return true;
}

export function isGroupSettled(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  scopeTransfers: SettlementScopeTransfer[] = [],
  cancellations: SettlementCancellation[] = [],
  pairForCancellation?: CancellationPairResolver,
): boolean {
  return areGroupBalancesSettled(calculateGroupBalances(expenses, splits, settlements, scopeTransfers, cancellations, pairForCancellation));
}
