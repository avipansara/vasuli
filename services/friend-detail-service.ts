import { ActivityType, type Activity, type Expense, type ExpenseSplit, type Settlement, type User } from '@/types/database';
import { friendDetailReadModel } from './friend-detail-read-model';

export interface FriendWithBalance extends User {
  balance: number;
}

export interface FriendExpenseWithSplit extends Expense {
  yourShare: number;
  friendShare: number;
  paidByName: string;
}

export type FriendSettlementDirection = 'you_paid_friend' | 'friend_paid_you';

export type FriendActivityItem =
  | {
    id: string;
    type: 'expense';
    date: number;
    expense: FriendExpenseWithSplit;
  }
  | {
    id: string;
    type: 'settlement';
    date: number;
    settlementId: string;
    amount: number;
    currency: string;
    direction: FriendSettlementDirection;
    groupId?: string;
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
  };

export interface FriendDetailData {
  friend: FriendWithBalance;
  expenses: FriendExpenseWithSplit[];
  activity: FriendActivityItem[];
}

export function calculatePairBalance(
  currentUserId: string,
  friendId: string,
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[]
): number {
  let balance = 0;
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  for (const expense of expenses) {
    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];
    const currentUserSplit = expenseSplits.find(split => split.userId === currentUserId);
    const friendSplit = expenseSplits.find(split => split.userId === friendId);

    if (!currentUserSplit || !friendSplit) continue;

    if (expense.paidBy === currentUserId) {
      balance += friendSplit.amount;
    } else if (expense.paidBy === friendId) {
      balance -= currentUserSplit.amount;
    }
  }

  for (const settlement of settlements) {
    const isPairSettlement =
      (settlement.fromUserId === currentUserId && settlement.toUserId === friendId) ||
      (settlement.fromUserId === friendId && settlement.toUserId === currentUserId);

    if (!isPairSettlement) continue;

    balance += settlement.fromUserId === currentUserId ? settlement.amount : -settlement.amount;
  }

  return Math.abs(balance) < 0.01 ? 0 : balance;
}

export function buildFriendDetailData(
  currentUserId: string,
  friend: User,
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  activities: Activity[] = []
): FriendDetailData {
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  const sharedExpenses = expenses.flatMap((expense): FriendExpenseWithSplit[] => {
    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];
    const currentUserSplit = expenseSplits.find(split => split.userId === currentUserId);
    const friendSplit = expenseSplits.find(split => split.userId === friend.id);

    if (!currentUserSplit || !friendSplit) return [];

    return [{
      ...expense,
      yourShare: currentUserSplit.amount,
      friendShare: friendSplit.amount,
      paidByName: expense.paidBy === currentUserId ? 'You' : friend.name,
    }];
  });

  sharedExpenses.sort((a, b) => b.date - a.date);
  const sharedExpenseIds = new Set(sharedExpenses.map(expense => expense.id));

  const pairSettlements = settlements.flatMap((settlement): FriendActivityItem[] => {
    const isCurrentUserPayer = settlement.fromUserId === currentUserId && settlement.toUserId === friend.id;
    const isFriendPayer = settlement.fromUserId === friend.id && settlement.toUserId === currentUserId;

    if (!isCurrentUserPayer && !isFriendPayer) return [];

    return [{
      id: `settlement:${settlement.id}`,
      type: 'settlement',
      date: settlement.date,
      settlementId: settlement.id,
      amount: settlement.amount,
      currency: settlement.currency,
      direction: isCurrentUserPayer ? 'you_paid_friend' : 'friend_paid_you',
      groupId: settlement.groupId,
      notes: settlement.notes,
    }];
  });

  const activity: FriendActivityItem[] = [
    ...sharedExpenses.map((expense): FriendActivityItem => ({
      id: `expense:${expense.id}`,
      type: 'expense',
      date: expense.date,
      expense,
    })),
    ...pairSettlements,
    ...activities.flatMap((activity): FriendActivityItem[] => {
      const isExpenseUpdate = activity.type === ActivityType.EXPENSE_UPDATED;
      const isExpenseDelete = activity.type === ActivityType.EXPENSE_DELETED;
      if (!isExpenseUpdate && !isExpenseDelete) return [];

      const metadata = parseActivityMetadata(activity.metadata);
      const includesFriend = metadata.participantIds.includes(friend.id);
      const includesCurrentUser = metadata.participantIds.includes(currentUserId);
      const matchesSharedExpense = sharedExpenseIds.has(activity.targetId);
      if (!matchesSharedExpense && !(isExpenseDelete && includesFriend && includesCurrentUser)) return [];

      return [{
        id: `activity:${activity.id}`,
        type: 'expense_activity',
        date: activity.createdAt,
        activityId: activity.id,
        activityType: activity.type,
        targetId: activity.targetId,
        description: activity.description,
        amount: activity.amount,
        userId: activity.userId,
        userName: activity.userName,
        groupId: activity.groupId,
        groupName: activity.groupName,
        isDeleted: isExpenseDelete,
        isUpdated: isExpenseUpdate,
      }];
    }),
  ].sort((a, b) => b.date - a.date);

  return {
    friend: {
      ...friend,
      balance: calculatePairBalance(currentUserId, friend.id, expenses, splits, settlements),
    },
    expenses: sharedExpenses,
    activity,
  };
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

function parseActivityMetadata(metadata?: string): { participantIds: string[] } {
  if (!metadata) return { participantIds: [] };

  try {
    const parsed = JSON.parse(metadata) as { participantIds?: unknown };
    if (!Array.isArray(parsed.participantIds)) return { participantIds: [] };

    return {
      participantIds: parsed.participantIds.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return { participantIds: [] };
  }
}
