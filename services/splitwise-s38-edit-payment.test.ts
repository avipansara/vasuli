import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  expenses: [] as Record<string, unknown>[],
  splits: [] as Record<string, unknown>[],
  settlements: [{
    id: 'settlement-1',
    groupId: undefined,
    fromUserId: 'bob',
    toUserId: 'alice',
    amount: 30,
    currency: 'USD',
    date: 0,
    createdAt: 0,
  }],
}));

function matches(row: Record<string, unknown>, filters: Array<[string, string, unknown]>): boolean {
  return filters.every(([operator, column, value]) => {
    if (operator === 'eq') return row[column] === value;
    if (operator === 'in') return (value as string[]).includes(row[column] as string);
    if (operator === 'is') return row[column] === value;
    return false;
  });
}

function readQuery(table: 'expenses' | 'expense_splits', filters: Array<[string, string, unknown]>) {
  const rows = () => (table === 'expenses' ? state.expenses : state.splits)
    .filter(row => matches(row, filters));
  const query = {
    eq(column: string, value: unknown) {
      filters.push(['eq', column, value]);
      return query;
    },
    in(column: string, value: string[]) {
      filters.push(['in', column, value]);
      return query;
    },
    is(column: string, value: unknown) {
      filters.push(['is', column, value]);
      return query;
    },
    order() {
      return query;
    },
    then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
      return Promise.resolve(resolve({ data: rows(), error: null }));
    },
  };
  return query;
}

const supabase = vi.hoisted(() => ({
  auth: { getSession: vi.fn() },
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase }));
vi.mock('@/services/auth-profile-service', () => ({
  linkAuthUserToProfile: vi.fn().mockResolvedValue({ id: 'alice' }),
}));
vi.mock('@/services/settlement-service', () => ({
  settlementService: {
    getUserSettlements: vi.fn(async () => state.settlements),
  },
}));
vi.mock('@/services/group-service', () => ({ groupService: { getUserGroups: vi.fn(async () => []) } }));
vi.mock('@/services/scope-transfer-service', () => ({
  scopeTransferService: { getByGroup: vi.fn(async () => []) },
}));
vi.mock('@/services/settlement-cancellation-service', () => ({
  settlementCancellationService: { getByGroup: vi.fn(async () => []) },
}));
vi.mock('@/services/settlement-operation-metadata-service', () => ({
  settlementOperationMetadataService: { getByGroup: vi.fn(async () => []) },
}));

import { expenseService } from './expense-service';
import { calculateFriendBalance } from './balance-utils';

function expenseRow(id: string, amount: number) {
  return {
    id,
    group_id: null,
    description: 'Dinner',
    amount,
    currency: 'USD',
    paid_by: 'alice',
    created_by: 'alice',
    category: null,
    date: '2026-01-01T00:00:00.000Z',
    image_url: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
  };
}

function splitRow(id: string, expenseId: string, userId: string, amount: number) {
  return { id, expense_id: expenseId, user_id: userId, amount, split_type: 'equal', percentage: null };
}

describe('Splitwise S38: edit an expense after a payment', () => {
  beforeEach(() => {
    state.expenses = [];
    state.splits = [];
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-alice', email: 'alice@example.com', user_metadata: {} } } },
    });
    supabase.from.mockImplementation((table: 'expenses' | 'expense_splits') => {
      if (table === 'expenses') {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const row = expenseRow('expense-1', payload.amount as number);
                Object.assign(row, payload);
                state.expenses.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_column: string, id: string) => ({
              is: async () => {
                const row = state.expenses.find(expense => expense.id === id);
                Object.assign(row ?? {}, payload);
                return { error: null };
              },
            }),
          }),
          select: () => readQuery('expenses', []),
        };
      }

      return {
        insert: async (payload: Record<string, unknown>[]) => {
          state.splits.push(...payload.map((split, index) => ({
            id: `split-${state.splits.length + index + 1}`,
            ...split,
          })));
          return { error: null };
        },
        delete: () => ({
          eq: async (_column: string, expenseId: string) => {
            state.splits = state.splits.filter(split => split.expense_id !== expenseId);
            return { error: null };
          },
        }),
        select: () => readQuery('expense_splits', []),
      };
    });
  });

  it('recalculates the remaining direct balance after the paid expense is edited', async () => {
    await expenseService.create({
      description: 'Dinner',
      amount: 120,
      currency: 'USD',
      paidBy: 'alice',
      createdBy: 'alice',
      date: Date.parse('2026-01-01T00:00:00.000Z'),
    }, [
      { userId: 'alice', amount: 60, splitType: 'equal' },
      { userId: 'bob', amount: 60, splitType: 'equal' },
    ]);

    expect(await calculateFriendBalance('alice', 'bob')).toBe(30);

    await expenseService.update('expense-1', { amount: 80 }, [
      { userId: 'alice', amount: 40, splitType: 'equal' },
      { userId: 'bob', amount: 40, splitType: 'equal' },
    ]);

    expect(await calculateFriendBalance('alice', 'bob')).toBe(10);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0]?.amount).toBe(80);
    expect(state.splits.map(split => [split.user_id, split.amount])).toEqual([
      ['alice', 40],
      ['bob', 40],
    ]);
  });
});
