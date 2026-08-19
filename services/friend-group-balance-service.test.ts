import { describe, expect, it } from 'vitest';
import { createFriendGroupBalanceService } from '@/services/friend-group-balance-service';
import type { Expense, ExpenseSplit, Group, Settlement, SettlementScopeTransfer } from '@/types/database';

const group = (id: string, name: string): Group => ({
  id,
  name,
  createdAt: 1,
  updatedAt: 30,
});

const expense: Expense = {
  id: 'car-rental',
  groupId: 'alaska',
  description: 'Car rental',
  amount: 300,
  currency: 'USD',
  paidBy: 'isha',
  date: 20,
  createdAt: 20,
  updatedAt: 20,
};

const splits: ExpenseSplit[] = [
  { id: 'split-you', expenseId: 'car-rental', userId: 'current-user', amount: 100, splitType: 'equal' },
  { id: 'split-avee', expenseId: 'car-rental', userId: 'avee', amount: 100, splitType: 'equal' },
  { id: 'split-isha', expenseId: 'car-rental', userId: 'isha', amount: 100, splitType: 'equal' },
];

describe('friend group balance service', () => {
  it('matches the Group settle balance for Avee across the full group ledger', async () => {
    const service = createFriendGroupBalanceService({
      getUserGroups: async userId => userId === 'current-user'
        ? [group('alaska', 'Alaska 2026'), group('private', 'Private')]
        : [group('alaska', 'Alaska 2026')],
      getExpenses: async () => [expense],
      getSplits: async () => splits,
      getSettlements: async () => [],
    });

    await expect(service.getSharedGroupBalances('current-user', 'avee')).resolves.toEqual([{
      groupId: 'alaska',
      groupName: 'Alaska 2026',
      currency: 'USD',
      amount: 100,
      direction: 'you_are_owed',
      lastActivityAt: 20,
    }]);
  });

  it('matches the Group settlement amount when the current user paid', async () => {
    const service = createFriendGroupBalanceService({
      getUserGroups: async () => [group('alaska', 'Alaska 2026')],
      getExpenses: async () => [{ ...expense, paidBy: 'current-user' }],
      getSplits: async () => splits,
      getSettlements: async () => [],
    });

    await expect(service.getSharedGroupBalances('current-user', 'avee')).resolves.toMatchObject([{
      amount: 100,
      direction: 'you_are_owed',
    }]);
  });

  it('matches the Group settlement amount when the Friend paid', async () => {
    const service = createFriendGroupBalanceService({
      getUserGroups: async () => [group('alaska', 'Alaska 2026')],
      getExpenses: async () => [{ ...expense, paidBy: 'avee' }],
      getSplits: async () => splits,
      getSettlements: async () => [],
    });

    await expect(service.getSharedGroupBalances('current-user', 'avee')).resolves.toMatchObject([{
      amount: -200,
      direction: 'you_owe',
    }]);
  });

  it('includes group settlements and reports a settled group explicitly', async () => {
    const settlement: Settlement = {
      id: 'settlement-1',
      groupId: 'alaska',
      fromUserId: 'current-user',
      toUserId: 'avee',
      amount: 200,
      currency: 'USD',
      date: 25,
      createdAt: 25,
    };
    const service = createFriendGroupBalanceService({
      getUserGroups: async () => [group('alaska', 'Alaska 2026')],
      getExpenses: async () => [{ ...expense, paidBy: 'avee' }],
      getSplits: async () => splits,
      getSettlements: async () => [settlement],
    });

    await expect(service.getSharedGroupBalances('current-user', 'avee')).resolves.toEqual([{
      groupId: 'alaska',
      groupName: 'Alaska 2026',
      currency: 'USD',
      amount: 0,
      direction: 'settled',
      lastActivityAt: 25,
    }]);
  });

  it('applies the signed scope-transfer delta to the projected friend group balance', async () => {
    const transfer: SettlementScopeTransfer = {
      id: 'transfer-1',
      operationId: 'operation-1',
      groupId: 'alaska',
      fromUserId: 'avee',
      toUserId: 'current-user',
      currency: 'USD',
      signedGroupBalanceDelta: -100,
      createdAt: 40,
    };
    const service = createFriendGroupBalanceService({
      getUserGroups: async () => [group('alaska', 'Alaska 2026')],
      getExpenses: async () => [expense],
      getSplits: async () => splits,
      getSettlements: async () => [],
      getScopeTransfers: async () => [transfer],
    });

    await expect(service.getSharedGroupBalances('current-user', 'avee')).resolves.toMatchObject([{
      amount: 200,
      direction: 'you_are_owed',
      lastActivityAt: 40,
    }]);
  });

  it('applies a negative signed scope-transfer delta to the projected friend group balance', async () => {
    const transfer: SettlementScopeTransfer = {
      id: 'transfer-2',
      operationId: 'operation-2',
      groupId: 'alaska',
      fromUserId: 'avee',
      toUserId: 'current-user',
      currency: 'USD',
      signedGroupBalanceDelta: -50,
      createdAt: 40,
    };
    const service = createFriendGroupBalanceService({
      getUserGroups: async () => [group('alaska', 'Alaska 2026')],
      getExpenses: async () => [{ ...expense, paidBy: 'avee' }],
      getSplits: async () => splits,
      getSettlements: async () => [],
      getScopeTransfers: async () => [transfer],
    });

    await expect(service.getSharedGroupBalances('current-user', 'avee')).resolves.toMatchObject([{
      amount: -150,
      direction: 'you_owe',
      lastActivityAt: 40,
    }]);
  });
});
