import { describe, expect, it } from 'vitest';
import { buildFriendDetailData, calculatePairBalance } from '@/services/friend-detail-service';
import type { Expense, ExpenseSplit, Settlement, User } from '@/types/database';

const currentUserId = 'current-user';
const friendId = 'friend-a';

const friend: User = {
  id: friendId,
  name: 'Asha',
  isActive: true,
  createdAt: 1,
};

const expense = (id: string, paidBy: string, amount: number, date: number): Expense => ({
  id,
  paidBy,
  amount,
  date,
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

describe('friend detail builders', () => {
  it('computes balance and shared expenses from batched data', () => {
    const expenses = [
      expense('current-paid', currentUserId, 80, 2),
      expense('friend-paid', friendId, 30, 1),
      expense('unrelated', 'someone-else', 30, 3),
    ];
    const splits = [
      split('s1', 'current-paid', currentUserId, 40),
      split('s2', 'current-paid', friendId, 40),
      split('s3', 'friend-paid', currentUserId, 15),
      split('s4', 'friend-paid', friendId, 15),
      split('s5', 'unrelated', currentUserId, 10),
      split('s6', 'unrelated', 'someone-else', 20),
    ];
    const settlements = [settlement('settle', friendId, currentUserId, 5)];

    const detail = buildFriendDetailData(currentUserId, friend, expenses, splits, settlements);

    expect(detail.friend.balance).toBe(20);
    expect(detail.expenses).toMatchObject([
      { id: 'current-paid', yourShare: 40, friendShare: 40, paidByName: 'You' },
      { id: 'friend-paid', yourShare: 15, friendShare: 15, paidByName: 'Asha' },
    ]);
  });

  it('matches settlement direction from existing pair-balance math', () => {
    expect(calculatePairBalance(
      currentUserId,
      friendId,
      [],
      [],
      [
        settlement('paid-by-current', currentUserId, friendId, 10),
        settlement('paid-by-friend', friendId, currentUserId, 3),
      ]
    )).toBe(7);
  });

  it('builds a chronological friend activity timeline with expenses and settlements', () => {
    const expenses = [
      expense('dinner', currentUserId, 80, 2),
      expense('coffee', friendId, 30, 4),
    ];
    const splits = [
      split('s1', 'dinner', currentUserId, 40),
      split('s2', 'dinner', friendId, 40),
      split('s3', 'coffee', currentUserId, 15),
      split('s4', 'coffee', friendId, 15),
    ];
    const settlements = [
      settlement('settle-older', currentUserId, friendId, 10),
      settlement('settle-newer', friendId, currentUserId, 5),
    ];
    settlements[0].date = 3;
    settlements[1].date = 5;

    const detail = buildFriendDetailData(currentUserId, friend, expenses, splits, settlements);

    expect(detail.activity).toMatchObject([
      {
        id: 'settlement:settle-newer',
        type: 'settlement',
        amount: 5,
        direction: 'friend_paid_you',
        settlementId: 'settle-newer',
      },
      {
        id: 'expense:coffee',
        type: 'expense',
        expense: { id: 'coffee', paidByName: 'Asha' },
      },
      {
        id: 'settlement:settle-older',
        type: 'settlement',
        amount: 10,
        direction: 'you_paid_friend',
        settlementId: 'settle-older',
      },
      {
        id: 'expense:dinner',
        type: 'expense',
        expense: { id: 'dinner', paidByName: 'You' },
      },
    ]);
  });
});
