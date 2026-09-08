import {
  projectFriendRelationship,
  type FriendActivityItem,
  type FriendDetailData,
  type FriendGroupBalanceSummary,
  type FriendRelationshipProjection,
} from '@/services/friend-detail-service';
import { friendDetailReadModel } from '@/services/friend-detail-read-model';
import { friendGroupBalanceService } from '@/services/friend-group-balance-service';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import { friendshipService } from '@/services/friendship-service';
import { friendSummaryService } from '@/services/friend-summary-service';
import type { PushNotificationData } from '@/services/notification-service';
import type { SettlementScopeTransfer, SettlementCancellation } from '@/types/database';
import type { SettlementOperationStatusRecord } from './settlement-operation-projection';
import { scopeTransferService } from './scope-transfer-service';
import { settlementCancellationService } from './settlement-cancellation-service';
import { settlementOperationMetadataService } from './settlement-operation-metadata-service';
import { formatDate } from '@/utils/date';

export type FriendDetailReadAdapter = {
  getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null>;
};

export type FriendRelationshipAdapter = {
  getRelationship(currentUserId: string, friendId: string): Promise<FriendRelationshipProjection>;
};

export type FriendGroupBalanceAdapter = {
  getSharedGroupBalances(currentUserId: string, friendId: string): Promise<FriendGroupBalanceSummary[]>;
};

export type FriendScopeTransferAdapter = {
  getByFriend(friendId: string): Promise<SettlementScopeTransfer[]>;
};

export type FriendCancellationAdapter = {
  getByFriend(friendId: string): Promise<SettlementCancellation[]>;
};

export type FriendSettlementOperationMetadataAdapter = {
  getByFriend(friendId: string): Promise<NonNullable<FriendDetailData['settlementOperations']>>;
};

export type FriendDetailActivityAdapter = {
  logSettlementCreated(params: {
    settlementId: string;
    fromUserId: string;
    fromUserName: string;
    toUserName: string;
    amount: number;
    groupId?: string;
  }): Promise<unknown>;
};

export type FriendDetailExpenseAdapter = {
  delete(expenseId: string, currentUserId: string, currentUserName: string): Promise<void>;
};

export type FriendDetailFriendshipAdapter = {
  remove(currentUserId: string, friendId: string): Promise<void>;
};

export type FriendDetailNotificationAdapter = {
  sendPushNotification(token: string, notification: PushNotificationData): Promise<void>;
};

export type FriendDetailModuleDependencies = {
  readAdapter?: FriendDetailReadAdapter;
  relationshipAdapter?: FriendRelationshipAdapter;
  groupBalanceAdapter?: FriendGroupBalanceAdapter;
  scopeTransferAdapter?: FriendScopeTransferAdapter;
  cancellationAdapter?: FriendCancellationAdapter;
  settlementOperationMetadataAdapter?: FriendSettlementOperationMetadataAdapter;
  activityAdapter?: FriendDetailActivityAdapter;
  expenseAdapter?: FriendDetailExpenseAdapter;
  friendshipAdapter?: FriendDetailFriendshipAdapter;
  notificationAdapter?: FriendDetailNotificationAdapter;
};

export type FriendDetailModule = {
  getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null>;
  deleteExpense(params: {
    expenseId: string;
    currentUserId: string;
    currentUserName: string;
    description?: string;
    amount?: number;
    friendPushToken?: string;
  }): Promise<void>;
  removeFriend(currentUserId: string, friendId: string): Promise<void>;
  remind(params: {
    friendId: string;
    friendName: string;
    friendPushToken?: string;
    currentUserName: string;
    balance: number;
  }): Promise<boolean>;
};

export type FriendActivityFilter = 'all' | 'expenses' | 'updates';

export type FriendActivityMonth = {
  monthYear: string;
  monthKey: string;
  items: FriendActivityItem[];
};

export function filterFriendActivity(
  activity: FriendActivityItem[],
  filter: FriendActivityFilter
): FriendActivityItem[] {
  const filtered = filter === 'expenses'
    ? activity.filter(item => item.type === 'expense' || item.type === 'group_expense')
    : filter === 'updates'
      ? activity.filter(item => item.type !== 'expense')
      : activity;
  return [...filtered].sort((a, b) => b.date - a.date);
}

/**
 * Union read-model and authorized-adapter operation metadata by operation ID.
 * The adapter carries the corrected ticket-01 lifecycle facts
 * (status/reversed_at/requested amount/original payer/date), so it wins
 * per operation; read-model entries for operations the adapter does not
 * cover are preserved instead of being dropped by a wholesale replace.
 */
function mergeSettlementOperations(
  readOperations: SettlementOperationStatusRecord[] | undefined,
  adapterOperations: SettlementOperationStatusRecord[],
): SettlementOperationStatusRecord[] | undefined {
  if (adapterOperations.length === 0) return readOperations;
  const merged = new Map<string, SettlementOperationStatusRecord>();
  for (const record of readOperations ?? []) merged.set(record.operationId, record);
  for (const record of adapterOperations) merged.set(record.operationId, record);
  return [...merged.values()];
}

export function groupFriendActivityByMonth(activity: FriendActivityItem[]): FriendActivityMonth[] {
  const groups: FriendActivityMonth[] = [];
  const sorted = [...activity].sort((a, b) => b.date - a.date);

  for (const item of sorted) {
    const date = new Date(item.date);
    const monthYear = formatDate(date, 'monthYear');
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    let group = groups.find(candidate => candidate.monthKey === monthKey);
    if (!group) {
      group = { monthYear, monthKey, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

export function createFriendDetailModule(
  dependencies: FriendDetailModuleDependencies = {}
): FriendDetailModule {
  const readAdapter = dependencies.readAdapter ?? friendDetailReadModel;
  const groupBalanceAdapter = dependencies.groupBalanceAdapter;
  const scopeTransferAdapter = dependencies.scopeTransferAdapter;
  const cancellationAdapter = dependencies.cancellationAdapter;
  const operationMetadataAdapter = dependencies.settlementOperationMetadataAdapter;
  const activityAdapter = dependencies.activityAdapter ?? activityService;
  const expenseAdapter = dependencies.expenseAdapter ?? expenseService;
  const friendshipAdapter = dependencies.friendshipAdapter ?? friendshipService;

  return {
    async getDetail(currentUserId, friendId) {
      const relationshipAdapter = dependencies.relationshipAdapter;
      const [detail, groupBalances, scopeTransfers, cancellations, operationMetadata] = await Promise.all([
        readAdapter.getDetail(currentUserId, friendId),
        groupBalanceAdapter?.getSharedGroupBalances(currentUserId, friendId) ?? Promise.resolve([]),
        scopeTransferAdapter?.getByFriend(friendId) ?? Promise.resolve([]),
        cancellationAdapter?.getByFriend(friendId) ?? Promise.resolve([]),
        operationMetadataAdapter?.getByFriend(friendId) ?? Promise.resolve([]),
      ]);
      if (!detail) return null;
      const mergedOperations = mergeSettlementOperations(detail.settlementOperations, operationMetadata);
      const relationship = relationshipAdapter
        ? {
            ...(await relationshipAdapter.getRelationship(currentUserId, friendId)),
            activity: detail.relationship.activity.length > 0
              ? detail.relationship.activity
              : detail.activity,
          }
        : projectFriendRelationship({
            ...detail,
            groupBalances,
            scopeTransfers,
            cancellations,
          });
      return {
        ...detail,
        ...(mergedOperations ? { settlementOperations: mergedOperations } : {}),
        // Return the same transfer-adjusted projection used to calculate the
        // relationship total so the summary card and group rows cannot drift.
        groupBalances: relationship.groupBalances,
        ...(scopeTransferAdapter ? { scopeTransfers } : {}),
        ...(cancellationAdapter ? { cancellations } : {}),
        relationship,
      };
    },
    async deleteExpense({
      expenseId,
      currentUserId,
      currentUserName,
      description,
      amount,
      friendPushToken,
    }) {
      await expenseAdapter.delete(expenseId, currentUserId, currentUserName);
      if (!friendPushToken || description === undefined || amount === undefined) return;

      const { createExpenseDeletedNotification, notificationService } = await import('@/services/notification-service');
      await (dependencies.notificationAdapter ?? notificationService).sendPushNotification(
        friendPushToken,
        createExpenseDeletedNotification(expenseId, description, amount, currentUserName),
      );
    },
    removeFriend: (currentUserId, friendId) => friendshipAdapter.remove(currentUserId, friendId),
    async remind({ friendId, friendName, friendPushToken, currentUserName, balance }) {
      if (balance === 0) {
        throw new Error('No outstanding balance to remind about');
      }
      if (!friendPushToken) return false;

      const notification = {
        type: 'expense_reminder' as const,
        title: 'Payment Reminder',
        body: `${currentUserName || 'Someone'} is reminding you about the outstanding balance of $${Math.abs(balance).toFixed(2)}`,
        data: { friendId },
      };
      const notificationAdapter = dependencies.notificationAdapter ?? (await import('@/services/notification-service')).notificationService;
      await notificationAdapter.sendPushNotification(friendPushToken, notification);
      void friendName;
      return true;
    },
  };
}

export const friendDetailModule = createFriendDetailModule({
  groupBalanceAdapter: friendGroupBalanceService,
  scopeTransferAdapter: scopeTransferService,
  cancellationAdapter: settlementCancellationService,
  settlementOperationMetadataAdapter: settlementOperationMetadataService,
  // Settlement must use the same transfer-adjusted relationship projection as
  // Friends Home. The raw detail RPC intentionally excludes Group balances
  // from the direct ledger, so projecting from that payload alone can produce
  // an allocation direction that disagrees with the expected net balance.
  relationshipAdapter: friendSummaryService,
});
