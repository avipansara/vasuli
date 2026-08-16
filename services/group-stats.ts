import type { GroupDetailReadModel } from './group-detail-read-model';
import { SETTLED_BALANCE_THRESHOLD } from './group-balance';

export interface GroupPayerStat {
  userId: string;
  name: string;
  total: number;
}

export interface GroupBalanceStat {
  userId: string;
  name: string;
  balance: number;
}

export interface GroupStats {
  totalSpent: number;
  expenseCount: number;
  totalOutstanding: number;
  settledMemberCount: number;
  unsettledMemberCount: number;
  payerTotals: GroupPayerStat[];
  memberBalances: GroupBalanceStat[];
}

export function calculateGroupStats(detail: GroupDetailReadModel): GroupStats {
  const namesById = new Map(
    detail.members.map(member => [member.userId, member.user?.name || 'Unknown'])
  );

  for (const expense of detail.expenses) {
    if (!namesById.has(expense.paidBy)) {
      namesById.set(expense.paidBy, expense.paidByUser?.name || 'Unknown');
    }
  }

  const payerTotals = new Map<string, number>();
  for (const expense of detail.expenses) {
    payerTotals.set(expense.paidBy, (payerTotals.get(expense.paidBy) || 0) + expense.amount);
  }

  const memberBalances = detail.members
    .map(member => ({
      userId: member.userId,
      name: namesById.get(member.userId) || 'Unknown',
      balance: detail.balances.get(member.userId) || 0,
    }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  return {
    totalSpent: detail.expenses.reduce((total, expense) => total + expense.amount, 0),
    expenseCount: detail.expenses.length,
    totalOutstanding: memberBalances.reduce(
      (total, member) => total + Math.max(-member.balance, 0),
      0,
    ),
    settledMemberCount: memberBalances.filter(
      member => Math.abs(member.balance) < SETTLED_BALANCE_THRESHOLD
    ).length,
    unsettledMemberCount: memberBalances.filter(
      member => Math.abs(member.balance) >= SETTLED_BALANCE_THRESHOLD
    ).length,
    payerTotals: [...payerTotals.entries()]
      .map(([userId, total]) => ({
        userId,
        name: namesById.get(userId) || 'Unknown',
        total,
      }))
      .sort((a, b) => b.total - a.total),
    memberBalances,
  };
}
