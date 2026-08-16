import { describe, expect, it } from 'vitest';
import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, User } from '@/types/database';
import {
  addExpenseToGroupReadModel,
  applySettlementToGroupReadModel,
  buildGroupDetailReadModel,
  removeExpenseFromHomeFriends,
  removeExpenseFromGroupReadModel,
} from './group-detail-read-model';

const group: Group = { id: 'group-1', name: 'Trip', createdAt: 1, updatedAt: 1 };
const alex: User = { id: 'user-a', name: 'Alex', isActive: true, createdAt: 1 };
const blair: User = { id: 'user-b', name: 'Blair', isActive: true, createdAt: 1 };
const members: GroupMember[] = [
  { id: 'member-a', groupId: group.id, userId: alex.id, role: 'admin', joinedAt: 1 },
  { id: 'member-b', groupId: group.id, userId: blair.id, role: 'member', joinedAt: 1 },
];

function expense(id = 'expense-1', amount = 30): Expense {
  return {
    id,
    groupId: group.id,
    description: 'Dinner',
    amount,
    currency: 'USD',
    paidBy: alex.id,
    date: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function split(id: string, expenseId: string, userId: string, amount: number): ExpenseSplit {
  return { id, expenseId, userId, amount, splitType: 'equal' };
}

function settlement(id: string): Settlement {
  return {
    id,
    groupId: group.id,
    fromUserId: blair.id,
    toUserId: alex.id,
    amount: 15,
    currency: 'USD',
    date: 1,
    createdAt: 1,
  };
}

function readModel() {
  return buildGroupDetailReadModel({
    currentUserId: alex.id,
    group,
    expenses: [expense()],
    members,
    users: [alex, blair],
    userFriends: [],
    friendships: [],
    splits: [split('split-a', 'expense-1', alex.id, 15), split('split-b', 'expense-1', blair.id, 15)],
    settlements: [],
  });
}

describe('group detail read model', () => {
  it('materializes each expense with its payer and resolved splits', () => {
    const model = readModel();

    expect(model.expenses[0].paidByUser?.name).toBe('Alex');
    expect(model.expenses[0].splits).toMatchObject([
      { userId: alex.id, user: { name: 'Alex' } },
      { userId: blair.id, user: { name: 'Blair' } },
    ]);
    expect(model.balances.get(alex.id)).toBe(15);
    expect(model.balances.get(blair.id)).toBe(-15);
  });

  it('adds an expense and recalculates balances without caller-side joins', () => {
    const model = readModel();
    const next = addExpenseToGroupReadModel(model, expense('expense-2', 20), [
      split('split-c', 'expense-2', alex.id, 10),
      split('split-d', 'expense-2', blair.id, 10),
    ]);

    expect(next.expenses.map(item => item.id)).toEqual(['expense-2', 'expense-1']);
    expect(next.expenses[0].splits[1].user?.name).toBe('Blair');
    expect(next.balances.get(alex.id)).toBe(25);
    expect(next.balances.get(blair.id)).toBe(-25);
  });

  it('applies a settlement and recalculates only through the read-model interface', () => {
    const next = applySettlementToGroupReadModel(readModel(), settlement('settlement-1'));

    expect(next.settlements).toHaveLength(1);
    expect(next.balances.get(alex.id) || 0).toBe(0);
    expect(next.balances.get(blair.id) || 0).toBe(0);
  });

  it('removes an expense and recalculates balances from the remaining nested splits', () => {
    const next = removeExpenseFromGroupReadModel(readModel(), 'expense-1');

    expect(next.expenses).toEqual([]);
    expect(next.balances.get(alex.id)).toBe(0);
    expect(next.balances.get(blair.id)).toBe(0);
  });

  it('includes zero balances for members with no ledger activity', () => {
    const model = readModel();
    const empty = { ...model, expenses: [], balances: new Map<string, number>() };
    const next = removeExpenseFromGroupReadModel(empty, 'missing');

    expect(next.balances.get(alex.id)).toBe(0);
    expect(next.balances.get(blair.id)).toBe(0);
  });

  it('projects deleting an expense out of the home friend summary', () => {
    const next = removeExpenseFromHomeFriends(
      [{ ...blair, balance: 15, recentExpenses: [expense()] }],
      expense(),
      [split('split-a', 'expense-1', alex.id, 15), split('split-b', 'expense-1', blair.id, 15)],
      alex.id,
    );

    expect(next).toEqual([{ ...blair, balance: 0, recentExpenses: [] }]);
  });
});
