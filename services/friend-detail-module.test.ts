import { describe, expect, it } from 'vitest';
import type { FriendActivityItem, FriendDetailData } from '@/services/friend-detail-service';
import { ActivityType } from '@/types/database';
import {
  createFriendDetailModule,
  filterFriendActivity,
  groupFriendActivityByMonth,
} from '@/services/friend-detail-module';
import type { Settlement, SettlementScopeTransfer } from '@/types/database';

const detail: FriendDetailData = {
  friend: {
    id: 'friend-a',
    name: 'Asha',
    isActive: true,
    createdAt: 1,
    balance: 24,
  },
  expenses: [],
  activity: [],
  groupBalances: [],
  relationship: {
    directBalance: 24,
    groupBalances: [],
    activity: [],
    totalsByCurrency: [],
  },
};

describe('Friend detail module', () => {
  it('returns the selected Friend detail through its public read interface', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
    });

    await expect(module.getDetail('current-user', 'friend-a')).resolves.toEqual({
      ...detail,
      relationship: {
        directBalance: 24,
        directCurrency: undefined,
        groupBalances: [],
        activity: [],
        totalsByCurrency: [],
        settleableTotal: undefined,
      },
    });
  });

  it('returns group balance summaries separately from the direct Friend detail', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
      groupBalanceAdapter: {
        getSharedGroupBalances: async () => [{
          groupId: 'group-alaska',
          groupName: 'Alaska 2026',
          currency: 'USD',
          amount: -100,
          direction: 'you_owe',
          lastActivityAt: 20,
        }],
      },
    });

    await expect(module.getDetail('current-user', 'friend-a')).resolves.toMatchObject({
      friend: { balance: 24 },
      groupBalances: [{
        groupId: 'group-alaska',
        groupName: 'Alaska 2026',
        amount: -100,
        direction: 'you_owe',
      }],
      relationship: {
        directBalance: 24,
        directCurrency: undefined,
        totalsByCurrency: [{ currency: 'USD', amount: -100, direction: 'you_owe' }],
        activity: [],
      },
    });
  });

  it('uses the injected authoritative relationship adapter for production parity', async () => {
    const authoritativeRelationship = {
      directBalance: 120,
      directCurrency: 'USD',
      groupBalances: [],
      activity: [],
      totalsByCurrency: [{ currency: 'USD', amount: 120, direction: 'you_are_owed' as const }],
      settleableTotal: { currency: 'USD', amount: 120, direction: 'you_are_owed' as const },
    };
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
      relationshipAdapter: { getRelationship: async () => authoritativeRelationship },
    });

    await expect(module.getDetail('current-user', 'friend-a')).resolves.toMatchObject({
      relationship: authoritativeRelationship,
    });
  });

  it('preserves detail activity while sharing authoritative balance fields', async () => {
    const detailActivity: FriendActivityItem[] = [{
      id: 'activity:detail',
      type: 'expense_activity',
      date: 2,
      activityId: 'activity-1',
      activityType: ActivityType.EXPENSE_UPDATED,
      targetId: 'expense-1',
      description: 'Updated expense',
      userId: 'friend-a',
      isDeleted: false,
      isUpdated: true,
    }];
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => ({ ...detail, relationship: { ...detail.relationship, activity: detailActivity } }) },
      relationshipAdapter: {
        getRelationship: async () => ({
          directBalance: 120,
          directCurrency: 'USD',
          groupBalances: [],
          activity: [],
          totalsByCurrency: [{ currency: 'USD', amount: 120, direction: 'you_are_owed' as const }],
          settleableTotal: { currency: 'USD', amount: 120, direction: 'you_are_owed' as const },
        }),
      },
    });

    await expect(module.getDetail('current-user', 'friend-a')).resolves.toMatchObject({
      relationship: { directBalance: 120, activity: detailActivity },
    });
  });

  it('records a valid settlement and returns the resulting pair settlements', async () => {
    const settlement: Settlement = {
      id: 'settlement-1',
      fromUserId: 'friend-a',
      toUserId: 'current-user',
      amount: 24,
      currency: 'USD',
      date: 10,
      createdAt: 10,
    };
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
      settlementAdapter: {
        createPairSettlements: async () => [settlement],
      },
    });

    await expect(module.settleUp({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      amount: 24,
      balance: 24,
      currency: 'USD',
      date: 10,
    })).resolves.toEqual([settlement]);
  });

  it('returns transfer-adjusted group rows alongside the relationship projection', async () => {
    const transfer: SettlementScopeTransfer = {
      id: 'transfer-1',
      operationId: 'operation-1',
      groupId: 'group-alaska',
      fromUserId: 'friend-a',
      toUserId: 'current-user',
      currency: 'USD',
      signedGroupBalanceDelta: -100,
      createdAt: 30,
    };
    const module = createFriendDetailModule({
      readAdapter: {
        getDetail: async () => ({
          ...detail,
          expenses: [{
            id: 'direct-expense',
            description: 'Dinner',
            amount: 24,
            currency: 'USD',
            paidBy: 'current-user',
            date: 1,
            createdAt: 1,
            updatedAt: 1,
            yourShare: 0,
            friendShare: 24,
            paidByName: 'You',
          }],
        }),
      },
      groupBalanceAdapter: {
        getSharedGroupBalances: async () => [{
          groupId: 'group-alaska',
          groupName: 'Alaska 2026',
          currency: 'USD',
          amount: 100,
          direction: 'you_are_owed',
        }],
      },
      scopeTransferAdapter: { getByFriend: async () => [transfer] },
    });

    await expect(module.getDetail('current-user', 'friend-a')).resolves.toMatchObject({
      groupBalances: [{ groupId: 'group-alaska', amount: 0, direction: 'settled' }],
      relationship: { totalsByCurrency: [{ currency: 'USD', amount: 124, direction: 'you_are_owed' }] },
    });
  });

  it('rejects a group-scoped settlement from the direct Friend flow', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
      settlementAdapter: {
        createPairSettlements: async () => [{
          id: 'group-settlement',
          groupId: 'group-alaska',
          fromUserId: 'current-user',
          toUserId: 'friend-a',
          amount: 24,
          currency: 'USD',
          date: 10,
          createdAt: 10,
        }],
      },
    });

    await expect(module.settleUp({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      amount: 24,
      balance: 24,
      currency: 'USD',
      date: 10,
    })).rejects.toThrow('direct Friend balance');
  });

  it('deletes an expense through the Friend detail action interface', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
      expenseAdapter: {
        delete: async () => undefined,
      },
    });

    await expect(module.deleteExpense({
      expenseId: 'expense-1',
      currentUserId: 'current-user',
      currentUserName: 'You',
    })).resolves.toBeUndefined();
  });

  it('removes a Friend through the Friend detail action interface', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
      friendshipAdapter: {
        remove: async () => undefined,
      },
    });

    await expect(module.removeFriend('current-user', 'friend-a')).resolves.toBeUndefined();
  });

  it('rejects a reminder when the pair is already settled', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
      notificationAdapter: {
        sendPushNotification: async () => undefined,
      },
    });

    await expect(module.remind({
      friendId: 'friend-a',
      friendName: 'Asha',
      friendPushToken: 'push-token',
      currentUserName: 'You',
      balance: 0,
    })).rejects.toThrow('No outstanding balance');
  });

  it('filters and groups Friend activity without changing chronological order', () => {
    const activity = [
      {
        id: 'expense:later',
        type: 'expense' as const,
        date: new Date('2026-02-03T12:00:00Z').getTime(),
        expense: { id: 'later' } as FriendDetailData['expenses'][number],
      },
      {
        id: 'settlement:older',
        type: 'settlement' as const,
        date: new Date('2026-01-20T12:00:00Z').getTime(),
        settlementId: 'older',
        amount: 10,
        currency: 'USD',
        direction: 'friend_paid_you' as const,
      },
      {
        id: 'activity:update',
        type: 'expense_activity' as const,
        date: new Date('2026-02-01T12:00:00Z').getTime(),
        activityId: 'update',
        activityType: 'expense_updated' as const,
        targetId: 'later',
        description: 'Updated: Later',
        userId: 'friend-a',
        isDeleted: false,
        isUpdated: true,
      },
    ] as unknown as FriendActivityItem[];

    expect(filterFriendActivity(activity, 'expenses').map(item => item.id)).toEqual(['expense:later']);
    expect(filterFriendActivity(activity, 'updates').map(item => item.id)).toEqual([
      'activity:update',
      'settlement:older',
    ]);
    expect(groupFriendActivityByMonth(activity)).toMatchObject([
      { monthKey: '2026-02', items: [{ id: 'expense:later' }, { id: 'activity:update' }] },
      { monthKey: '2026-01', items: [{ id: 'settlement:older' }] },
    ]);
  });
});
