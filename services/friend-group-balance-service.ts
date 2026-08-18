import type { Expense, ExpenseSplit, Group, Settlement } from '@/types/database';
import { expenseService } from './expense-service';
import { groupService } from './group-service';
import { settlementService } from './settlement-service';
import { calculateGroupBalances } from './group-balance';
import type { FriendGroupBalanceSummary } from './friend-detail-service';

export type FriendGroupBalanceDataSource = {
  getUserGroups(userId: string): Promise<Group[]>;
  getExpenses(groupIds: string[]): Promise<Expense[]>;
  getSplits(expenseIds: string[]): Promise<ExpenseSplit[]>;
  getSettlements(groupIds: string[]): Promise<Settlement[]>;
};

const defaultDataSource: FriendGroupBalanceDataSource = {
  getUserGroups: groupService.getUserGroups,
  getExpenses: expenseService.getByGroups,
  getSplits: expenseService.getSplitsForExpenses,
  getSettlements: settlementService.getByGroups,
};

export function createFriendGroupBalanceService(
  dataSource: FriendGroupBalanceDataSource = defaultDataSource
) {
  return {
    async getSharedGroupBalances(currentUserId: string, friendId: string): Promise<FriendGroupBalanceSummary[]> {
      const [currentUserGroups, friendGroups] = await Promise.all([
        dataSource.getUserGroups(currentUserId),
        dataSource.getUserGroups(friendId),
      ]);
      const friendGroupIds = new Set(friendGroups.map(group => group.id));
      const sharedGroups = currentUserGroups.filter(group => friendGroupIds.has(group.id));
      if (sharedGroups.length === 0) return [];

      const groupIds = sharedGroups.map(group => group.id);
      const [expenses, settlements] = await Promise.all([
        dataSource.getExpenses(groupIds),
        dataSource.getSettlements(groupIds),
      ]);
      const activeExpenses = expenses.filter(expense => !expense.deletedAt);
      const splits = await dataSource.getSplits(activeExpenses.map(expense => expense.id));

      return sharedGroups.flatMap(group => {
        const groupExpenses = activeExpenses.filter(expense => expense.groupId === group.id);
        const groupSettlements = settlements.filter(settlement => settlement.groupId === group.id);
        const currencies = new Set([
          ...groupExpenses.map(expense => expense.currency),
          ...groupSettlements.map(settlement => settlement.currency),
        ]);

        return [...currencies].map(currency => {
          const expensesForCurrency = groupExpenses.filter(expense => expense.currency === currency);
          const settlementsForCurrency = groupSettlements.filter(settlement => settlement.currency === currency);
          const friendGroupBalance = calculateGroupBalances(
            expensesForCurrency,
            splits.filter(split => expensesForCurrency.some(expense => expense.id === split.expenseId)),
            settlementsForCurrency,
          ).get(friendId) ?? 0;
          const amount = normalizeAmount(-friendGroupBalance);
          /*
           * The sign is inverted because Group balances are stored from the
           * current user's perspective: a positive Friend balance means the
           * current user owes that Friend. Friend detail displays the same
           * relationship as a signed amount.
           */
          const lastActivityAt = Math.max(
            ...expensesForCurrency.map(expense => expense.updatedAt || expense.date),
            ...settlementsForCurrency.map(settlement => settlement.createdAt || settlement.date),
          );

          return {
            groupId: group.id,
            groupName: group.name,
            currency,
            amount,
            direction: amount > 0.01 ? 'you_are_owed' : amount < -0.01 ? 'you_owe' : 'settled',
            lastActivityAt: Number.isFinite(lastActivityAt) ? lastActivityAt : undefined,
          } satisfies FriendGroupBalanceSummary;
        });
      });
    },
  };
}

function normalizeAmount(amount: number): number {
  return Math.abs(amount) < 0.01 ? 0 : Number(amount.toFixed(2));
}

export const friendGroupBalanceService = createFriendGroupBalanceService();
