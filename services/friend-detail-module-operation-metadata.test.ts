import { describe, expect, it } from 'vitest';
import { createFriendDetailModule } from './friend-detail-module';

describe('friend detail operation metadata wiring', () => {
  it('merges the authorized operation read into Friend detail data', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => ({
        friend: { id: 'friend', name: 'Friend', isActive: true, createdAt: 1, balance: 0 },
        expenses: [], activity: [], relationship: {
          directBalance: 0, groupBalances: [], activity: [], totalsByCurrency: [],
        },
      }) },
      settlementOperationMetadataAdapter: {
        getByFriend: async () => [{ operationId: 'op-1', status: 'committed', createdAt: 10, requestedPaymentAmount: 7, fromUserId: 'friend', toUserId: 'actor' }],
      },
    });

    await expect(module.getDetail('actor', 'friend')).resolves.toMatchObject({
      settlementOperations: [{ operationId: 'op-1', requestedPaymentAmount: 7, fromUserId: 'friend' }],
    });
  });

  it('unions read-model and adapter operation metadata with the adapter winning per operation', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => ({
        friend: { id: 'friend', name: 'Friend', isActive: true, createdAt: 1, balance: 0 },
        expenses: [], activity: [], relationship: {
          directBalance: 0, groupBalances: [], activity: [], totalsByCurrency: [],
        },
        settlementOperations: [
          { operationId: 'op-1', status: 'committed', createdAt: 10, requestedPaymentAmount: 5 },
          { operationId: 'op-read-only', status: 'committed', createdAt: 11 },
        ],
      }) },
      settlementOperationMetadataAdapter: {
        getByFriend: async () => [{ operationId: 'op-1', status: 'reversed', createdAt: 10, reversedAt: 20, requestedPaymentAmount: 7 }],
      },
    });

    const loaded = await module.getDetail('actor', 'friend');
    expect(loaded?.settlementOperations).toHaveLength(2);
    await expect(module.getDetail('actor', 'friend')).resolves.toMatchObject({
      settlementOperations: expect.arrayContaining([
        expect.objectContaining({ operationId: 'op-1', status: 'reversed', requestedPaymentAmount: 7 }),
        expect.objectContaining({ operationId: 'op-read-only', status: 'committed' }),
      ]),
    });
  });
});
