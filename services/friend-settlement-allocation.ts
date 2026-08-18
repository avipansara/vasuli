import type { FriendGroupBalanceSummary } from './friend-detail-service';

export const SUPPORTED_SETTLEMENT_CURRENCIES = ['USD'] as const;

export type CombinedSettlementAllocation = {
  groupId?: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
};

export type CombinedSettlementScopeTransfer = {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  signedGroupBalanceDelta: number;
};

export type CombinedSettlementPlan = {
  allocations: CombinedSettlementAllocation[];
  transfers: CombinedSettlementScopeTransfer[];
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
  if (!SUPPORTED_SETTLEMENT_CURRENCIES.includes(currency as typeof SUPPORTED_SETTLEMENT_CURRENCIES[number])) {
    throw new Error('Settlement currency is not supported.');
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

export function buildCombinedSettlementPlan({
  currentUserId,
  friendId,
  currency,
  amount,
  directBalance,
  groupBalances,
}: CombinedSettlementParams): CombinedSettlementPlan {
  if (!Number.isFinite(amount) || amount < 0 || !isWholeCent(amount)) {
    throw new Error('Settlement amount must be zero or greater and use at most two decimal places.');
  }
  if (!Number.isFinite(directBalance) || groupBalances.some(group => !Number.isFinite(group.amount))) {
    throw new Error('Settlement balance is invalid.');
  }
  if (!SUPPORTED_SETTLEMENT_CURRENCIES.includes(currency as typeof SUPPORTED_SETTLEMENT_CURRENCIES[number])) {
    throw new Error('Settlement currency is not supported.');
  }
  if (groupBalances.some(group => group.currency !== currency && group.direction !== 'settled')) {
    throw new Error('Settlement currencies must be handled separately.');
  }

  const groups = groupBalances
    .filter(group => group.currency === currency && group.direction !== 'settled')
    .map(group => ({
      groupId: group.groupId,
      amount: normalizeAmount(group.amount),
      lastActivityAt: group.lastActivityAt ?? 0,
    }))
    .filter(scope => scope.amount !== 0);
  const totalBalanceCents = toCents(directBalance) + groups.reduce(
    (total, scope) => total + toCents(scope.amount),
    0,
  );
  const totalBalance = totalBalanceCents / 100;

  if (totalBalance === 0 && amount !== 0) {
    throw new Error('Settlement amount cannot exceed the combined outstanding balance.');
  }
  if (totalBalance !== 0 && toCents(amount) > Math.abs(totalBalanceCents)) {
    throw new Error('Settlement amount cannot exceed the combined outstanding balance.');
  }

  const paymentDirection = Math.sign(totalBalance);
  const isFullNetSettlement = toCents(amount) === Math.abs(totalBalanceCents);
  if (!isFullNetSettlement) {
    const paymentScopes = [
      { groupId: undefined, amount: normalizeAmount(directBalance), lastActivityAt: Number.MIN_SAFE_INTEGER },
      ...groups,
    ]
      .filter(scope => scope.amount !== 0 && Math.sign(scope.amount) === paymentDirection)
      .sort((a, b) => a.groupId ? a.lastActivityAt - b.lastActivityAt : -Infinity);

    return {
      ...buildPaymentAllocations({
        paymentScopes,
        amount,
        currentUserId,
        friendId,
        currency,
        paymentDirection,
      }),
      transfers: [],
    };
  }

  const directSign = Math.sign(directBalance);
  const transferAllGroups = directBalance === 0 || totalBalance === 0;
  const transferGroups = transferAllGroups || directSign !== paymentDirection
    ? groups.filter(scope => transferAllGroups || Math.sign(scope.amount) !== directSign)
    : groups.filter(scope => Math.sign(scope.amount) !== paymentDirection);
  const transferredGroupIds = new Set(transferGroups.map(scope => scope.groupId));
  const transfers = transferGroups.map(scope => ({
    groupId: scope.groupId,
    fromUserId: friendId,
    toUserId: currentUserId,
    amount: Math.abs(scope.amount),
    currency,
    signedGroupBalanceDelta: -scope.amount,
  }));

  const paymentScopes = directSign !== paymentDirection && directBalance !== 0
    ? [
        {
          groupId: undefined,
          amount: normalizeAmount(
            directBalance - transfers.reduce((total, transfer) => total + transfer.signedGroupBalanceDelta, 0),
          ),
          lastActivityAt: Number.MIN_SAFE_INTEGER,
        },
        ...groups.filter(scope => !transferredGroupIds.has(scope.groupId)),
      ]
    : directBalance === 0
      ? [
          {
            groupId: undefined,
            amount: normalizeAmount(
              directBalance - transfers.reduce((total, transfer) => total + transfer.signedGroupBalanceDelta, 0),
            ),
            lastActivityAt: Number.MIN_SAFE_INTEGER,
          },
          ...groups.filter(scope => !transferredGroupIds.has(scope.groupId)),
        ]
    : [
        { groupId: undefined, amount: normalizeAmount(directBalance), lastActivityAt: Number.MIN_SAFE_INTEGER },
        ...groups.filter(scope => !transferredGroupIds.has(scope.groupId)),
      ];

  if (paymentScopes.some(scope => Math.sign(scope.amount) !== paymentDirection)) {
    throw new Error('Settlement transfer plan did not normalize the payment direction.');
  }

  return {
    ...buildPaymentAllocations({
      paymentScopes: [...paymentScopes].sort((a, b) => a.groupId ? a.lastActivityAt - b.lastActivityAt : -Infinity),
      amount,
      currentUserId,
      friendId,
      currency,
      paymentDirection,
    }),
    transfers,
  };
}

function buildPaymentAllocations({
  paymentScopes,
  amount,
  currentUserId,
  friendId,
  currency,
  paymentDirection,
}: {
  paymentScopes: { groupId?: string; amount: number; lastActivityAt: number }[];
  amount: number;
  currentUserId: string;
  friendId: string;
  currency: string;
  paymentDirection: number;
}): { allocations: CombinedSettlementAllocation[] } {
  let remainingCents = toCents(amount);
  const fromUserId = paymentDirection < 0 ? currentUserId : friendId;
  const toUserId = paymentDirection < 0 ? friendId : currentUserId;
  const allocations = paymentScopes.flatMap(scope => {
    if (remainingCents <= 0) return [];
    const allocationCents = Math.min(toCents(Math.abs(scope.amount)), remainingCents);
    remainingCents -= allocationCents;
    if (allocationCents === 0) return [];
    return [{
      groupId: scope.groupId,
      fromUserId,
      toUserId,
      amount: allocationCents / 100,
      currency,
    }];
  });

  if (remainingCents !== 0) {
    throw new Error('Settlement transfer plan could not allocate the requested amount.');
  }

  return { allocations };
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
