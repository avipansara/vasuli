import { describe, expect, it } from 'vitest';
import { applySettlementsToGroupDetailData, buildFriendshipStatus, buildGroupDetailData, calculateGroupBalances } from '@/services/group-detail-service';
import { isGroupSettled } from '@/services/group-balance';
import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, User } from '@/types/database';
import type { Friendship } from '@/services/friendship-service';

const currentUserId = 'current-user';

const user = (id: string, name: string): User => ({
  id,
  name,
  isActive: true,
  createdAt: 1,
});

const group: Group = {
  id: 'group-1',
  name: 'Trip',
  createdAt: 1,
  updatedAt: 1,
};

const member = (id: string, userId: string): GroupMember => ({
  id,
  userId,
  groupId: group.id,
  role: userId === currentUserId ? 'admin' : 'member',
  joinedAt: 1,
});

const expense = (id: string, paidBy: string, amount: number): Expense => ({
  id,
  paidBy,
  amount,
  groupId: group.id,
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

const settlement = (id: string, fromUserId: string, toUserId: string, amount: number): Settlement => ({
  id,
  groupId: group.id,
  fromUserId,
  toUserId,
  amount,
  currency: 'USD',
  date: 1,
  createdAt: 1,
});

const friendship = (userId: string, friendId: string, status: Friendship['status']): Friendship => ({
  id: `${userId}-${friendId}`,
  userId,
  friendId,
  status,
  createdAt: 1,
});

describe('group detail builders', () => {
  it('computes balances using expenses, splits, and settlements', () => {
    const balances = calculateGroupBalances(
      [expense('meal', currentUserId, 90)],
      [
        split('s1', 'meal', currentUserId, 30),
        split('s2', 'meal', 'friend-a', 30),
        split('s3', 'meal', 'friend-b', 30),
      ],
      [settlement('settle', 'friend-a', currentUserId, 10)]
    );

    expect(balances.get(currentUserId)).toBe(50);
    expect(balances.get('friend-a')).toBe(-20);
    expect(balances.get('friend-b')).toBe(-30);
  });

  it('detects a group as settled when settlements clear every balance', () => {
    const expenses = [expense('meal', currentUserId, 90)];
    const splits = [
      split('s1', 'meal', currentUserId, 30),
      split('s2', 'meal', 'friend-a', 30),
      split('s3', 'meal', 'friend-b', 30),
    ];
    const settlements = [
      settlement('settle-a', 'friend-a', currentUserId, 30),
      settlement('settle-b', 'friend-b', currentUserId, 30),
    ];

    expect(isGroupSettled(expenses, splits, settlements)).toBe(true);
  });

  it('detects a group as unsettled while any member still has a balance', () => {
    const expenses = [expense('meal', currentUserId, 90)];
    const splits = [
      split('s1', 'meal', currentUserId, 30),
      split('s2', 'meal', 'friend-a', 30),
      split('s3', 'meal', 'friend-b', 30),
    ];
    const settlements = [
      settlement('settle-a', 'friend-a', currentUserId, 30),
    ];

    expect(isGroupSettled(expenses, splits, settlements)).toBe(false);
  });

  it('treats tiny rounding balances as settled', () => {
    const expenses = [expense('meal', currentUserId, 100)];
    const splits = [
      split('s1', 'meal', currentUserId, 33.333),
      split('s2', 'meal', 'friend-a', 33.333),
      split('s3', 'meal', 'friend-b', 33.333),
    ];
    const settlements = [
      settlement('settle-a', 'friend-a', currentUserId, 33.333),
      settlement('settle-b', 'friend-b', currentUserId, 33.333),
    ];

    expect(isGroupSettled(expenses, splits, settlements)).toBe(true);
  });

  it('builds hydrated group detail data from batched inputs', () => {
    const users = [
      user(currentUserId, 'You'),
      user('friend-a', 'Asha'),
      user('friend-b', 'Ben'),
      user('available', 'Casey'),
    ];
    const detail = buildGroupDetailData({
      currentUserId,
      group,
      expenses: [expense('meal', 'friend-a', 60)],
      members: [member('m1', currentUserId), member('m2', 'friend-a')],
      users,
      userFriends: [users[1], users[3]],
      friendships: [
        friendship(currentUserId, 'friend-a', 'accepted'),
        friendship(currentUserId, 'friend-b', 'pending'),
      ],
      splits: [
        split('s1', 'meal', currentUserId, 30),
        split('s2', 'meal', 'friend-a', 30),
      ],
      settlements: [],
    });

    expect(detail.expenses[0].paidByUser?.name).toBe('Asha');
    expect(detail.members[0].user?.name).toBe('You');
    expect(detail.availableUsers).toMatchObject([{ id: 'available' }]);
    expect(detail.friendshipStatus.get('friend-a')).toBe('accepted');
    expect(detail.friendshipStatus.get('friend-b')).toBe('pending_sent');
  });

  it('applies new settlement rows to cached group detail balances', () => {
    const detail = buildGroupDetailData({
      currentUserId,
      group,
      expenses: [expense('meal', currentUserId, 60)],
      members: [member('m1', currentUserId), member('m2', 'friend-a')],
      users: [user(currentUserId, 'You'), user('friend-a', 'Asha')],
      userFriends: [],
      friendships: [],
      splits: [
        split('s1', 'meal', currentUserId, 30),
        split('s2', 'meal', 'friend-a', 30),
      ],
      settlements: [],
    });

    const updated = applySettlementsToGroupDetailData(detail, [
      settlement('settle-a', 'friend-a', currentUserId, 30),
    ]);

    expect(updated.settlements).toHaveLength(1);
    expect(updated.balances.get(currentUserId)).toBe(0);
    expect(updated.balances.get('friend-a')).toBe(0);
  });

  it('marks pending received friendships by direction', () => {
    const statuses = buildFriendshipStatus(currentUserId, [
      friendship('other-user', currentUserId, 'pending'),
    ]);

    expect(statuses.get('other-user')).toBe('pending_received');
  });
});
