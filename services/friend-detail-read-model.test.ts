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
            paidBy: 'isha-user',
            createdBy: 'current-user',
            date: '2026-08-15T10:00:00.000Z',
            createdAt: '2026-08-15T10:00:00.000Z',
            updatedAt: '2026-08-15T10:00:00.000Z',
            yourShare: 40,
            friendShare: 40,
            paidByName: 'Isha',
            groupName: 'Alaska Trip',
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
      expenses: [{ id: 'expense-1', paidBy: 'isha-user', paidByName: 'Isha', yourShare: 40, friendShare: 40, groupName: 'Alaska Trip' }],
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

  it('removes group expenses and group activity from the friend projection', async () => {
    const readModel = createFriendDetailReadModel({
      rpc: async () => ({
        data: {
          friend: {
            id: 'friend-a',
            name: 'Asha',
            isActive: true,
            createdAt: '2026-08-16T10:00:00.000Z',
            balance: 0,
          },
          expenses: [],
          groupExpenses: [{
            id: 'car-rental',
            groupId: 'alaska-2026',
            description: 'Car rental',
            amount: 1009,
            currency: 'USD',
            paidBy: 'isha-user',
            date: '2026-08-14T10:00:00.000Z',
            createdAt: '2026-08-14T10:00:00.000Z',
            updatedAt: '2026-08-14T10:00:00.000Z',
            yourShare: 168.17,
            friendShare: 168.17,
            paidByName: 'Isha',
            groupName: 'Alaska 2026',
          }],
          settlements: [{
            id: 'group-settlement',
            groupId: 'alaska-2026',
            amount: 20,
            currency: 'USD',
            date: '2026-08-14T11:00:00.000Z',
            createdAt: '2026-08-14T11:00:00.000Z',
            direction: 'friend_paid_you',
          }],
          activities: [{
            id: 'group-activity',
            activityType: 'expense_updated',
            targetId: 'car-rental',
            groupId: 'alaska-2026',
            description: 'Updated: Car rental',
            userId: 'isha-user',
            date: '2026-08-14T12:00:00.000Z',
            isDeleted: false,
            isUpdated: true,
          }],
        },
        error: null,
      }),
    });

    await expect(readModel.getDetail('current-user', 'friend-a')).resolves.toMatchObject({
      expenses: [],
      activity: [{ id: 'group-expense:car-rental', type: 'group_expense' }],
    });
  });

  it('exposes a shared group expense as read-only activity without adding it to direct expenses', async () => {
    const readModel = createFriendDetailReadModel({
      rpc: async () => ({
        data: {
          friend: {
            id: 'friend-a', name: 'Asha', isActive: true,
            createdAt: '2026-08-16T10:00:00.000Z', balance: 0,
          },
          expenses: [],
          groupExpenses: [{
            id: 'car-rental', groupId: 'alaska-2026', groupName: 'Alaska 2026',
            description: 'Car rental', amount: 300, currency: 'USD', paidBy: 'isha',
            date: '2026-08-14T10:00:00.000Z', createdAt: '2026-08-14T10:00:00.000Z',
            updatedAt: '2026-08-14T10:00:00.000Z', yourShare: 100, friendShare: 100,
            paidByName: 'Isha',
          }],
          settlements: [],
          activities: [],
        },
        error: null,
      }),
    });

    await expect(readModel.getDetail('current-user', 'friend-a')).resolves.toMatchObject({
      expenses: [],
      activity: [{
        type: 'group_expense',
        expense: { id: 'car-rental', groupId: 'alaska-2026', paidByName: 'Isha' },
      }],
    });
  });

  it('exposes each pair-relevant group settlement once as activity without changing direct balance inputs', async () => {
    const readModel = createFriendDetailReadModel({
      rpc: async () => ({
        data: {
          friend: {
            id: 'friend-a', name: 'Asha', isActive: true,
            createdAt: '2026-08-16T10:00:00.000Z', balance: 15,
          },
          expenses: [],
          settlements: [],
          groupSettlements: [{
            id: 'group-settlement-1', operationId: 'operation-1',
            groupId: 'group-alaska', groupName: 'Alaska 2026',
            amount: 35, currency: 'USD', date: '2026-08-19T10:00:00.000Z',
            createdAt: '2026-08-19T10:00:00.000Z',
            direction: 'friend_paid_you', notes: 'Group payment',
          }],
          activities: [],
        },
        error: null,
      }),
    });

    const detail = await readModel.getDetail('current-user', 'friend-a');
    expect(detail).toMatchObject({
      friend: { balance: 15 },
      expenses: [],
      activity: [{
        id: 'group-settlement:group-settlement-1',
        type: 'settlement',
        groupId: 'group-alaska',
        groupName: 'Alaska 2026',
        operationId: 'operation-1',
        amount: 35,
      }],
    });
    expect(detail?.activity.filter(item => item.type === 'settlement')).toHaveLength(1);
  });

  it('surfaces a read-model failure to the existing error state', async () => {
    const readModel = createFriendDetailReadModel({
      rpc: async () => ({ data: null, error: { message: 'Read model unavailable' } }),
    });

    await expect(readModel.getDetail('current-user', 'friend-a')).rejects.toThrow('Read model unavailable');
  });
});
