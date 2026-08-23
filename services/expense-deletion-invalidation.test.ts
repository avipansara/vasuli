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
      ['activity', 'list', 'current-user', ''],
      ['friends', 'home', 'current-user'],
      ['friends', 'detail', 'current-user', 'friend-1'],
      ['friends', 'detail', 'current-user', 'friend-2'],
      ['friends', 'detail', 'current-user', 'friend-3'],
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
      ['activity', 'list', 'current-user', ''],
      ['friends', 'home', 'current-user'],
      ['friends', 'detail', 'current-user'],
      ['groups', 'detail', 'current-user', 'group-1'],
      ['groups', 'list', 'current-user'],
    ]);
  });
});
