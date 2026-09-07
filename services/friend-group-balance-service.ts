import type { Expense, ExpenseSplit, Group, Settlement, SettlementCancellation, SettlementScopeTransfer } from '@/types/database';
import { expenseService } from './expense-service';
import { groupService } from './group-service';
import { settlementService } from './settlement-service';
import { calculateGroupBalances, cancellationPairFromRow, type CancellationPairResolver } from './group-balance';
import type { FriendGroupBalanceSummary } from './friend-detail-service';
import { scopeTransferService } from './scope-transfer-service';
import { settlementCancellationService } from './settlement-cancellation-service';
import { settlementOperationMetadataService } from './settlement-operation-metadata-service';
import { resolveOperationPair } from './settlement-operation-projection';

export type FriendGroupBalanceDataSource = {
  getUserGroups(userId: string): Promise<Group[]>;
  getExpenses(groupIds: string[]): Promise<Expense[]>;
  getSplits(expenseIds: string[]): Promise<ExpenseSplit[]>;
  getSettlements(groupIds: string[]): Promise<Settlement[]>;
  getScopeTransfers?(groupIds: string[]): Promise<SettlementScopeTransfer[]>;
  getCancellations?(groupIds: string[]): Promise<SettlementCancellation[]>;
  getSettlementOperations?(groupIds: string[]): Promise<import('./settlement-operation-projection').SettlementOperationStatusRecord[]>;
};

const defaultDataSource: FriendGroupBalanceDataSource = {
  getUserGroups: groupService.getUserGroups,
  getExpenses: expenseService.getByGroups,
  getSplits: expenseService.getSplitsForExpenses,
  getSettlements: settlementService.getByGroups,
  getScopeTransfers: async (groupIds) => {
    const transfers = await Promise.all(groupIds.map(groupId => scopeTransferService.getByGroup(groupId)));
    return transfers.flat();
  },
  getCancellations: async (groupIds) => {
    const cancellations = await Promise.all(groupIds.map(groupId => settlementCancellationService.getByGroup(groupId)));
    return cancellations.flat();
  },
  getSettlementOperations: async (groupIds) => {
    const operations = await Promise.all(groupIds.map(groupId => settlementOperationMetadataService.getByGroup(groupId)));
    return operations.flat();
  },
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
      const [expenses, settlements, scopeTransfers, cancellations, settlementOperations] = await Promise.all([
        dataSource.getExpenses(groupIds),
        dataSource.getSettlements(groupIds),
        dataSource.getScopeTransfers?.(groupIds) ?? Promise.resolve([]),
        dataSource.getCancellations?.(groupIds) ?? Promise.resolve([]),
        dataSource.getSettlementOperations?.(groupIds) ?? Promise.resolve([]),
      ]);
      if (__DEV__) {
        console.log('[FriendGroupBalance] loaded inputs', {
          friendId,
          groupCount: groupIds.length,
          expenseCount: expenses.length,
          settlementCount: settlements.length,
          scopeTransferCount: scopeTransfers.length,
          cancellationCount: cancellations.length,
        });
      }
      const activeExpenses = expenses.filter(expense => !expense.deletedAt);
      const splits = await dataSource.getSplits(activeExpenses.map(expense => expense.id));

      return sharedGroups.flatMap(group => {
        const groupExpenses = activeExpenses.filter(expense => expense.groupId === group.id);
        const groupSettlements = settlements.filter(settlement => settlement.groupId === group.id);
        const groupTransfers = scopeTransfers.filter(transfer => transfer.groupId === group.id);
        const groupCancellations = cancellations.filter(cancellation => cancellation.groupId === group.id);
        const currencies = new Set([
          ...groupExpenses.map(expense => expense.currency),
          ...groupSettlements.map(settlement => settlement.currency),
          ...groupTransfers.map(transfer => transfer.currency),
          ...groupCancellations.map(cancellation => cancellation.currency),
        ]);

        return [...currencies].map(currency => {
          const expensesForCurrency = groupExpenses.filter(expense => expense.currency === currency);
          const settlementsForCurrency = groupSettlements.filter(settlement => settlement.currency === currency);
          const transfersForCurrency = scopeTransfers.filter(
            transfer => transfer.groupId === group.id && transfer.currency === currency,
          );
          // Balance cancellations clear the operation pair's outstanding in
          // this scope. The pair resolves from operation metadata
          // participants, then sibling cash/transfer rows, then the pair
          // carried on the cancellation row itself; the legacy transfer
          // branch inside the ledger engine is untouched.
          const cancellationsForCurrency = groupCancellations.filter(
            cancellation => cancellation.currency === currency,
          );
          const pairForCancellation: CancellationPairResolver = cancellation => resolveOperationPair(
            cancellation.operationId,
            {
              operations: settlementOperations,
              settlements: groupSettlements,
              transfers: groupTransfers,
            },
          ) ?? cancellationPairFromRow(cancellation);
          const friendGroupBalance = calculateGroupBalances(
            expensesForCurrency,
            splits.filter(split => expensesForCurrency.some(expense => expense.id === split.expenseId)),
            settlementsForCurrency,
            transfersForCurrency,
            cancellationsForCurrency,
            pairForCancellation,
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
            ...transfersForCurrency.map(transfer => transfer.createdAt),
            ...cancellationsForCurrency.map(cancellation => cancellation.createdAt),
          );

          if (__DEV__) {
            console.log('[FriendGroupBalance] projected group currency', {
              friendId,
              groupId: group.id,
              currency,
              expenseCount: expensesForCurrency.length,
              settlementCount: settlementsForCurrency.length,
              scopeTransferCount: transfersForCurrency.length,
              cancellationCount: cancellationsForCurrency.length,
              balance: amount,
            });
          }

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
