import { describe, expect, it } from 'vitest';
import { buildFriendshipStatus, buildGroupDetailData, calculateGroupBalances } from '@/services/group-detail-service';
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

  it('marks pending received friendships by direction', () => {
    const statuses = buildFriendshipStatus(currentUserId, [
      friendship('other-user', currentUserId, 'pending'),
    ]);

    expect(statuses.get('other-user')).toBe('pending_received');
  });
});
