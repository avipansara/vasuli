import { describe, expect, it } from 'vitest';
import type { Expense, ExpenseSplit, Settlement } from '@/types/database';
import { calculateGroupBalances } from '@/services/group-balance';

const alice = 'alice';
const bob = 'bob';

const expense: Expense = {
  id: 'expense-s39',
  description: 'Dinner',
  amount: 50,
  currency: 'USD',
  paidBy: alice,
  date: 1,
  createdAt: 1,
  updatedAt: 1,
};

const equalSplits: ExpenseSplit[] = [
  { id: 'split-s39-alice', expenseId: expense.id, userId: alice, amount: 25, splitType: 'equal' },
  { id: 'split-s39-bob', expenseId: expense.id, userId: bob, amount: 25, splitType: 'equal' },
];

const bobPaysAlice: Settlement = {
  id: 'settlement-s39',
  fromUserId: bob,
  toUserId: alice,
  amount: 25,
  currency: 'USD',
  date: 2,
  createdAt: 2,
};

describe('Splitwise S39: deleting an expense after payment', () => {
  it('keeps the payment in the read model after the expense is deleted', () => {
    const settledBalances = calculateGroupBalances([expense], equalSplits, [bobPaysAlice]);
    expect(settledBalances.get(alice)).toBe(0);
    expect(settledBalances.get(bob)).toBe(0);

    // A soft-deleted expense is excluded from the production read-model
    // inputs, while the historical payment remains an active settlement.
    const balancesAfterExpenseDeletion = calculateGroupBalances([], equalSplits, [bobPaysAlice]);

    expect(balancesAfterExpenseDeletion.get(alice)).toBe(-25);
    expect(balancesAfterExpenseDeletion.get(bob)).toBe(25);
  });
});
