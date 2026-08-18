import type { ExpenseSplit } from '@/types/database';
import { expenseService } from './expense-service';
import { groupService } from './group-service';
import { scopeTransferService } from './scope-transfer-service';
import { settlementService } from './settlement-service';

function groupSplitsByExpenseId(splits: ExpenseSplit[]): Map<string, ExpenseSplit[]> {
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  return splitsByExpenseId;
}

/**
 * Calculate balances for a specific group
 */
export async function calculateBalances(groupId: string): Promise<Map<string, number>> {
  const balances = await calculateGroupBalances([groupId]);
  return balances.get(groupId) ?? new Map<string, number>();
}

export async function calculateGroupBalances(groupIds: string[]): Promise<Map<string, Map<string, number>>> {
  const uniqueGroupIds = [...new Set(groupIds)].filter(Boolean);
  const balances = new Map<string, Map<string, number>>(
    uniqueGroupIds.map(groupId => [groupId, new Map<string, number>()])
  );
  if (uniqueGroupIds.length === 0) return balances;

  const [expenses, settlements, scopeTransfersByGroup] = await Promise.all([
    expenseService.getByGroups(uniqueGroupIds),
    settlementService.getByGroups(uniqueGroupIds),
    Promise.all(uniqueGroupIds.map(groupId => scopeTransferService.getByGroup(groupId))),
  ]);
  const splits = await expenseService.getSplitsForExpenses(expenses.map(expense => expense.id));
  const splitsByExpenseId = groupSplitsByExpenseId(splits);

  for (const expense of expenses) {
    if (!expense.groupId) continue;
    const groupBalances = balances.get(expense.groupId);
    if (!groupBalances) continue;

    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];
    groupBalances.set(
      expense.paidBy,
      (groupBalances.get(expense.paidBy) ?? 0) + expense.amount
    );

    for (const split of expenseSplits) {
      groupBalances.set(
        split.userId,
        (groupBalances.get(split.userId) ?? 0) - split.amount
      );
    }
  }

  for (const settlement of settlements) {
    if (!settlement.groupId) continue;
    const groupBalances = balances.get(settlement.groupId);
    if (!groupBalances) continue;

    groupBalances.set(
      settlement.fromUserId,
      (groupBalances.get(settlement.fromUserId) ?? 0) + settlement.amount
    );
    groupBalances.set(
      settlement.toUserId,
      (groupBalances.get(settlement.toUserId) ?? 0) - settlement.amount
    );
  }

  for (let i = 0; i < uniqueGroupIds.length; i++) {
    const groupId = uniqueGroupIds[i];
    const groupBalances = balances.get(groupId);
    if (!groupBalances) continue;

    const scopeTransfers = scopeTransfersByGroup[i];
    for (const transfer of scopeTransfers) {
      // signedGroupBalanceDelta is the change to the actor's group balance.
      // The transfer's from/to users are the counterparties, so apply the
      // inverse delta to the sender and the delta to the recipient.
      groupBalances.set(
        transfer.fromUserId,
        (groupBalances.get(transfer.fromUserId) ?? 0) - transfer.signedGroupBalanceDelta,
      );
      groupBalances.set(
        transfer.toUserId,
        (groupBalances.get(transfer.toUserId) ?? 0) + transfer.signedGroupBalanceDelta,
      );
    }
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
  const groupBalances = await calculateGroupBalances(groups.map(group => group.id));
  for (const balances of groupBalances.values()) {
    const userBalance = balances.get(userId) || 0;

    if (userBalance > 0) {
      totalOwedAmount += userBalance;
    } else if (userBalance < 0) {
      totalOwingAmount += Math.abs(userBalance);
    }
  }

  // 2. Calculate balances from individual friend expenses (non-group)
  // We must calculate pairwise balance with each friend to avoid incorrect netting across different friends
  const [allExpenses, allSettlements] = await Promise.all([
    expenseService.getUserExpenses(userId),
    settlementService.getUserSettlements(userId),
  ]);
  const individualExpenses = allExpenses.filter(e => !e.groupId);
  const individualSettlements = allSettlements.filter(s => !s.groupId);
  const splits = await expenseService.getSplitsForExpenses(individualExpenses.map(expense => expense.id));
  const splitsByExpenseId = groupSplitsByExpenseId(splits);

  const friendBalances = new Map<string, number>();

  // Process Expenses
  for (const expense of individualExpenses) {
    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];

    if (expense.paidBy === userId) {
      // I paid, friends owe me
      for (const split of expenseSplits) {
        if (split.userId !== userId) {
          const current = friendBalances.get(split.userId) || 0;
          friendBalances.set(split.userId, current + split.amount);
        }
      }
    } else {
      // Friend paid, I owe them
      const payerId = expense.paidBy;
      const mySplit = expenseSplits.find(s => s.userId === userId);
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
  const [allExpenses, allSettlements] = await Promise.all([
    expenseService.getUserExpenses(currentUserId),
    settlementService.getUserSettlements(currentUserId),
  ]);
  const splits = await expenseService.getSplitsForExpenses(allExpenses.map(expense => expense.id));

  return calculateFriendBalanceFromData(
    currentUserId,
    friendId,
    allExpenses,
    splits,
    allSettlements,
  );
}

function calculateFriendBalanceFromData(
  currentUserId: string,
  friendId: string,
  allExpenses: import('@/types/database').Expense[],
  splits: import('@/types/database').ExpenseSplit[],
  allSettlements: import('@/types/database').Settlement[],
): number {
  let balance = 0;
  const splitsByExpenseId = groupSplitsByExpenseId(splits);

  // 1. Calculate from expenses involving the current user (both group and individual)
  for (const expense of allExpenses) {
    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];
    const currentUserSplit = expenseSplits.find(s => s.userId === currentUserId);
    const friendSplit = expenseSplits.find(s => s.userId === friendId);

    // Only count expenses where both users are involved
    if (currentUserSplit && friendSplit) {
      if (expense.paidBy === currentUserId) {
        balance += friendSplit.amount;
      } else if (expense.paidBy === friendId) {
        balance -= currentUserSplit.amount;
      }
    }
  }

  // 2. Account for settlements between these two users
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
  const balances = await Promise.all(
    friendIds.map(friendId => calculateFriendBalance(userId, friendId))
  );
  return balances.reduce((total, balance) => total + balance, 0);
}
/**
 * Get pending expenses between two users that contribute to the current net balance.
 * Returns up to `limit` most recent expenses.
 */
export async function getFriendRecentExpenses(currentUserId: string, friendId: string, limit: number = 2): Promise<import('@/types/database').Expense[]> {
  const [allExpenses, allSettlements] = await Promise.all([
    expenseService.getUserExpenses(currentUserId),
    settlementService.getUserSettlements(currentUserId),
  ]);
  const splits = await expenseService.getSplitsForExpenses(allExpenses.map(expense => expense.id));
  const balance = calculateFriendBalanceFromData(
    currentUserId,
    friendId,
    allExpenses,
    splits,
    allSettlements,
  );

  // If settled up, no pending expenses
  if (Math.abs(balance) < 0.01) {
    return [];
  }

  const friendExpenses: import('@/types/database').Expense[] = [];
  const splitsByExpenseId = groupSplitsByExpenseId(splits);

  // 1. Filter expenses where both users are involved
  for (const expense of allExpenses) {
    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];
    const currentUserSplit = expenseSplits.find(s => s.userId === currentUserId);
    const friendSplit = expenseSplits.find(s => s.userId === friendId);

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
