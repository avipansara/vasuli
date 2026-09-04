import { describe, expect, it } from 'vitest';
import { computeBilateralLines, linesOwedBy, linesOwedTo } from './group-bilateral-matrix';

describe('computeBilateralLines', () => {
  it('nets two-way expenses between a pair', () => {
    const lines = computeBilateralLines({
      memberUserIds: ['a', 'b'],
      expenses: [
        { id: 'e1', paidBy: 'a', currency: 'USD', splits: [{ expenseId: 'e1', userId: 'a', amount: 70 }, { expenseId: 'e1', userId: 'b', amount: 30 }] },
        { id: 'e2', paidBy: 'b', currency: 'USD', splits: [{ expenseId: 'e2', userId: 'a', amount: 50 }, { expenseId: 'e2', userId: 'b', amount: 150 }] },
      ],
      settlements: [],
    });

    // A perspective: +30 (b's share of a-paid) - 50 (a's share of b-paid) = -20 -> a owes b.
    expect(lines).toEqual([{ fromUserId: 'a', toUserId: 'b', amount: 20, currency: 'USD' }]);
  });

  it('creates no line between the pair for third-party-paid expenses', () => {
    const lines = computeBilateralLines({
      memberUserIds: ['a', 'b', 'c'],
      expenses: [
        { id: 'e1', paidBy: 'c', currency: 'USD', splits: [{ expenseId: 'e1', userId: 'a', amount: 40 }, { expenseId: 'e1', userId: 'b', amount: 60 }] },
      ],
      settlements: [],
    });

    expect(lines.filter(line =>
      (line.fromUserId === 'a' && line.toUserId === 'b') ||
      (line.fromUserId === 'b' && line.toUserId === 'a'),
    )).toEqual([]);
    // ...but both owe the payer.
    expect(lines).toContainEqual({ fromUserId: 'a', toUserId: 'c', amount: 40, currency: 'USD' });
    expect(lines).toContainEqual({ fromUserId: 'b', toUserId: 'c', amount: 60, currency: 'USD' });
  });

  it('applies pair settlements and skips third-party ones', () => {
    const lines = computeBilateralLines({
      memberUserIds: ['a', 'b', 'c'],
      expenses: [
        { id: 'e1', paidBy: 'b', currency: 'USD', splits: [{ expenseId: 'e1', userId: 'a', amount: 100 }] },
      ],
      settlements: [
        { fromUserId: 'a', toUserId: 'b', amount: 40, currency: 'USD' },
        { fromUserId: 'b', toUserId: 'c', amount: 999, currency: 'USD' },
      ],
    });

    // A perspective: -100 (expense) + 40 (a paid b) = -60 -> a owes b 60.
    // The b->c settlement is a separate pair line, untouched by a<->b.
    expect(lines).toContainEqual({ fromUserId: 'a', toUserId: 'b', amount: 60, currency: 'USD' });
    expect(lines).toContainEqual({ fromUserId: 'c', toUserId: 'b', amount: 999, currency: 'USD' });
  });

  it('applies pair transfers and skips reversals', () => {
    const lines = computeBilateralLines({
      memberUserIds: ['a', 'b'],
      expenses: [
        { id: 'e1', paidBy: 'b', currency: 'USD', splits: [{ expenseId: 'e1', userId: 'a', amount: 100 }] },
      ],
      settlements: [],
      scopeTransfers: [
        { fromUserId: 'a', toUserId: 'b', currency: 'USD', signedGroupBalanceDelta: 25, isReversal: false },
        { fromUserId: 'a', toUserId: 'b', currency: 'USD', signedGroupBalanceDelta: 1000, isReversal: true },
      ],
    });

    // A perspective: -100 + 25 = -75 -> a owes b 75.
    expect(lines).toEqual([{ fromUserId: 'a', toUserId: 'b', amount: 75, currency: 'USD' }]);
  });

  it('keeps currencies separate', () => {
    const lines = computeBilateralLines({
      memberUserIds: ['a', 'b'],
      expenses: [
        { id: 'e1', paidBy: 'b', currency: 'USD', splits: [{ expenseId: 'e1', userId: 'a', amount: 10 }] },
        { id: 'e2', paidBy: 'a', currency: 'EUR', splits: [{ expenseId: 'e2', userId: 'b', amount: 5 }] },
      ],
      settlements: [],
    });

    expect(lines).toEqual([
      { fromUserId: 'a', toUserId: 'b', amount: 10, currency: 'USD' },
      { fromUserId: 'b', toUserId: 'a', amount: 5, currency: 'EUR' },
    ]);
  });

  it('filters lines by member', () => {
    const lines = [
      { fromUserId: 'a', toUserId: 'b', amount: 10, currency: 'USD' },
      { fromUserId: 'c', toUserId: 'a', amount: 4, currency: 'USD' },
    ];
    expect(linesOwedBy(lines, 'a')).toEqual([lines[0]]);
    expect(linesOwedTo(lines, 'a')).toEqual([lines[1]]);
  });
});
