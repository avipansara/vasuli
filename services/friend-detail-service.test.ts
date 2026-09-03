import { describe, expect, it } from 'vitest';
import { projectFriendRelationship } from '@/services/friend-detail-service';
import type { User } from '@/types/database';

const currentUserId = 'current-user';
const friendId = 'friend-a';

const friend: User = {
  id: friendId,
  name: 'Asha',
  isActive: true,
  createdAt: 1,
};

describe('projectFriendRelationship', () => {
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

  it('projects direct and shared Group balances into one currency-safe relationship view', () => {
    const projection = projectFriendRelationship({
      friend: { ...friend, balance: 40 },
      expenses: [{
        id: 'dinner',
        paidBy: currentUserId,
        amount: 80,
        date: 10,
        description: 'dinner',
        currency: 'USD',
        createdAt: 10,
        updatedAt: 10,
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
        id: 'dinner',
        paidBy: currentUserId,
        amount: 80,
        date: 10,
        description: 'dinner',
        currency: 'USD',
        createdAt: 10,
        updatedAt: 10,
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
        id: 'dinner',
        paidBy: friendId,
        amount: 80,
        date: 10,
        description: 'dinner',
        currency: 'USD',
        createdAt: 10,
        updatedAt: 10,
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
