import { describe, expect, it } from 'vitest';
import { buildFriendSummaries, calculateFriendSummaryTotals } from '@/services/friend-summary-service';
import type { Expense, ExpenseSplit, Settlement, User } from '@/types/database';

const currentUserId = 'user-current';

const friend = (id: string, name: string): User => ({
  id,
  name,
  isActive: true,
  createdAt: 1,
});

const expense = (
  id: string,
  paidBy: string,
  amount: number,
  date: number,
  groupId?: string
): Expense => ({
  id,
  paidBy,
  amount,
  date,
  groupId,
  description: id,
  currency: 'USD',
  createdAt: date,
  updatedAt: date,
});

const split = (id: string, expenseId: string, userId: string, amount: number): ExpenseSplit => ({
  id,
  expenseId,
  userId,
  amount,
  splitType: 'equal',
});

const settlement = (id: string, fromUserId: string, toUserId: string, amount: number): Settlement => ({
  id,
  fromUserId,
  toUserId,
  amount,
  currency: 'USD',
  date: 1,
  createdAt: 1,
});

describe('buildFriendSummaries', () => {
  it('computes all friend balances and recent expenses from one batched data set', () => {
    const friends = [friend('friend-a', 'Asha'), friend('friend-b', 'Ben')];
    const expenses = [
      expense('new-current-paid', currentUserId, 60, 3),
      expense('old-current-paid', currentUserId, 40, 2),
      expense('friend-paid', 'friend-b', 30, 1),
      expense('group-third-party-paid', 'group-member', 90, 4, 'group-1'),
    ];
    const splits = [
      split('s1', 'new-current-paid', currentUserId, 30),
      split('s2', 'new-current-paid', 'friend-a', 30),
      split('s3', 'old-current-paid', currentUserId, 20),
      split('s4', 'old-current-paid', 'friend-a', 20),
      split('s5', 'friend-paid', currentUserId, 15),
      split('s6', 'friend-paid', 'friend-b', 15),
      split('s7', 'group-third-party-paid', currentUserId, 30),
      split('s8', 'group-third-party-paid', 'friend-a', 30),
      split('s9', 'group-third-party-paid', 'group-member', 30),
    ];
    const settlements = [
      settlement('settle-a', 'friend-a', currentUserId, 10),
      settlement('settle-b', currentUserId, 'friend-b', 5),
    ];

    const summaries = buildFriendSummaries(currentUserId, friends, expenses, splits, settlements);

    expect(summaries).toMatchObject([
      {
        id: 'friend-a',
        balance: 40,
        recentExpenses: [
          { id: 'new-current-paid', amount: 30 },
          { id: 'old-current-paid', amount: 20 },
        ],
      },
      {
        id: 'friend-b',
        balance: -10,
        recentExpenses: [{ id: 'friend-paid', amount: 15 }],
      },
    ]);
  });

  it('omits recent expenses when a friend is settled', () => {
    const summaries = buildFriendSummaries(
      currentUserId,
      [friend('friend-a', 'Asha')],
      [expense('current-paid', currentUserId, 20, 1)],
      [
        split('s1', 'current-paid', currentUserId, 10),
        split('s2', 'current-paid', 'friend-a', 10),
      ],
      [settlement('settle-a', 'friend-a', currentUserId, 10)]
    );

    expect(summaries[0].balance).toBe(0);
    expect(summaries[0].recentExpenses).toEqual([]);
  });

  it('normalizes sub-cent residual balances as settled', () => {
    const summaries = buildFriendSummaries(
      currentUserId,
      [friend('friend-a', 'Asha')],
      [expense('current-paid', currentUserId, 20, 1)],
      [
        split('s1', 'current-paid', currentUserId, 10),
        split('s2', 'current-paid', 'friend-a', 10),
      ],
      [settlement('settle-a', 'friend-a', currentUserId, 9.996)]
    );

    expect(summaries[0].balance).toBe(0);
    expect(summaries[0].recentExpenses).toEqual([]);
  });
});

describe('calculateFriendSummaryTotals', () => {
  it('splits cached friend balances into owed and owing totals', () => {
    expect(calculateFriendSummaryTotals([
      { balance: 42.5 },
      { balance: -12.25 },
      { balance: 0 },
      { balance: 0.005 },
      { balance: -0.005 },
    ])).toEqual({
      totalOwed: 42.5,
      totalOwing: 12.25,
    });
  });
});
