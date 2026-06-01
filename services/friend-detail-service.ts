import type { Expense, ExpenseSplit, Settlement, User } from '@/types/database';
import { expenseService } from './expense-service';
import { settlementService } from './settlement-service';
import { userService } from './user-service';

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
  settlements: Settlement[]
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

export const friendDetailService = {
  async getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null> {
    const friend = await userService.getById(friendId);
    if (!friend) return null;

    const [expenses, settlements] = await Promise.all([
      expenseService.getUserExpenses(currentUserId),
      settlementService.getUserSettlements(currentUserId),
    ]);
    const splits = await expenseService.getSplitsForExpenses(expenses.map(expense => expense.id));

    return buildFriendDetailData(currentUserId, friend, expenses, splits, settlements);
  },
};
