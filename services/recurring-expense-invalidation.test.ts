import { describe, expect, it, vi } from 'vitest';
import { getPostedOccurrenceInvalidationKeys, getRecurringRuleInvalidationKeys, invalidatePostedOccurrenceImpacts } from '@/services/recurring-expense-invalidation';

describe('recurring expense cache boundary', () => {
  it('refreshes every cached projection changed by a worker-posted occurrence', async () => {
    const expectedKeys = getPostedOccurrenceInvalidationKeys('user-1');
    expect(expectedKeys).toEqual(expect.arrayContaining([
      ['friends', 'home', 'user-1'],
      ['friends', 'detail', 'user-1'],
      ['groups', 'list', 'user-1'],
      ['groups', 'detail', 'user-1'],
      ['groups', 'pair-totals', 'user-1'],
      ['expenses', 'list', 'user-1'],
      ['expenses', 'detail'],
      ['activity', 'list', 'user-1'],
      ['recurring-expenses', 'occurrences', 'user-1'],
    ]));
    const invalidateQueries = vi.fn(async () => undefined);
    await invalidatePostedOccurrenceImpacts({ invalidateQueries }, 'user-1');
    expect(invalidateQueries).toHaveBeenCalledTimes(expectedKeys.length);
  });

  it('invalidates the recurring list after a command and its detail when an ID is known', () => {
    expect(getRecurringRuleInvalidationKeys('user-1', 'rule-1')).toEqual([
      ['recurring-expenses', 'list', 'user-1'],
      ['recurring-expenses', 'detail', 'user-1'],
      ['recurring-expenses', 'detail', 'user-1', 'rule-1'],
      ['recurring-expenses', 'occurrences', 'user-1'],
    ]);
  });

  it('invalidates cached rule details when realtime does not identify the changed rule', () => {
    expect(getRecurringRuleInvalidationKeys('user-1')).toContainEqual(['recurring-expenses', 'detail', 'user-1']);
  });

  it('keeps the same rule ID in separate user detail caches', () => {
    expect(getRecurringRuleInvalidationKeys('user-1', 'rule-1')).toContainEqual([
      'recurring-expenses', 'detail', 'user-1', 'rule-1',
    ]);
    expect(getRecurringRuleInvalidationKeys('user-2', 'rule-1')).toContainEqual([
      'recurring-expenses', 'detail', 'user-2', 'rule-1',
    ]);
  });
});
