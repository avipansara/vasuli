import { describe, expect, it } from 'vitest';
import type { FriendDetailData } from '@/services/friend-detail-service';
import { createFriendDetailModule } from '@/services/friend-detail-module';
import type { Settlement } from '@/types/database';

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
};

describe('Friend detail module', () => {
  it('returns the selected Friend detail through its public read interface', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
    });

    await expect(module.getDetail('current-user', 'friend-a')).resolves.toEqual(detail);
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
});
