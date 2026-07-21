import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByGroup: vi.fn(),
  getSplits: vi.fn(),
  getSplitsForExpenses: vi.fn(),
  getUserExpenses: vi.fn(),
  getByGroupSettlements: vi.fn(),
  getUserSettlements: vi.fn(),
  getUserGroups: vi.fn(),
}));

vi.mock('@/services/expense-service', () => ({
  expenseService: {
    getByGroup: mocks.getByGroup,
    getSplits: mocks.getSplits,
    getSplitsForExpenses: mocks.getSplitsForExpenses,
    getUserExpenses: mocks.getUserExpenses,
  },
}));

vi.mock('@/services/settlement-service', () => ({
  settlementService: {
    getByGroup: mocks.getByGroupSettlements,
    getUserSettlements: mocks.getUserSettlements,
  },
}));

vi.mock('@/services/group-service', () => ({
  groupService: {
    getUserGroups: mocks.getUserGroups,
  },
}));

import { calculateBalances, calculateFriendBalance, getFriendRecentExpenses } from './balance-utils';

describe('balance query batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getByGroupSettlements.mockResolvedValue([]);
    mocks.getUserSettlements.mockResolvedValue([]);
    mocks.getSplitsForExpenses.mockResolvedValue([]);
  });

  it('loads all group splits in one batch query', async () => {
    mocks.getByGroup.mockResolvedValue([
      { id: 'expense-1', paidBy: 'user-1', amount: 30 },
      { id: 'expense-2', paidBy: 'user-2', amount: 20 },
    ]);
    mocks.getSplitsForExpenses.mockResolvedValue([
      { id: 'split-1', expenseId: 'expense-1', userId: 'user-1', amount: 15 },
      { id: 'split-2', expenseId: 'expense-1', userId: 'user-2', amount: 15 },
      { id: 'split-3', expenseId: 'expense-2', userId: 'user-1', amount: 10 },
      { id: 'split-4', expenseId: 'expense-2', userId: 'user-2', amount: 10 },
    ]);

    const balances = await calculateBalances('group-1');

    expect(mocks.getSplitsForExpenses).toHaveBeenCalledWith(['expense-1', 'expense-2']);
    expect(mocks.getSplits).not.toHaveBeenCalled();
    expect(balances.get('user-1')).toBe(5);
    expect(balances.get('user-2')).toBe(-5);
  });

  it('batches splits when calculating a friend balance', async () => {
    mocks.getUserExpenses.mockResolvedValue([
      { id: 'expense-1', paidBy: 'user-1', amount: 40, groupId: undefined },
      { id: 'expense-2', paidBy: 'friend-1', amount: 20, groupId: undefined },
    ]);
    mocks.getSplitsForExpenses.mockResolvedValue([
      { id: 'split-1', expenseId: 'expense-1', userId: 'user-1', amount: 20 },
      { id: 'split-2', expenseId: 'expense-1', userId: 'friend-1', amount: 20 },
      { id: 'split-3', expenseId: 'expense-2', userId: 'user-1', amount: 10 },
      { id: 'split-4', expenseId: 'expense-2', userId: 'friend-1', amount: 10 },
    ]);

    const balance = await calculateFriendBalance('user-1', 'friend-1');

    expect(mocks.getSplitsForExpenses).toHaveBeenCalledWith(['expense-1', 'expense-2']);
    expect(mocks.getSplits).not.toHaveBeenCalled();
    expect(balance).toBe(10);
  });

  it('does not reload expenses while finding recent friend expenses', async () => {
    mocks.getUserExpenses.mockResolvedValue([
      { id: 'expense-1', paidBy: 'user-1', amount: 40, groupId: undefined, date: 2 },
    ]);
    mocks.getSplitsForExpenses.mockResolvedValue([
      { id: 'split-1', expenseId: 'expense-1', userId: 'user-1', amount: 20 },
      { id: 'split-2', expenseId: 'expense-1', userId: 'friend-1', amount: 20 },
    ]);

    const recent = await getFriendRecentExpenses('user-1', 'friend-1');

    expect(mocks.getUserExpenses).toHaveBeenCalledTimes(1);
    expect(mocks.getSplitsForExpenses).toHaveBeenCalledTimes(1);
    expect(recent).toHaveLength(1);
  });
});
