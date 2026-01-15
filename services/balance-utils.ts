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
  
  // 1. Calculate balances from group expenses
  const groups = await groupService.getAll();
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
  const allExpenses = await expenseService.getAll();
  const individualExpenses = allExpenses.filter(e => !e.groupId);
  
  const individualBalances = new Map<string, number>();
  
  for (const expense of individualExpenses) {
    const splits = await expenseService.getSplits(expense.id);
    
    // Add amount paid to payer's balance
    const payerBalance = individualBalances.get(expense.paidBy) || 0;
    individualBalances.set(expense.paidBy, payerBalance + expense.amount);
    
    // Subtract split amounts from each user
    for (const split of splits) {
      const userBalance = individualBalances.get(split.userId) || 0;
      individualBalances.set(split.userId, userBalance - split.amount);
    }
  }
  
  // Add individual balance to totals
  const userIndividualBalance = individualBalances.get(userId) || 0;
  if (userIndividualBalance > 0) {
    totalOwedAmount += userIndividualBalance;
  } else if (userIndividualBalance < 0) {
    totalOwingAmount += Math.abs(userIndividualBalance);
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
  
  // 1. Calculate from ALL expenses (both group and individual)
  const allExpenses = await expenseService.getAll();
  
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
  const allSettlements = await settlementService.getAll();
  const friendSettlements = allSettlements.filter(s => 
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
