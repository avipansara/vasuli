import { describe, expect, it } from 'vitest';
import {
  buildCombinedSettlementAllocations,
  buildCombinedSettlementPlan,
} from '@/services/friend-settlement-allocation';

describe('buildCombinedSettlementAllocations', () => {
  it('supports a direct-only payment', () => {
    expect(buildCombinedSettlementAllocations({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 12.34,
      directBalance: -12.34,
      groupBalances: [],
    })).toEqual([{
      groupId: undefined,
      fromUserId: 'current-user',
      toUserId: 'avee',
      amount: 12.34,
      currency: 'USD',
    }]);
  });

  it('supports a Group-only payment', () => {
    expect(buildCombinedSettlementAllocations({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 25,
      directBalance: 0,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: 25,
        direction: 'you_are_owed',
      }],
    })).toEqual([{
      groupId: 'group-1',
      fromUserId: 'avee',
      toUserId: 'current-user',
      amount: 25,
      currency: 'USD',
    }]);
  });

  it('allocates a payment to the direct balance before shared groups', () => {
    expect(buildCombinedSettlementAllocations({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 500,
      directBalance: -34.5,
      groupBalances: [
        { groupId: 'alaska', groupName: 'Alaska 2026', currency: 'USD', amount: -947.12, direction: 'you_owe', lastActivityAt: 20 },
        { groupId: 'roommates', groupName: 'Roommates', currency: 'USD', amount: -45, direction: 'you_owe', lastActivityAt: 10 },
      ],
    })).toEqual([
      { groupId: undefined, fromUserId: 'current-user', toUserId: 'avee', amount: 34.5, currency: 'USD' },
      { groupId: 'roommates', fromUserId: 'current-user', toUserId: 'avee', amount: 45, currency: 'USD' },
      { groupId: 'alaska', fromUserId: 'current-user', toUserId: 'avee', amount: 420.5, currency: 'USD' },
    ]);
  });

  it('does not mix currencies into one payment allocation', () => {
    expect(() => buildCombinedSettlementAllocations({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 100,
      directBalance: -10,
      groupBalances: [{
        groupId: 'europe',
        groupName: 'Europe',
        currency: 'EUR',
        amount: -90,
        direction: 'you_owe',
      }],
    })).toThrow(/currenc/i);
  });

  it('rejects currencies outside the supported settlement allowlist', () => {
    expect(() => buildCombinedSettlementAllocations({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'XYZ',
      amount: 10,
      directBalance: -10,
      groupBalances: [],
    })).toThrow(/supported/i);
  });

  it('rejects sub-cent amounts instead of rounding them into a different payment', () => {
    expect(() => buildCombinedSettlementAllocations({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 10.001,
      directBalance: -20,
      groupBalances: [],
    })).toThrow(/two decimal/i);
  });

  it('rejects opposite-direction balances in the same payment', () => {
    expect(() => buildCombinedSettlementAllocations({
      currentUserId: 'current-user',
      friendId: 'avee',
      currency: 'USD',
      amount: 10,
      directBalance: -20,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: 20,
        direction: 'you_are_owed',
      }],
    })).toThrow(/opposite/i);
  });

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
