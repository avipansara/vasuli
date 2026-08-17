import { supabase } from '@/lib/supabase';
import type { User } from '@/types/database';
import type { FriendActivityItem, FriendDetailData } from './friend-detail-service';

type FriendDetailRpcClient = {
  rpc: (functionName: string, args: Record<string, string>) => Promise<{
    data: unknown;
    error: { message: string; code?: string; details?: string; hint?: string } | null;
  }>;
};

type FriendDetailReadModelRow = {
  friend: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    avatar?: string;
    pushToken?: string;
    isActive: boolean;
    createdAt: string | number;
    balance: number;
  };
  expenses: {
    id: string;
    groupId?: string;
    description: string;
    amount: number;
    currency: string;
    paidBy: string;
    createdBy?: string;
    category?: string;
    date: string | number;
    imageUrl?: string;
    notes?: string;
    createdAt: string | number;
    updatedAt: string | number;
    yourShare: number;
    friendShare: number;
    paidByName: string;
  }[];
  settlements: {
    id: string;
    groupId?: string;
    amount: number;
    currency: string;
    date: string | number;
    notes?: string;
    createdAt: string | number;
    direction: 'you_paid_friend' | 'friend_paid_you';
  }[];
  activities: {
    id: string;
    activityType: 'expense_updated' | 'expense_deleted';
    targetId: string;
    groupId?: string;
    groupName?: string;
    description: string;
    amount?: number;
    userId: string;
    userName?: string;
    date: string | number;
    isDeleted: boolean;
    isUpdated: boolean;
  }[];
};

const defaultRpcClient: FriendDetailRpcClient = {
  rpc: async (functionName, args) => {
    const { data, error } = await supabase.rpc(functionName, args);
    return { data, error };
  },
};

function toTimestamp(value: string | number): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function mapExpense(expense: FriendDetailReadModelRow['expenses'][number]): FriendDetailData['expenses'][number] {
  return {
    id: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    amount: expense.amount,
    currency: expense.currency,
    paidBy: expense.paidBy,
    createdBy: expense.createdBy,
    category: expense.category,
    date: toTimestamp(expense.date),
    imageUrl: expense.imageUrl,
    notes: expense.notes,
    createdAt: toTimestamp(expense.createdAt),
    updatedAt: toTimestamp(expense.updatedAt),
    yourShare: expense.yourShare,
    friendShare: expense.friendShare,
    paidByName: expense.paidByName,
  };
}

function buildActivity(
  expenses: FriendDetailData['expenses'],
  settlements: FriendDetailReadModelRow['settlements'],
  activities: FriendDetailReadModelRow['activities']
): FriendActivityItem[] {
  return [
    ...expenses.map((expense): FriendActivityItem => ({
      id: `expense:${expense.id}`,
      type: 'expense',
      date: expense.date,
      expense,
    })),
    ...settlements.map((settlement): FriendActivityItem => ({
      id: `settlement:${settlement.id}`,
      type: 'settlement',
      date: toTimestamp(settlement.date),
      settlementId: settlement.id,
      amount: settlement.amount,
      currency: settlement.currency,
      direction: settlement.direction,
      groupId: settlement.groupId,
      notes: settlement.notes,
    })),
    ...activities.map((activity): FriendActivityItem => ({
      id: `activity:${activity.id}`,
      type: 'expense_activity',
      date: toTimestamp(activity.date),
      activityId: activity.id,
      activityType: activity.activityType,
      targetId: activity.targetId,
      description: activity.description,
      amount: activity.amount,
      userId: activity.userId,
      userName: activity.userName,
      groupId: activity.groupId,
      groupName: activity.groupName,
      isDeleted: activity.isDeleted,
      isUpdated: activity.isUpdated,
    })),
  ].sort((a, b) => b.date - a.date);
}

export function createFriendDetailReadModel(rpcClient: FriendDetailRpcClient = defaultRpcClient) {
  return {
    async getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null> {
      const startedAt = Date.now();
      const { data, error } = await rpcClient.rpc('get_friend_detail_read_model', {
        p_friend_id: friendId,
      });

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[FriendDetail] read model failed', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
        }

        const normalizedError = new Error(error.message);
        normalizedError.name = 'FriendDetailReadModelError';
        throw normalizedError;
      }
      if (!data) return null;

      const row = data as FriendDetailReadModelRow;
      const friend: User & { balance: number } = {
        id: row.friend.id,
        name: row.friend.name,
        email: row.friend.email,
        phone: row.friend.phone,
        avatar: row.friend.avatar,
        pushToken: row.friend.pushToken,
        isActive: row.friend.isActive,
        createdAt: toTimestamp(row.friend.createdAt),
        balance: row.friend.balance,
      };
      const expenses = row.expenses.map(mapExpense);

      if (process.env.NODE_ENV === 'development') {
        console.info('[FriendDetail] read model loaded', {
          durationMs: Date.now() - startedAt,
          expenseCount: expenses.length,
          activityCount: row.activities.length,
          settlementCount: row.settlements.length,
        });
      }

      return {
        friend,
        expenses,
        activity: buildActivity(expenses, row.settlements, row.activities),
      };
    },
  };
}

export const friendDetailReadModel = createFriendDetailReadModel();
