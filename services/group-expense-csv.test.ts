import { describe, expect, it } from 'vitest';
import type { GroupDetailData } from './group-detail-service';
import { createGroupExpenseCsv } from './group-expense-csv';

function detail(overrides: Partial<GroupDetailData> = {}): GroupDetailData {
  return {
    group: { id: 'group-1', name: 'Trip / Miami', createdAt: 0, updatedAt: 0 },
    expenses: [],
    members: [
      { id: 'member-a', groupId: 'group-1', userId: 'user-a', role: 'admin', joinedAt: 0, user: { id: 'user-a', name: 'Alex', isActive: true, createdAt: 0 } },
      { id: 'member-b', groupId: 'group-1', userId: 'user-b', role: 'member', joinedAt: 0, user: { id: 'user-b', name: 'Blair', isActive: true, createdAt: 0 } },
    ],
    balances: new Map(),
    availableUsers: [],
    friendshipStatus: new Map(),
    splits: [],
    settlements: [],
    ...overrides,
  };
}

describe('createGroupExpenseCsv', () => {
  it('creates a spreadsheet-friendly flat expense ledger', () => {
    const result = createGroupExpenseCsv(detail({
      expenses: [{
        id: 'expense-1',
        groupId: 'group-1',
        description: 'Dinner, "best" night',
        amount: 60,
        currency: 'USD',
        paidBy: 'user-a',
        category: 'Food',
        notes: 'Split\nthree ways',
        date: Date.UTC(2026, 7, 15),
        createdAt: Date.UTC(2026, 7, 15),
        updatedAt: Date.UTC(2026, 7, 16),
      }],
      splits: [
        { id: 'split-a', expenseId: 'expense-1', userId: 'user-a', amount: 30, splitType: 'equal' },
        { id: 'split-b', expenseId: 'expense-1', userId: 'user-b', amount: 30, splitType: 'equal' },
      ],
    }), new Date(Date.UTC(2026, 7, 15)));

    expect(result.fileName).toBe('Trip - Miami-expenses-2026-08-15.csv');
    expect(result.content).toContain('\uFEFFExpense ID,Date,Description,Amount,Currency');
    expect(result.content).toContain('expense-1,2026-08-15,"Dinner, ""best"" night",60.00,USD,Alex,Food,"Split\nthree ways",2026-08-15,2026-08-16,Alex: 30.00 USD; Blair: 30.00 USD');
  });

  it('handles missing optional data and unresolved users', () => {
    const result = createGroupExpenseCsv(detail({
      expenses: [{
        id: 'expense-2',
        description: 'Taxi',
        amount: 12.5,
        currency: 'EUR',
        paidBy: 'user-missing',
        date: Date.UTC(2026, 0, 2),
        createdAt: Date.UTC(2026, 0, 2),
        updatedAt: Date.UTC(2026, 0, 2),
      }],
      splits: [{ id: 'split-c', expenseId: 'expense-2', userId: 'user-missing', amount: 12.5, splitType: 'exact' }],
    }));

    expect(result.content).toContain('expense-2,2026-01-02,Taxi,12.50,EUR,Unknown,,,2026-01-02,2026-01-02,Unknown: 12.50 EUR');
  });
});
