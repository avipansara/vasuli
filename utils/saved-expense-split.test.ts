import { describe, expect, it } from 'vitest';
import type { ExpenseSplit } from '@/types/database';
import { getSavedExpenseSplit } from './saved-expense-split';
import { resolveExpenseSplits } from './split-validation';

const split = (userId: string, amount: number, splitType: ExpenseSplit['splitType'], percentage?: number): ExpenseSplit =>
  ({ id: userId, expenseId: 'expense', userId, amount, splitType, percentage });

describe('opening a saved expense split for editing', () => {
  it('keeps the original participants when the total of an equal split changes', () => {
    const draft = getSavedExpenseSplit(['you', 'maya', 'leo'].map(id => split(id, 24, 'equal')));
    const result = resolveExpenseSplits(draft.participantIds, 84, draft.method, {});
    expect(result.splits?.map(({ userId, amount }) => [userId, amount]))
      .toEqual([['you', 28], ['maya', 28], ['leo', 28]]);
  });

  it('recalculates percentages from the saved rule, including zero percent', () => {
    const draft = getSavedExpenseSplit([split('you', 0, 'percentage'), split('maya', 24, 'percentage', 100)]);
    const result = resolveExpenseSplits(draft.participantIds, 30, draft.method, { percentages: draft.values });
    expect(result.splits?.map(({ amount }) => amount)).toEqual([0, 30]);
  });

  it('requires reallocating exact amounts when the total changes', () => {
    const draft = getSavedExpenseSplit([split('you', 14.5, 'exact'), split('maya', 5.5, 'exact')]);
    expect(resolveExpenseSplits(draft.participantIds, 21, draft.method, { amounts: draft.values }).splits).toBeNull();
    expect(resolveExpenseSplits(draft.participantIds, 20, draft.method, { amounts: draft.values }).splits)
      .toEqual([{ userId: 'you', amount: 14.5, splitType: 'exact' }, { userId: 'maya', amount: 5.5, splitType: 'exact' }]);
  });
});
