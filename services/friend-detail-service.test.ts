import { describe, expect, it } from 'vitest';
import {
  buildFriendDetailData,
  calculatePairBalance,
  projectFriendRelationship,
} from '@/services/friend-detail-service';
import { ActivityType, type Activity, type Expense, type ExpenseSplit, type Settlement, type User } from '@/types/database';

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

const activity = (
  id: string,
  type: ActivityType,
  targetId: string,
  createdAt: number,
  metadata?: string
): Activity => ({
  id,
  type,
  userId: currentUserId,
  userName: 'Current User',
  targetId,
  description: type === ActivityType.EXPENSE_DELETED ? 'Deleted: Dinner' : 'Updated: Dinner',
  amount: 80,
  metadata,
  createdAt,
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

  it('includes update activity for expenses shared with the friend', () => {
    const expenses = [
      expense('dinner', currentUserId, 80, 2),
    ];
    const splits = [
      split('s1', 'dinner', currentUserId, 40),
      split('s2', 'dinner', friendId, 40),
    ];
    const activities = [
      activity('activity-update', ActivityType.EXPENSE_UPDATED, 'dinner', 5),
    ];

    const detail = buildFriendDetailData(currentUserId, friend, expenses, splits, [], activities);

    expect(detail.activity).toMatchObject([
      {
        id: 'activity:activity-update',
        type: 'expense_activity',
        activityType: ActivityType.EXPENSE_UPDATED,
        targetId: 'dinner',
        isDeleted: false,
        isUpdated: true,
      },
      {
        id: 'expense:dinner',
        type: 'expense',
      },
    ]);
  });

  it('excludes expenses where either person has a zero-value split', () => {
    const expenses = [expense('not-shared', currentUserId, 28, 2)];
    const splits = [
      split('s1', 'not-shared', currentUserId, 0),
      split('s2', 'not-shared', friendId, 0),
      split('s3', 'not-shared', 'isha-user', 14),
      split('s4', 'not-shared', 'deep-user', 14),
    ];

    const detail = buildFriendDetailData(currentUserId, friend, expenses, splits, []);

    expect(detail.expenses).toEqual([]);
    expect(detail.activity).toEqual([]);
  });

  it('includes an expense paid by the friend when the current user has a positive share', () => {
    const expenses = [expense('paid-by-friend', friendId, 1596, 2)];
    const splits = [
      split('s1', 'paid-by-friend', currentUserId, 798),
    ];

    const detail = buildFriendDetailData(currentUserId, friend, expenses, splits, []);

    expect(detail.friend.balance).toBe(-798);
    expect(detail.expenses).toHaveLength(1);
  });

  it('includes an expense paid by the current user when the payer has no split row', () => {
    const expenses = [expense('paid-by-current-user', currentUserId, 100, 2)];
    const splits = [split('s1', 'paid-by-current-user', friendId, 100)];

    const detail = buildFriendDetailData(currentUserId, friend, expenses, splits, []);

    expect(detail.friend.balance).toBe(100);
    expect(detail.expenses).toMatchObject([{ yourShare: 0, friendShare: 100 }]);
  });

  it('applies a scope transfer to Group and direct balances with inverse effects', () => {
    const relationship = projectFriendRelationship({
      friend: { ...friend, balance: -30 },
      expenses: [],
      activity: [{
        id: 'direct-settlement-context',
        type: 'settlement',
        date: 1,
        settlementId: 'settlement-context',
        amount: 0,
        currency: 'USD',
        direction: 'you_paid_friend',
      }],
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: 20,
        direction: 'you_are_owed',
      }],
      scopeTransfers: [{
        id: 'transfer-1',
        operationId: 'operation-1',
        groupId: 'group-1',
        fromUserId: friendId,
        toUserId: currentUserId,
        currency: 'USD',
        signedGroupBalanceDelta: -20,
        createdAt: 1,
      }],
    });

    expect(relationship.directBalance).toBe(-10);
    expect(relationship.groupBalances).toMatchObject([{ amount: 0, direction: 'settled' }]);
    expect(relationship.totalsByCurrency).toEqual([{
      currency: 'USD',
      amount: -10,
      direction: 'you_owe',
    }]);
  });

  it('preserves the inverse contract when the counterpart initiates the transfer', () => {
    const relationship = projectFriendRelationship({
      friend: { ...friend, balance: 10 },
      expenses: [],
      activity: [{
        id: 'direct-settlement-context',
        type: 'settlement',
        date: 1,
        settlementId: 'settlement-context',
        amount: 0,
        currency: 'USD',
        direction: 'you_paid_friend',
      }],
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: -20,
        direction: 'you_owe',
      }],
      scopeTransfers: [{
        id: 'transfer-2',
        operationId: 'operation-2',
        groupId: 'group-1',
        fromUserId: currentUserId,
        toUserId: friendId,
        currency: 'USD',
        signedGroupBalanceDelta: 20,
        createdAt: 1,
      }],
    });

    expect(relationship.directBalance).toBe(-10);
    expect(relationship.groupBalances).toMatchObject([{ amount: 0, direction: 'settled' }]);
    expect(relationship.totalsByCurrency).toEqual([{
      currency: 'USD',
      amount: -10,
      direction: 'you_owe',
    }]);
  });

  it('keeps group expenses paid by a third party out of individual friend detail', () => {
    const groupExpense = { ...expense('group-dinner', 'isha-user', 300, 2), groupId: 'group-1' };
    const splits = [
      split('s1', 'group-dinner', currentUserId, 100),
      split('s2', 'group-dinner', friendId, 100),
    ];

    const detail = buildFriendDetailData(currentUserId, friend, [groupExpense], splits, []);

    expect(detail.friend.balance).toBe(0);
    expect(detail.expenses).toEqual([]);
    expect(detail.activity).toMatchObject([{ type: 'group_expense', expense: { id: 'group-dinner' } }]);
  });

  it('keeps group expenses out of the direct Friend ledger', () => {
    const groupExpense = { ...expense('group-dinner', currentUserId, 300, 2), groupId: 'group-1' };
    const splits = [
      split('s1', 'group-dinner', friendId, 100),
    ];
    const detail = buildFriendDetailData(currentUserId, friend, [groupExpense], splits, []);

    expect(detail.friend.balance).toBe(0);
    expect(detail.expenses).toEqual([]);
    expect(detail.activity).toMatchObject([{ type: 'group_expense', expense: { id: 'group-dinner' } }]);
  });

  it('excludes soft-deleted expenses from active friend expenses and balances', () => {
    const deletedExpense = expense('deleted-dinner', currentUserId, 80, 2);
    deletedExpense.deletedAt = 5;
    const splits = [
      split('s1', deletedExpense.id, currentUserId, 40),
      split('s2', deletedExpense.id, friendId, 40),
    ];

    const detail = buildFriendDetailData(currentUserId, friend, [deletedExpense], splits, []);

    expect(detail.expenses).toEqual([]);
    expect(detail.friend.balance).toBe(0);
    expect(detail.activity).toEqual([]);
  });

  it('includes deleted expense activity when metadata says the friend participated', () => {
    const activities = [
      activity(
        'activity-delete',
        ActivityType.EXPENSE_DELETED,
        'deleted-dinner',
        5,
        JSON.stringify({ participantIds: [currentUserId, friendId] })
      ),
    ];

    const detail = buildFriendDetailData(currentUserId, friend, [], [], [], activities);

    expect(detail.activity).toMatchObject([
      {
        id: 'activity:activity-delete',
        type: 'expense_activity',
        activityType: ActivityType.EXPENSE_DELETED,
        targetId: 'deleted-dinner',
        isDeleted: true,
        isUpdated: false,
      },
    ]);
  });

  it('projects direct and shared Group balances into one currency-safe relationship view', () => {
    const projection = projectFriendRelationship({
      friend: { ...friend, balance: 40 },
      expenses: [{
        ...expense('dinner', currentUserId, 80, 10),
        currency: 'USD',
        yourShare: 40,
        friendShare: 40,
        paidByName: 'You',
      }],
      activity: [],
      groupBalances: [{
        groupId: 'alaska',
        groupName: 'Alaska 2026',
        currency: 'USD',
        amount: -100,
        direction: 'you_owe',
        lastActivityAt: 20,
      }, {
        groupId: 'euro-trip',
        groupName: 'Euro Trip',
        currency: 'EUR',
        amount: 25,
        direction: 'you_are_owed',
        lastActivityAt: 30,
      }],
    });

    expect(projection).toEqual({
      directBalance: 40,
      directCurrency: 'USD',
      groupBalances: expect.any(Array),
      activity: [],
      totalsByCurrency: [
        { currency: 'EUR', amount: 25, direction: 'you_are_owed' },
        { currency: 'USD', amount: -60, direction: 'you_owe' },
      ],
      settleableTotal: undefined,
    });
  });

  it('returns one settleable total when the relationship has one currency', () => {
    const projection = projectFriendRelationship({
      friend: { ...friend, balance: -40 },
      expenses: [{
        ...expense('dinner', currentUserId, 80, 10),
        yourShare: 40,
        friendShare: 40,
        paidByName: 'You',
      }],
      activity: [],
      groupBalances: [{
        groupId: 'alaska',
        groupName: 'Alaska 2026',
        currency: 'USD',
        amount: -100,
        direction: 'you_owe',
      }],
    });

    expect(projection.settleableTotal).toEqual({
      currency: 'USD',
      amount: -140,
      direction: 'you_owe',
    });
  });

  it('does not expose a settleable total when same-currency scopes owe opposite directions', () => {
    const projection = projectFriendRelationship({
      friend: { ...friend, balance: -40 },
      expenses: [{
        ...expense('dinner', friendId, 80, 10),
        yourShare: 40,
        friendShare: 40,
        paidByName: 'Asha',
      }],
      activity: [],
      groupBalances: [{
        groupId: 'alaska',
        groupName: 'Alaska 2026',
        currency: 'USD',
        amount: 40,
        direction: 'you_are_owed',
      }],
    });

    expect(projection.settleableTotal).toBeUndefined();
  });
});
