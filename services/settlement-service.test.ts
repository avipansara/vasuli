import { describe, expect, it } from 'vitest';
import { buildPairSettlementAllocations } from '@/services/settlement-service';
import type { Expense, ExpenseSplit, Settlement } from '@/types/database';

const currentUserId = 'current-user';
const friendId = 'friend-a';

const expense = (
  id: string,
  paidBy: string,
  amount: number,
  groupId?: string
): Expense => ({
  id,
  paidBy,
  amount,
  groupId,
  description: id,
  currency: 'USD',
  date: 1,
  createdAt: 1,
  updatedAt: 1,
});

const split = (id: string, expenseId: string, userId: string, amount: number): ExpenseSplit => ({
  id,
  expenseId,
  userId,
  amount,
  splitType: 'equal',
});

const settlement = (
  id: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
  groupId?: string
): Settlement => ({
  id,
  groupId,
  fromUserId,
  toUserId,
  amount,
  currency: 'USD',
  date: 1,
  createdAt: 1,
});

describe('buildPairSettlementAllocations', () => {
  it('allocates a friend settlement into the groups where the pair has outstanding balances', () => {
    const expenses = [
      expense('personal-current-paid', currentUserId, 40),
      expense('group-current-paid', currentUserId, 60, 'group-1'),
      expense('group-friend-paid', friendId, 20, 'group-2'),
    ];
    const splits = [
      split('s1', 'personal-current-paid', currentUserId, 20),
      split('s2', 'personal-current-paid', friendId, 20),
      split('s3', 'group-current-paid', currentUserId, 30),
      split('s4', 'group-current-paid', friendId, 30),
      split('s5', 'group-friend-paid', currentUserId, 10),
      split('s6', 'group-friend-paid', friendId, 10),
    ];
    const settlements = [
      settlement('partial-personal', friendId, currentUserId, 5),
    ];

    expect(buildPairSettlementAllocations({
      currentUserId,
      friendId,
      amount: 45,
      expenses,
      splits,
      settlements,
    })).toEqual([
      { fromUserId: friendId, toUserId: currentUserId, amount: 15 },
      { groupId: 'group-1', fromUserId: friendId, toUserId: currentUserId, amount: 30 },
    ]);
  });

  it('settles every group bucket when the friend settlement equals the net pair balance', () => {
    const expenses = [
      expense('personal-current-paid', currentUserId, 40),
      expense('group-current-paid', currentUserId, 60, 'group-1'),
      expense('group-friend-paid', friendId, 20, 'group-2'),
    ];
    const splits = [
      split('s1', 'personal-current-paid', currentUserId, 20),
      split('s2', 'personal-current-paid', friendId, 20),
      split('s3', 'group-current-paid', currentUserId, 30),
      split('s4', 'group-current-paid', friendId, 30),
      split('s5', 'group-friend-paid', currentUserId, 10),
      split('s6', 'group-friend-paid', friendId, 10),
    ];

    expect(buildPairSettlementAllocations({
      currentUserId,
      friendId,
      amount: 40,
      expenses,
      splits,
      settlements: [],
    })).toEqual([
      { fromUserId: friendId, toUserId: currentUserId, amount: 20 },
      { groupId: 'group-1', fromUserId: friendId, toUserId: currentUserId, amount: 30 },
      { groupId: 'group-2', fromUserId: currentUserId, toUserId: friendId, amount: 10 },
    ]);
  });
});
