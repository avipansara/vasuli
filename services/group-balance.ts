import type { Expense, ExpenseSplit, Settlement } from '@/types/database';

export const SETTLED_BALANCE_THRESHOLD = 0.01;

export function calculateGroupBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[]
): Map<string, number> {
  const balances = new Map<string, number>();
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  for (const expense of expenses) {
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amount);

    for (const split of splitsByExpenseId.get(expense.id) ?? []) {
      balances.set(split.userId, (balances.get(split.userId) ?? 0) - split.amount);
    }
  }

  for (const settlement of settlements) {
    balances.set(settlement.fromUserId, (balances.get(settlement.fromUserId) ?? 0) + settlement.amount);
    balances.set(settlement.toUserId, (balances.get(settlement.toUserId) ?? 0) - settlement.amount);
  }

  for (const [userId, balance] of balances) {
    if (Math.abs(balance) < SETTLED_BALANCE_THRESHOLD) {
      balances.set(userId, 0);
    }
  }

  return balances;
}

export function areGroupBalancesSettled(balances: Map<string, number>): boolean {
  for (const balance of balances.values()) {
    if (Math.abs(balance) >= SETTLED_BALANCE_THRESHOLD) {
      return false;
    }
  }

  return true;
}

export function isGroupSettled(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[]
): boolean {
  return areGroupBalancesSettled(calculateGroupBalances(expenses, splits, settlements));
}
