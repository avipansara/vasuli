import { describe, expect, it } from 'vitest';
import { getEvenSplitValues, getSplitProgress } from './split-validation';

describe('split validation', () => {
  it('shows live exact amounts and the remaining balance', () => {
    const progress = getSplitProgress(['you', 'friend'], 30, 'unequal', { you: '10', friend: '12' });
    expect(progress.allocated).toBe(22);
    expect(progress.remaining).toBe(8);
    expect(progress.isBalanced).toBe(false);
    expect(progress.people[1].amount).toBe(12);
  });

  it('calculates percentage amounts from the live total', () => {
    const progress = getSplitProgress(['you', 'friend'], 80, 'percentage', { you: '25', friend: '75' });
    expect(progress.isBalanced).toBe(true);
    expect(progress.people.map(person => person.amount)).toEqual([20, 60]);
  });

  it('provides one-tap even values for every editable method', () => {
    expect(getEvenSplitValues(['you', 'friend'], 'unequal', 30)).toEqual({ you: '15.00', friend: '15.00' });
    expect(getEvenSplitValues(['you', 'friend'], 'percentage')).toEqual({ you: '50.00', friend: '50.00' });
    expect(getEvenSplitValues(['you', 'friend'], 'shares')).toEqual({ you: '1', friend: '1' });
  });
});
