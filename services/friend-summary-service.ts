import type { Expense, ExpenseSplit, Settlement, User } from '@/types/database';
import { expenseService } from './expense-service';
import { settlementService } from './settlement-service';
import { userService } from './user-service';

export interface FriendSummary extends User {
  balance: number;
  recentExpenses?: Expense[];
}

export function buildFriendSummaries(
  currentUserId: string,
  friends: User[],
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  recentLimit = 2
): FriendSummary[] {
  const friendIds = new Set(friends.map(friend => friend.id));
  const balances = new Map(friends.map(friend => [friend.id, 0]));
  const recentByFriend = new Map<string, Expense[]>();
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  const balanceImpacts: { friendId: string; expense: Expense; amount: number }[] = [];

  for (const expense of expenses) {
    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];
    const currentUserSplit = expenseSplits.find(split => split.userId === currentUserId);

    if (!currentUserSplit) continue;

    if (expense.paidBy === currentUserId) {
      for (const split of expenseSplits) {
        if (!friendIds.has(split.userId)) continue;

        balances.set(split.userId, (balances.get(split.userId) ?? 0) + split.amount);
        balanceImpacts.push({
          friendId: split.userId,
          expense,
          amount: split.amount,
        });
      }
    } else if (friendIds.has(expense.paidBy)) {
      balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) - currentUserSplit.amount);
      balanceImpacts.push({
        friendId: expense.paidBy,
        expense,
        amount: -currentUserSplit.amount,
      });
    }
  }

  for (const settlement of settlements) {
    const isCurrentUserPayer = settlement.fromUserId === currentUserId;
    const friendId = isCurrentUserPayer ? settlement.toUserId : settlement.fromUserId;

    if (!friendIds.has(friendId)) continue;

    const amount = isCurrentUserPayer ? settlement.amount : -settlement.amount;
    balances.set(friendId, (balances.get(friendId) ?? 0) + amount);
  }

  for (const { friendId, expense, amount } of balanceImpacts) {
    const balance = balances.get(friendId) ?? 0;
    if (Math.abs(balance) < 0.01) continue;
    if ((balance > 0 && amount <= 0) || (balance < 0 && amount >= 0)) continue;

    const expensesForFriend = recentByFriend.get(friendId) ?? [];
    expensesForFriend.push({ ...expense, amount: Math.abs(amount) });
    recentByFriend.set(friendId, expensesForFriend);
  }

  for (const expensesForFriend of recentByFriend.values()) {
    expensesForFriend.sort((a, b) => b.date - a.date);
  }

  return friends.map(friend => ({
    ...friend,
    balance: balances.get(friend.id) ?? 0,
    recentExpenses: (recentByFriend.get(friend.id) ?? []).slice(0, recentLimit),
  }));
}

export const friendSummaryService = {
  async getHomeSummaries(currentUserId: string): Promise<FriendSummary[]> {
    const friends = await userService.getUserFriends(currentUserId);
    if (friends.length === 0) return [];

    const [expenses, settlements] = await Promise.all([
      expenseService.getUserExpenses(currentUserId),
      settlementService.getUserSettlements(currentUserId),
    ]);
    const splits = await expenseService.getSplitsForExpenses(expenses.map(expense => expense.id));

    return buildFriendSummaries(currentUserId, friends, expenses, splits, settlements);
  },
};
