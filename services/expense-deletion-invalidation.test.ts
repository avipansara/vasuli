import { describe, expect, it } from 'vitest';
import { getExpenseDeletionInvalidationKeys } from '@/services/expense-deletion-invalidation';

describe('expense deletion cache invalidation', () => {
  it('invalidates all direct-expense surfaces and each affected Friend detail once', () => {
    expect(getExpenseDeletionInvalidationKeys('current-user', {
      expenseId: 'expense-1',
      paidBy: 'friend-3',
      participantIds: ['friend-1', 'friend-1', 'current-user', 'friend-2', 'friend-3'],
    })).toEqual([
      ['expenses', 'detail', 'expense-1'],
      ['expenses', 'list', 'current-user'],
      ['expenses', 'detail'],
      ['activity', 'list', 'current-user'],
      ['friends', 'home', 'current-user'],
      ['friends', 'detail', 'current-user', 'friend-1'],
      ['friends', 'detail', 'current-user', 'friend-2'],
      ['friends', 'detail', 'current-user', 'friend-3'],
      ['friends', 'detail', 'current-user'],
    ]);
  });

  it('invalidates group and cached Friend detail surfaces without duplicate keys', () => {
    expect(getExpenseDeletionInvalidationKeys('current-user', {
      expenseId: 'expense-1',
      groupId: 'group-1',
      participantIds: ['friend-1', 'friend-1', 'friend-2'],
    })).toEqual([
      ['expenses', 'detail', 'expense-1'],
      ['expenses', 'list', 'current-user'],
      ['expenses', 'detail'],
      ['activity', 'list', 'current-user'],
      ['friends', 'home', 'current-user'],
      ['friends', 'detail', 'current-user'],
      ['groups', 'detail', 'current-user', 'group-1'],
      ['groups', 'pair-totals', 'current-user', 'group-1'],
      ['groups', 'list', 'current-user'],
      ['groups', 'detail', 'current-user'],
      ['groups', 'pair-totals', 'current-user'],
    ]);
  });

  it('refreshes the recurrence history when deleting a posted occurrence', () => {
    expect(getExpenseDeletionInvalidationKeys('current-user', {
      expenseId: 'expense-1',
      recurringRuleId: 'rule-1',
    })).toContainEqual(['recurring-expenses', 'detail', 'current-user', 'rule-1']);
    expect(getExpenseDeletionInvalidationKeys('current-user', {
      expenseId: 'expense-1',
      recurringRuleId: 'rule-1',
    })).toContainEqual(['recurring-expenses', 'occurrences', 'current-user', 'rule-1']);
  });
});
