import { describe, expect, it } from 'vitest';
import { createFriendDetailReadModel } from '@/services/friend-detail-read-model';

describe('friend detail read model', () => {
  it('returns the pair-scoped detail projection through the read-model seam', async () => {
    let rpcArgs: Record<string, string> | undefined;
    const readModel = createFriendDetailReadModel({
      rpc: async (_functionName, args) => {
        rpcArgs = args;
        return {
        data: {
          friend: {
            id: 'friend-a',
            name: 'Asha',
            email: 'asha@example.com',
            isActive: true,
            createdAt: '2026-08-16T10:00:00.000Z',
            balance: 25,
          },
          expenses: [{
            id: 'expense-1',
            description: 'Dinner',
            amount: 80,
            currency: 'USD',
            paidBy: 'current-user',
            createdBy: 'current-user',
            date: '2026-08-15T10:00:00.000Z',
            createdAt: '2026-08-15T10:00:00.000Z',
            updatedAt: '2026-08-15T10:00:00.000Z',
            yourShare: 40,
            friendShare: 40,
            paidByName: 'You',
          }],
          settlements: [{
            id: 'settlement-1',
            amount: 15,
            currency: 'USD',
            date: '2026-08-14T10:00:00.000Z',
            createdAt: '2026-08-14T10:00:00.000Z',
            direction: 'friend_paid_you',
          }],
          activities: [{
            id: 'activity-1',
            activityType: 'expense_updated',
            targetId: 'expense-1',
            description: 'Updated: Dinner',
            amount: 80,
            userId: 'current-user',
            userName: 'You',
            date: '2026-08-16T11:00:00.000Z',
            isDeleted: false,
            isUpdated: true,
          }],
        },
        error: null,
        };
      },
    });

    await expect(readModel.getDetail('current-user', 'friend-a')).resolves.toMatchObject({
      friend: { id: 'friend-a', name: 'Asha', balance: 25 },
      expenses: [{ id: 'expense-1', yourShare: 40, friendShare: 40 }],
      activity: [
        { id: 'activity:activity-1', type: 'expense_activity', targetId: 'expense-1' },
        { id: 'expense:expense-1', type: 'expense' },
        { id: 'settlement:settlement-1', type: 'settlement', direction: 'friend_paid_you' },
      ],
    });
    expect(rpcArgs).toEqual({ p_friend_id: 'friend-a' });
  });

  it('returns null when the read model has no matching friend', async () => {
    const readModel = createFriendDetailReadModel({
      rpc: async () => ({ data: null, error: null }),
    });

    await expect(readModel.getDetail('current-user', 'missing-friend')).resolves.toBeNull();
  });

  it('surfaces a read-model failure to the existing error state', async () => {
    const readModel = createFriendDetailReadModel({
      rpc: async () => ({ data: null, error: { message: 'Read model unavailable' } }),
    });

    await expect(readModel.getDetail('current-user', 'friend-a')).rejects.toThrow('Read model unavailable');
  });
});
