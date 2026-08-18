import type { FriendGroupBalanceSummary } from './friend-detail-service';

export type CombinedSettlementAllocation = {
  groupId?: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
};

type CombinedSettlementParams = {
  currentUserId: string;
  friendId: string;
  currency: string;
  amount: number;
  directBalance: number;
  groupBalances: FriendGroupBalanceSummary[];
};

export function buildCombinedSettlementAllocations({
  currentUserId,
  friendId,
  currency,
  amount,
  directBalance,
  groupBalances,
}: CombinedSettlementParams): CombinedSettlementAllocation[] {
  if (!Number.isFinite(amount) || amount <= 0 || !isWholeCent(amount)) {
    throw new Error('Settlement amount must be greater than zero and use at most two decimal places.');
  }
  if (!Number.isFinite(directBalance) || groupBalances.some(group => !Number.isFinite(group.amount))) {
    throw new Error('Settlement balance is invalid.');
  }
  if (groupBalances.some(group => group.currency !== currency && group.direction !== 'settled')) {
    throw new Error('Settlement currencies must be handled separately.');
  }

  const scopes = [
    { groupId: undefined, amount: normalizeAmount(directBalance), lastActivityAt: Number.MIN_SAFE_INTEGER },
    ...groupBalances
      .filter(group => group.currency === currency && group.direction !== 'settled')
      .map(group => ({ groupId: group.groupId, amount: normalizeAmount(group.amount), lastActivityAt: group.lastActivityAt ?? 0 })),
  ].filter(scope => scope.amount !== 0);

  const direction = Math.sign(scopes[0]?.amount ?? 0);
  if (scopes.some(scope => Math.sign(scope.amount) !== direction)) {
    throw new Error('Cannot combine opposite settlement directions in one payment.');
  }

  const totalOutstandingCents = scopes.reduce((total, scope) => total + toCents(Math.abs(scope.amount)), 0);
  const amountCents = toCents(amount);
  if (amountCents > totalOutstandingCents) {
    throw new Error('Settlement amount cannot exceed the combined outstanding balance.');
  }

  const orderedScopes = [...scopes].sort((a, b) => a.groupId ? a.lastActivityAt - b.lastActivityAt : -Infinity);
  let remainingCents = amountCents;
  const fromUserId = direction < 0 ? currentUserId : friendId;
  const toUserId = direction < 0 ? friendId : currentUserId;

  return orderedScopes.flatMap(scope => {
    if (remainingCents <= 0) return [];
    const allocationCents = Math.min(toCents(Math.abs(scope.amount)), remainingCents);
    remainingCents -= allocationCents;
    if (allocationCents === 0) return [];
    return [{ groupId: scope.groupId, fromUserId, toUserId, amount: allocationCents / 100, currency }];
  });
}

function normalizeAmount(amount: number): number {
  return Math.abs(amount) < 0.01 ? 0 : Number(amount.toFixed(2));
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function isWholeCent(amount: number): boolean {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < Number.EPSILON * 100;
}
