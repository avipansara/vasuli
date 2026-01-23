import { expenseService } from './expense-service';
import { groupService } from './group-service';
import { settlementService } from './settlement-service';

/**
 * Calculate balances for a specific group
 */
export async function calculateBalances(groupId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

  const expenses = await expenseService.getByGroup(groupId);

  for (const expense of expenses) {
    const splits = await expenseService.getSplits(expense.id);

    const currentBalance = balances.get(expense.paidBy) || 0;
    balances.set(expense.paidBy, currentBalance + expense.amount);

    for (const split of splits) {
      const userBalance = balances.get(split.userId) || 0;
      balances.set(split.userId, userBalance - split.amount);
    }
  }

  const settlements = await settlementService.getByGroup(groupId);
  for (const settlement of settlements) {
    const fromBalance = balances.get(settlement.fromUserId) || 0;
    balances.set(settlement.fromUserId, fromBalance + settlement.amount);

    const toBalance = balances.get(settlement.toUserId) || 0;
    balances.set(settlement.toUserId, toBalance - settlement.amount);
  }

  return balances;
}

/**
 * Calculate total balances for a user across ALL expenses (groups + individual)
 * Returns { totalOwed, totalOwing }
 */
export async function calculateUserTotalBalance(userId: string): Promise<{ totalOwed: number; totalOwing: number }> {
  let totalOwedAmount = 0;
  let totalOwingAmount = 0;

  // 1. Calculate balances from group expenses (only groups user is a member of)
  const groups = await groupService.getUserGroups(userId);
  for (const group of groups) {
    const balances = await calculateBalances(group.id);
    const userBalance = balances.get(userId) || 0;

    if (userBalance > 0) {
      totalOwedAmount += userBalance;
    } else if (userBalance < 0) {
      totalOwingAmount += Math.abs(userBalance);
    }
  }

  // 2. Calculate balances from individual friend expenses (non-group)
  // We must calculate pairwise balance with each friend to avoid incorrect netting across different friends
  const allExpenses = await expenseService.getUserExpenses(userId);
  const individualExpenses = allExpenses.filter(e => !e.groupId);

  const allSettlements = await settlementService.getUserSettlements(userId);
  const individualSettlements = allSettlements.filter(s => !s.groupId);

  const friendBalances = new Map<string, number>();

  // Process Expenses
  for (const expense of individualExpenses) {
    const splits = await expenseService.getSplits(expense.id);

    if (expense.paidBy === userId) {
      // I paid, friends owe me
      for (const split of splits) {
        if (split.userId !== userId) {
          const current = friendBalances.get(split.userId) || 0;
          friendBalances.set(split.userId, current + split.amount);
        }
      }
    } else {
      // Friend paid, I owe them
      const payerId = expense.paidBy;
      const mySplit = splits.find(s => s.userId === userId);
      if (mySplit) {
        const current = friendBalances.get(payerId) || 0;
        friendBalances.set(payerId, current - mySplit.amount);
      }
    }
  }

  // Process Settlements
  for (const settlement of individualSettlements) {
    const isPayer = settlement.fromUserId === userId;
    const friendId = isPayer ? settlement.toUserId : settlement.fromUserId;

    // Settlement logic:
    // If I same logic as calculateBalances/calculateFriendBalance
    // Positive balance = Friend owes me
    // Negative balance = I owe friend

    if (isPayer) {
      // I paid friend (settled my debt). My balance w.r.t friend increases (becomes less negative).
      // Or if I lent money, they owe me more (unlikely for settlement, but math holds).
      const current = friendBalances.get(friendId) || 0;
      friendBalances.set(friendId, current + settlement.amount);
    } else {
      // Friend paid me. They owe me less (becomes less positive).
      const current = friendBalances.get(friendId) || 0;
      friendBalances.set(friendId, current - settlement.amount);
    }
  }

  // Add individual balances to totals
  for (const balance of friendBalances.values()) {
    if (balance > 0.01) { // Use small threshold for float math
      totalOwedAmount += balance;
    } else if (balance < -0.01) {
      totalOwingAmount += Math.abs(balance);
    }
  }

  return { totalOwed: totalOwedAmount, totalOwing: totalOwingAmount };
}

/**
 * Calculate balance between two users across ALL expenses (groups + individual)
 * Positive = currentUser is owed by friend
 * Negative = currentUser owes friend
 */
export async function calculateFriendBalance(currentUserId: string, friendId: string): Promise<number> {
  let balance = 0;

  // 1. Calculate from expenses involving the current user (both group and individual)
  const allExpenses = await expenseService.getUserExpenses(currentUserId);

  for (const expense of allExpenses) {
    const splits = await expenseService.getSplits(expense.id);

    const currentUserSplit = splits.find(s => s.userId === currentUserId);
    const friendSplit = splits.find(s => s.userId === friendId);

    // Only count expenses where both users are involved
    if (currentUserSplit && friendSplit) {
      if (expense.paidBy === currentUserId) {
        // Current user paid, friend owes their share
        balance += friendSplit.amount;
      } else if (expense.paidBy === friendId) {
        // Friend paid, current user owes their share
        balance -= currentUserSplit.amount;
      }
    }
  }

  // 2. Account for settlements between these two users
  const allSettlements = await settlementService.getUserSettlements(currentUserId);
  const friendSettlements = allSettlements.filter((s: { fromUserId: string; toUserId: string }) =>
    (s.fromUserId === currentUserId && s.toUserId === friendId) ||
    (s.fromUserId === friendId && s.toUserId === currentUserId));

  for (const settlement of friendSettlements) {
    if (settlement.fromUserId === currentUserId) {
      // Current user paid friend
      balance += settlement.amount;
    } else {
      // Friend paid current user
      balance -= settlement.amount;
    }
  }

  return balance;
}

/**
 * Get net balance for a user (sum of all friend balances)
 * Used for the index screen header
 */
export async function calculateUserNetBalance(userId: string, friendIds: string[]): Promise<number> {
  let netBalance = 0;

  for (const friendId of friendIds) {
    const balance = await calculateFriendBalance(userId, friendId);
    netBalance += balance;
  }

  return netBalance;
}
/**
 * Get pending expenses between two users that contribute to the current net balance.
 * Returns up to `limit` most recent expenses.
 */
export async function getFriendRecentExpenses(currentUserId: string, friendId: string, limit: number = 2): Promise<import('@/types/database').Expense[]> {
  const balance = await calculateFriendBalance(currentUserId, friendId);

  // If settled up, no pending expenses
  if (Math.abs(balance) < 0.01) {
    return [];
  }

  const allExpenses = await expenseService.getUserExpenses(currentUserId);
  const friendExpenses: import('@/types/database').Expense[] = [];

  // 1. Filter expenses where both users are involved
  for (const expense of allExpenses) {
    const splits = await expenseService.getSplits(expense.id);
    const currentUserSplit = splits.find(s => s.userId === currentUserId);
    const friendSplit = splits.find(s => s.userId === friendId);

    if (currentUserSplit && friendSplit) {
      // Calculate the net impact of this specific expense on the balance
      // If current user paid, it's a positive impact (friend owes me)
      // If friend paid, it's a negative impact (I owe friend)
      const amount = expense.paidBy === currentUserId ? friendSplit.amount : -currentUserSplit.amount;

      // We only care about expenses that go in the SAME direction as the current total balance
      // e.g. if friend owes me $50, we only look at expenses where they owe me.
      if ((balance > 0 && amount > 0) || (balance < 0 && amount < 0)) {
        friendExpenses.push({ ...expense, amount: Math.abs(amount) }); // Store the share amount for logic
      }
    }
  }

  // 2. Sort by date DESC
  friendExpenses.sort((a, b) => b.date - a.date);

  // 3. Take the most recent expenses that account for the balance
  const result: import('@/types/database').Expense[] = [];
  let cumulativeAmount = 0;
  const targetAmount = Math.abs(balance);

  for (const exp of friendExpenses) {
    if (result.length >= limit) break;

    result.push(exp);
    cumulativeAmount += exp.amount; // This is the specific share amount we stored above

    // If we've accounted for the entire balance, we can stop
    if (cumulativeAmount >= targetAmount - 0.01) break;
  }

  return result;
}
