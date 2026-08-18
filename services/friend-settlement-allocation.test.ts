import { describe, expect, it } from 'vitest';
import { buildCombinedSettlementPlan } from '@/services/friend-settlement-allocation';

describe('buildCombinedSettlementPlan', () => {

  it('transfers an opposing group balance before allocating the net payment', () => {
    expect(buildCombinedSettlementPlan({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 7,
      directBalance: 15,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: -8,
        direction: 'you_owe',
      }],
    })).toEqual({
      transfers: [{
        groupId: 'group-1',
        fromUserId: 'current-user',
        toUserId: 'avee',
        amount: 8,
        currency: 'USD',
        signedGroupBalanceDelta: 8,
      }],
      allocations: [{
        groupId: undefined,
        fromUserId: 'avee',
        toUserId: 'current-user',
        amount: 7,
        currency: 'USD',
      }],
    });
  });

  it('transfers an opposing group balance when direct is opposite to the total', () => {
    expect(buildCombinedSettlementPlan({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 5,
      directBalance: -5,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: 10,
        direction: 'you_are_owed',
      }],
    })).toEqual({
      transfers: [{
        groupId: 'group-1',
        fromUserId: 'avee',
        toUserId: 'current-user',
        amount: 10,
        currency: 'USD',
        signedGroupBalanceDelta: -10,
      }],
      allocations: [{
        groupId: undefined,
        fromUserId: 'avee',
        toUserId: 'current-user',
        amount: 5,
        currency: 'USD',
      }],
    });
  });

  it('transfers all scopes when the relationship is zero-net', () => {
    expect(buildCombinedSettlementPlan({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 0,
      directBalance: 8,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: -8,
        direction: 'you_owe',
      }],
    })).toEqual({
      transfers: [{
        groupId: 'group-1',
        fromUserId: 'current-user',
        toUserId: 'avee',
        amount: 8,
        currency: 'USD',
        signedGroupBalanceDelta: 8,
      }],
      allocations: [],
    });
  });

  it('transfers every group scope when direct balance is empty but groups offset', () => {
    const plan = buildCombinedSettlementPlan({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 2,
      directBalance: 0,
      groupBalances: [
        { groupId: 'group-1', groupName: 'Trip', currency: 'USD', amount: 10, direction: 'you_are_owed' },
        { groupId: 'group-2', groupName: 'Home', currency: 'USD', amount: -8, direction: 'you_owe' },
      ],
    });

    expect(plan.transfers).toHaveLength(2);
    expect(plan.transfers).toEqual(expect.arrayContaining([
      {
        groupId: 'group-1',
        fromUserId: 'avee',
        toUserId: 'current-user',
        amount: 10,
        currency: 'USD',
        signedGroupBalanceDelta: -10,
      },
      {
        groupId: 'group-2',
        fromUserId: 'current-user',
        toUserId: 'avee',
        amount: 8,
        currency: 'USD',
        signedGroupBalanceDelta: 8,
      },
    ]));
    expect(plan.allocations).toEqual([{
      groupId: undefined,
      fromUserId: 'avee',
      toUserId: 'current-user',
      amount: 2,
      currency: 'USD',
    }]);
  });

  it('keeps opposing scopes unchanged for a partial payment', () => {
    expect(buildCombinedSettlementPlan({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 20,
      directBalance: -20,
      groupBalances: [
        { groupId: 'trip', groupName: 'Trip 2026', currency: 'USD', amount: 5, direction: 'you_are_owed' },
        { groupId: 'roommates', groupName: 'Roommates', currency: 'USD', amount: -8, direction: 'you_owe' },
      ],
    })).toEqual({
      transfers: [],
      allocations: [{
        groupId: undefined,
        fromUserId: 'current-user',
        toUserId: 'avee',
        amount: 20,
        currency: 'USD',
      }],
    });
  });

  it('offsets opposing scopes only when the full net payment settles every scope', () => {
    expect(buildCombinedSettlementPlan({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 23,
      directBalance: -20,
      groupBalances: [
        { groupId: 'trip', groupName: 'Trip 2026', currency: 'USD', amount: 5, direction: 'you_are_owed' },
        { groupId: 'roommates', groupName: 'Roommates', currency: 'USD', amount: -8, direction: 'you_owe' },
      ],
    })).toEqual({
      transfers: [{
        groupId: 'trip',
        fromUserId: 'avee',
        toUserId: 'current-user',
        amount: 5,
        currency: 'USD',
        signedGroupBalanceDelta: -5,
      }],
      allocations: [
        {
          groupId: undefined,
          fromUserId: 'current-user',
          toUserId: 'avee',
          amount: 20,
          currency: 'USD',
        },
        {
          groupId: 'roommates',
          fromUserId: 'current-user',
          toUserId: 'avee',
          amount: 3,
          currency: 'USD',
        },
      ],
    });
  });
});
