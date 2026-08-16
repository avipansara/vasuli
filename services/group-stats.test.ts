import { describe, expect, it } from 'vitest';
import type { GroupDetailReadModel } from './group-detail-read-model';
import { calculateGroupStats } from './group-stats';

function detail(overrides: Partial<GroupDetailReadModel> = {}): GroupDetailReadModel {
  return {
    group: { id: 'group-1', name: 'Trip', createdAt: 0, updatedAt: 0 },
    expenses: [],
    members: [
      { id: 'member-a', groupId: 'group-1', userId: 'user-a', role: 'admin', joinedAt: 0, user: { id: 'user-a', name: 'Alex', isActive: true, createdAt: 0 } },
      { id: 'member-b', groupId: 'group-1', userId: 'user-b', role: 'member', joinedAt: 0, user: { id: 'user-b', name: 'Blair', isActive: true, createdAt: 0 } },
    ],
    balances: new Map([['user-a', 30], ['user-b', -30]]),
    availableUsers: [],
    friendshipStatus: new Map(),
    settlements: [],
    ...overrides,
  };
}

describe('calculateGroupStats', () => {
  it('summarizes spending, payers, balances, and settlement progress', () => {
    const stats = calculateGroupStats(detail({
      expenses: [
        { id: 'expense-1', groupId: 'group-1', description: 'Dinner', amount: 60, currency: 'USD', paidBy: 'user-a', date: 0, createdAt: 0, updatedAt: 0, splits: [] },
        { id: 'expense-2', groupId: 'group-1', description: 'Coffee', amount: 20, currency: 'USD', paidBy: 'user-b', date: 0, createdAt: 0, updatedAt: 0, splits: [] },
      ],
    }));

    expect(stats.totalSpent).toBe(80);
    expect(stats.expenseCount).toBe(2);
    expect(stats.totalOutstanding).toBe(30);
    expect(stats.settledMemberCount).toBe(0);
    expect(stats.unsettledMemberCount).toBe(2);
    expect(stats.payerTotals).toEqual([
      { userId: 'user-a', name: 'Alex', total: 60 },
      { userId: 'user-b', name: 'Blair', total: 20 },
    ]);
    expect(stats.memberBalances[0]).toMatchObject({ userId: 'user-a', balance: 30 });
  });

  it('includes group-only members in the balance summary', () => {
    const stats = calculateGroupStats(detail({
      members: [
        ...detail().members,
        { id: 'member-c', groupId: 'group-1', userId: 'user-c', role: 'member', joinedAt: 0, user: { id: 'user-c', name: 'Casey', isActive: true, createdAt: 0 } },
      ],
      balances: new Map([['user-a', 10], ['user-b', 0], ['user-c', -10]]),
    }));

    expect(stats.memberBalances).toEqual([
      { userId: 'user-a', name: 'Alex', balance: 10 },
      { userId: 'user-c', name: 'Casey', balance: -10 },
      { userId: 'user-b', name: 'Blair', balance: 0 },
    ]);
  });
});
