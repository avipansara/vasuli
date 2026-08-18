import { describe, expect, it } from 'vitest';
import { buildCombinedSettlementAllocations } from '@/services/friend-settlement-allocation';

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
});
