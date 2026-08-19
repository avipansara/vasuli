import { describe, expect, it } from 'vitest';
import { calculateExpenseSplits, getEvenSplitValues, getSplitProgress } from './split-validation';

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

  it('makes one-tap percentages total exactly 100 for three-person groups', () => {
    const values = getEvenSplitValues(['you', 'friend', 'other'], 'percentage');

    expect(values).toEqual({ you: '33.34', friend: '33.33', other: '33.33' });
    expect(getSplitProgress(['you', 'friend', 'other'], 100, 'percentage', values).isBalanced).toBe(true);
  });

  it('calculates unequal splits with the same values used by validation', () => {
    expect(calculateExpenseSplits(
      ['you', 'friend'],
      30,
      'unequal',
      { you: '10', friend: '20' },
    )).toEqual({
      splits: [
        { userId: 'you', amount: 10, splitType: 'exact' },
        { userId: 'friend', amount: 20, splitType: 'exact' },
      ],
    });
  });

  it('rejects unequal splits that do not add up to the expense total', () => {
    const result = calculateExpenseSplits(['you', 'friend'], 30, 'unequal', { you: '10', friend: '12' });
    expect(result.splits).toBeNull();
    expect(result.error).toContain('Amounts must add up to $30.00');
  });

  it('calculates shares proportionally and omits zero-share participants', () => {
    expect(calculateExpenseSplits(
      ['you', 'friend', 'other'],
      60,
      'shares',
      { you: '1', friend: '2', other: '0' },
    )).toEqual({
      splits: [
        { userId: 'you', amount: 20, splitType: 'exact' },
        { userId: 'friend', amount: 40, splitType: 'exact' },
      ],
    });
  });

  it.each([
    ['equal', {}],
    ['percentage', { you: '33.34', friend: '33.33', other: '33.33' }],
    ['shares', { you: '1', friend: '1', other: '1' }],
  ] as const)('allocates %s splits to exact cents', (method, values) => {
    const result = calculateExpenseSplits(['you', 'friend', 'other'], 10, method, values);

    expect(result.splits?.map(split => split.amount)).toEqual([3.34, 3.33, 3.33]);
    expect(result.splits?.reduce((sum, split) => sum + split.amount, 0)).toBe(10);
  });

  it('keeps the entered percentage on percentage split rows', () => {
    const result = calculateExpenseSplits(
      ['you', 'friend'],
      80,
      'percentage',
      { you: '25', friend: '75' },
    );

    expect(result.splits).toEqual([
      { userId: 'you', amount: 20, splitType: 'percentage', percentage: 25 },
      { userId: 'friend', amount: 60, splitType: 'percentage', percentage: 75 },
    ]);
  });

  it('validates unequal splits using the cents that will be stored', () => {
    const result = calculateExpenseSplits(
      ['you', 'friend'],
      30,
      'unequal',
      { you: '10.005', friend: '19.995' },
    );

    expect(result.splits).toBeNull();
    expect(result.error).toContain('Current total: $30.01');
  });

  it('rejects negative values consistently for progress and save', () => {
    const values = { you: '-1', friend: '2' };
    expect(getSplitProgress(['you', 'friend'], 30, 'shares', values).isBalanced).toBe(false);
    expect(calculateExpenseSplits(['you', 'friend'], 30, 'shares', values)).toEqual({
      splits: null,
      error: 'Split values must be zero or greater',
    });
  });

  it('rejects shares when no participant has a positive share', () => {
    expect(calculateExpenseSplits(['you', 'friend'], 30, 'shares', { you: '0', friend: '0' })).toEqual({
      splits: null,
      error: 'Please enter at least one share',
    });
  });
});
