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
      currency: 'USD',
      date: 10,
    })).resolves.toEqual([settlement]);
  });
});
