import type { FriendDetailData } from '@/services/friend-detail-service';
import { friendDetailReadModel } from '@/services/friend-detail-read-model';
import { activityService } from '@/services/activity-service';
import { settlementService } from '@/services/settlement-service';
import { expenseService } from '@/services/expense-service';
import { friendshipService } from '@/services/friendship-service';
import type { PushNotificationData } from '@/services/notification-service';
import type { Settlement } from '@/types/database';

export type FriendDetailReadAdapter = {
  getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null>;
};

export type FriendDetailSettlementAdapter = {
  createPairSettlements(params: {
    currentUserId: string;
    friendId: string;
    amount: number;
    currency: string;
    date: number;
  }): Promise<Settlement[]>;
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
  settlementAdapter?: FriendDetailSettlementAdapter;
  activityAdapter?: FriendDetailActivityAdapter;
  expenseAdapter?: FriendDetailExpenseAdapter;
  friendshipAdapter?: FriendDetailFriendshipAdapter;
  notificationAdapter?: FriendDetailNotificationAdapter;
};

export type FriendDetailModule = {
  getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null>;
  settleUp(params: {
    currentUserId: string;
    friendId: string;
    amount: number;
    balance: number;
    currency: string;
    date: number;
    currentUserName?: string;
    friendName?: string;
  }): Promise<Settlement[]>;
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

export function createFriendDetailModule(
  dependencies: FriendDetailModuleDependencies = {}
): FriendDetailModule {
  const readAdapter = dependencies.readAdapter ?? friendDetailReadModel;
  const settlementAdapter = dependencies.settlementAdapter ?? settlementService;
  const activityAdapter = dependencies.activityAdapter ?? activityService;
  const expenseAdapter = dependencies.expenseAdapter ?? expenseService;
  const friendshipAdapter = dependencies.friendshipAdapter ?? friendshipService;

  return {
    getDetail: (currentUserId, friendId) => readAdapter.getDetail(currentUserId, friendId),
    async settleUp({
      currentUserId,
      friendId,
      amount,
      balance,
      currency,
      date,
      currentUserName = 'You',
      friendName = 'Friend',
    }) {
      if (amount <= 0 || amount > Math.abs(balance)) {
        throw new Error('Settlement amount cannot exceed the outstanding balance.');
      }

      const settlements = await settlementAdapter.createPairSettlements({
        currentUserId,
        friendId,
        amount: Math.abs(amount),
        currency,
        date,
      });

      for (const settlement of settlements) {
        try {
          await activityAdapter.logSettlementCreated({
            settlementId: settlement.id,
            fromUserId: settlement.fromUserId,
            fromUserName: settlement.fromUserId === currentUserId ? currentUserName : friendName,
            toUserName: settlement.fromUserId === currentUserId ? friendName : currentUserName,
            amount: settlement.amount,
            groupId: settlement.groupId,
          });
        } catch {
          // Activity logging must not turn a completed settlement into a failure.
        }
      }

      return settlements;
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

export const friendDetailModule = createFriendDetailModule();
