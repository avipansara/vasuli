import { ActivityType, type Expense, type SettlementCancellation, type SettlementScopeTransfer, type User } from '@/types/database';
import { moveBalanceTowardZero } from './group-balance';
import type {
  SettlementOperationProjection,
  SettlementOperationStatusRecord,
} from './settlement-operation-projection';
import { friendDetailReadModel } from './friend-detail-read-model';

export interface FriendWithBalance extends User {
  balance: number;
}

export interface FriendExpenseWithSplit extends Expense {
  yourShare: number;
  friendShare: number;
  paidByName: string;
  groupName?: string;
}

export type FriendSettlementDirection = 'you_paid_friend' | 'friend_paid_you';

export type FriendGroupBalanceSummary = {
  groupId: string;
  groupName: string;
  currency: string;
  amount: number;
  direction: 'you_owe' | 'you_are_owed' | 'settled';
  lastActivityAt?: number;
};

export type FriendActivityItem =
  | {
    id: string;
    type: 'expense';
    date: number;
    expense: FriendExpenseWithSplit;
  }
  | {
    id: string;
    type: 'group_expense';
    date: number;
    expense: FriendExpenseWithSplit;
  }
  | {
    id: string;
    type: 'settlement';
    date: number;
    settlementId: string;
    operationId?: string;
    backfilledTransferId?: string;
    createdAt?: number;
    amount: number;
    currency: string;
    direction: FriendSettlementDirection;
    groupId?: string;
    groupName?: string;
    notes?: string;
  }
  | {
    id: string;
    type: 'expense_activity';
    date: number;
    activityId: string;
    activityType: ActivityType.EXPENSE_UPDATED | ActivityType.EXPENSE_DELETED;
    targetId: string;
    description: string;
    amount?: number;
    userId: string;
    userName?: string;
    groupId?: string;
    groupName?: string;
    isDeleted: boolean;
    isUpdated: boolean;
  }
  | {
    id: string;
    type: 'scope_transfer';
    date: number;
    transferId: string;
    operationId: string;
    groupId: string;
    groupName?: string;
    amount: number;
    currency: string;
    fromUserId: string;
    toUserId: string;
    direction: FriendSettlementDirection;
    isReversal?: boolean;
    notes?: string;
  }
  | {
    // ADR-0001: one settlement operation renders as one Friend activity.
    // The projection carries the grouped cash/adjustment records; balance
    // math still consumes the original plus compensating rows exactly as
    // today.
    id: string;
    type: 'settlement_operation';
    date: number;
    operationId: string;
    direction?: FriendSettlementDirection;
    projection: SettlementOperationProjection;
    groupNames?: Record<string, string>;
  };

export type FriendSettlementOperationItem = Extract<FriendActivityItem, { type: 'settlement_operation' }>;

export type FriendRelationshipTotal = {
  currency: string;
  amount: number;
  direction: 'you_owe' | 'you_are_owed' | 'settled';
};

export type FriendRelationshipProjection = {
  directBalance: number;
  directCurrency?: string;
  groupBalances: FriendGroupBalanceSummary[];
  activity: FriendActivityItem[];
  totalsByCurrency: FriendRelationshipTotal[];
  settleableTotal?: FriendRelationshipTotal;
  zeroNetCurrency?: string;
};

export interface FriendDetailData {
  friend: FriendWithBalance;
  expenses: FriendExpenseWithSplit[];
  activity: FriendActivityItem[];
  groupBalances?: FriendGroupBalanceSummary[];
  scopeTransfers?: SettlementScopeTransfer[];
  cancellations?: SettlementCancellation[];
  // Authoritative per-operation status for the settlement-operation
  // projection. Absent until the read model exposes it; the Friend
  // operation view falls back to explicit reversal links (see
  // friend-settlement-operation-view.ts) and never to rendered text.
  settlementOperations?: SettlementOperationStatusRecord[];
  relationship: FriendRelationshipProjection;
}

export function projectFriendRelationship(
  detail: Pick<FriendDetailData, 'friend' | 'expenses' | 'activity' | 'groupBalances' | 'scopeTransfers' | 'cancellations'>
): FriendRelationshipProjection {
  const scopeTransfers = detail.scopeTransfers ?? [];
  const transferDeltasByCurrency = new Map<string, number>();
  for (const transfer of scopeTransfers) {
    transferDeltasByCurrency.set(
      transfer.currency,
      (transferDeltasByCurrency.get(transfer.currency) ?? 0) + transfer.signedGroupBalanceDelta,
    );
  }
  // Scope transfers reclassify Group balances into the direct friendship
  // ledger. Apply the signed delta to each group balance and the opposite sum
  // to the direct balance so the relationship total stays unchanged.
  const transferDeltasByGroup = new Map<string, number>();
  for (const transfer of scopeTransfers) {
    transferDeltasByGroup.set(
      transfer.groupId,
      (transferDeltasByGroup.get(transfer.groupId) ?? 0) + transfer.signedGroupBalanceDelta,
    );
  }
  // Balance cancellations clear the pair's outstanding in the named scope:
  // each non-reversal row moves that group balance toward zero by its amount
  // (reversals negate through the netting, mirroring the server helper). The
  // signed amount removed from the group scopes is absorbed by the direct
  // balance with the inverse leg, so the relationship total stays unchanged.
  const cancellations = detail.cancellations ?? [];
  const cancellationNetsByScope = new Map<string, { effect: number; legacy: number }>();
  for (const cancellation of cancellations) {
    const key = `${cancellation.groupId}|${cancellation.currency}`;
    const prior = cancellationNetsByScope.get(key) ?? { effect: 0, legacy: 0 };
    if (cancellation.signedGroupBalanceDelta === undefined) {
      prior.legacy += cancellation.isReversal === true ? -cancellation.amount : cancellation.amount;
    } else {
      const oriented = cancellation.actorUserId === detail.friend.id
        ? -cancellation.signedGroupBalanceDelta
        : cancellation.signedGroupBalanceDelta;
      prior.effect += cancellation.isReversal === true ? -oriented : oriented;
    }
    cancellationNetsByScope.set(key, prior);
  }
  const removedByCurrency = new Map<string, number>();
  const groupBalances = (detail.groupBalances ?? []).map(summary => {
    const transferAdjusted = summary.amount + (transferDeltasByGroup.get(summary.groupId) ?? 0);
    const cancellation = cancellationNetsByScope.get(`${summary.groupId}|${summary.currency}`) ?? { effect: 0, legacy: 0 };
    const cleared = moveBalanceTowardZero(transferAdjusted, Math.max(0, cancellation.legacy)) + cancellation.effect;
    removedByCurrency.set(
      summary.currency,
      (removedByCurrency.get(summary.currency) ?? 0) + (transferAdjusted - cleared),
    );
    return {
      ...summary,
      amount: normalizeBalance(cleared),
      direction: getBalanceDirection(cleared),
    };
  });
  const directCurrencies = new Set(
    detail.expenses
      .filter(expense => !expense.groupId)
      .map(expense => expense.currency)
  );

  for (const item of detail.activity) {
    if (item.type === 'settlement' && !item.groupId) {
      directCurrencies.add(item.currency);
    }
  }

  const directCurrency = directCurrencies.size === 1 ? [...directCurrencies][0] : undefined;
  const directTransferDelta = directCurrency ? (transferDeltasByCurrency.get(directCurrency) ?? 0) : 0;
  const directCancellationRemoved = directCurrency ? (removedByCurrency.get(directCurrency) ?? 0) : 0;
  const directBalance = normalizeBalance(detail.friend.balance - directTransferDelta + directCancellationRemoved);

  const totals = new Map<string, number>();
  for (const summary of groupBalances) {
    totals.set(summary.currency, (totals.get(summary.currency) ?? 0) + summary.amount);
  }

  if (directBalance !== 0 && directCurrency) {
    totals.set(directCurrency, (totals.get(directCurrency) ?? 0) + directBalance);
  }

  const totalsByCurrency = [...totals.entries()]
    .map(([currency, amount]) => ({
      currency,
      amount: normalizeBalance(amount),
      direction: getBalanceDirection(amount),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const outstandingTotals = totalsByCurrency.filter(total => total.amount !== 0);
  const transferActivity: FriendActivityItem[] = scopeTransfers.map(transfer => {
    const group = groupBalances.find(summary => summary.groupId === transfer.groupId);
    return {
      id: `scope-transfer:${transfer.id}`,
      type: 'scope_transfer',
      date: transfer.createdAt,
      transferId: transfer.id,
      operationId: transfer.operationId,
      groupId: transfer.groupId,
      groupName: group?.groupName,
      amount: Math.abs(transfer.signedGroupBalanceDelta),
      currency: transfer.currency,
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      direction: transfer.signedGroupBalanceDelta < 0 ? 'friend_paid_you' : 'you_paid_friend',
      isReversal: transfer.isReversal,
      notes: transfer.note,
    };
  });
  const activity = [...detail.activity, ...transferActivity].sort((a, b) => b.date - a.date);
  const settleableTotal = outstandingTotals.length === 1
    && (directBalance === 0 || directCurrency === outstandingTotals[0].currency)
    ? outstandingTotals[0]
    : undefined;
  const relationshipCurrencies = new Set([
    ...directCurrencies,
    ...groupBalances.map(summary => summary.currency),
    ...scopeTransfers.map(transfer => transfer.currency),
    ...cancellations.map(cancellation => cancellation.currency),
  ]);
  const hasClearedScopes = directBalance !== 0
    || groupBalances.some(summary => summary.amount !== 0)
    || scopeTransfers.length > 0
    || cancellations.length > 0;
  const zeroNetCurrency = outstandingTotals.length === 0
    && hasClearedScopes
    && relationshipCurrencies.size === 1
    ? [...relationshipCurrencies][0]
    : undefined;

  return {
    directBalance,
    directCurrency,
    groupBalances,
    activity,
    totalsByCurrency,
    settleableTotal,
    zeroNetCurrency,
  };
}

function normalizeBalance(balance: number): number {
  return Math.abs(balance) < 0.01 ? 0 : Number(balance.toFixed(2));
}

function getBalanceDirection(balance: number): FriendRelationshipTotal['direction'] {
  return balance > 0.01 ? 'you_are_owed' : balance < -0.01 ? 'you_owe' : 'settled';
}

export type FriendDetailDataSource = {
  getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null>;
};

export function createFriendDetailService(dataSource: FriendDetailDataSource = friendDetailReadModel) {
  return {
    getDetail: (currentUserId: string, friendId: string) => dataSource.getDetail(currentUserId, friendId),
  };
}

export const friendDetailService = createFriendDetailService();
