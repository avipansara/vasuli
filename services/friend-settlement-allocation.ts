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
  if (amount <= 0) throw new Error('Settlement amount must be greater than zero.');
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

  const totalOutstanding = scopes.reduce((total, scope) => total + Math.abs(scope.amount), 0);
  if (amount > totalOutstanding + 0.01) {
    throw new Error('Settlement amount cannot exceed the combined outstanding balance.');
  }

  const orderedScopes = [...scopes].sort((a, b) => a.groupId ? a.lastActivityAt - b.lastActivityAt : -Infinity);
  let remaining = normalizeAmount(amount);
  const fromUserId = direction < 0 ? currentUserId : friendId;
  const toUserId = direction < 0 ? friendId : currentUserId;

  return orderedScopes.flatMap(scope => {
    if (remaining <= 0) return [];
    const allocation = normalizeAmount(Math.min(Math.abs(scope.amount), remaining));
    remaining = normalizeAmount(remaining - allocation);
    if (allocation === 0) return [];
    return [{ groupId: scope.groupId, fromUserId, toUserId, amount: allocation, currency }];
  });
}

function normalizeAmount(amount: number): number {
  return Math.abs(amount) < 0.01 ? 0 : Number(amount.toFixed(2));
}
