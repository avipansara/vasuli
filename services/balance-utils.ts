import { expenseService } from './expense-service';
import { settlementService } from './settlement-service';

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

export async function calculateFriendBalance(currentUserId: string, friendId: string): Promise<number> {
  let balance = 0;
  
  const allExpenses = await expenseService.getAll();
  
  for (const expense of allExpenses) {
    const splits = await expenseService.getSplits(expense.id);
    
    const currentUserSplit = splits.find(s => s.userId === currentUserId);
    const friendSplit = splits.find(s => s.userId === friendId);
    
    if (currentUserSplit && friendSplit) {
      if (expense.paidBy === currentUserId) {
        balance += friendSplit.amount;
      } else if (expense.paidBy === friendId) {
        balance -= currentUserSplit.amount;
      }
    }
  }
  
  const allSettlements = await settlementService.getAll();
  const friendSettlements = allSettlements.filter(s => 
    (s.fromUserId === currentUserId && s.toUserId === friendId) ||
    (s.fromUserId === friendId && s.toUserId === currentUserId));
  
  for (const settlement of friendSettlements) {
    if (settlement.fromUserId === currentUserId) {
      balance += settlement.amount;
    } else {
      balance -= settlement.amount;
    }
  }
  
  return balance;
}
