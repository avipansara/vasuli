import { describe, expect, it, vi } from 'vitest';
import type { Settlement } from '@/types/database';
import type { FriendGroupBalanceSummary } from '@/services/friend-detail-service';
import { createCombinedSettlementService, shouldLogSettlementActivity } from '@/services/combined-settlement-service';

const groupBalances: FriendGroupBalanceSummary[] = [
  {
    groupId: 'group-1',
    groupName: 'Trip',
    currency: 'USD',
    amount: -20,
    direction: 'you_owe',
    lastActivityAt: 10,
  },
];

const settlement = (input: Partial<Settlement>): Settlement => ({
  id: input.id ?? 'settlement',
  groupId: input.groupId,
  fromUserId: input.fromUserId ?? 'current-user',
  toUserId: input.toUserId ?? 'friend-a',
  amount: input.amount ?? 0,
  currency: input.currency ?? 'USD',
  date: input.date ?? 100,
  createdAt: input.createdAt ?? 100,
});

describe('combined settlement service', () => {
  it('logs activity only for a newly committed receipt', () => {
    expect(shouldLogSettlementActivity({
      paymentIntentId: 'intent-1',
      reused: false,
      committedAt: 1,
      totalAmount: 10,
      currency: 'USD',
      direction: 'you_paid_friend' as const,
      settlements: [],
    })).toBe(true);
    expect(shouldLogSettlementActivity({
      paymentIntentId: 'intent-1',
      reused: true,
      committedAt: 1,
      totalAmount: 10,
      currency: 'USD',
      direction: 'you_paid_friend',
      settlements: [],
    })).toBe(false);
  });

  it('commits the planned allocations and returns one allocation receipt', async () => {
    const commit = vi.fn(async (request) => ({
      paymentIntentId: request.paymentIntentId,
      reused: false,
      committedAt: 1,
      totalAmount: request.amount,
      currency: request.currency,
      direction: 'you_paid_friend' as const,
      settlements: [
        settlement({ id: 'direct-settlement', amount: 10, date: 100 }),
        settlement({ id: 'group-settlement', groupId: 'group-1', amount: 20, date: 100 }),
      ],
    }));
    const service = createCombinedSettlementService({ commit });

    await expect(service.commit({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      paymentIntentId: 'intent-1',
      amount: 30,
      currency: 'USD',
      date: 100,
      expectedBalance: -30,
      directBalance: -10,
      groupBalances,
    })).resolves.toEqual({
      paymentIntentId: 'intent-1',
      reused: false,
      committedAt: 1,
      totalAmount: 30,
      currency: 'USD',
      direction: 'you_paid_friend',
      settlements: [
        settlement({ id: 'direct-settlement', amount: 10, date: 100 }),
        settlement({ id: 'group-settlement', groupId: 'group-1', amount: 20, date: 100 }),
      ],
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      paymentIntentId: 'intent-1',
      friendId: 'friend-a',
      amount: 30,
      currency: 'USD',
      date: 100,
      expectedBalance: -30,
      allocations: [
        {
          groupId: undefined,
          fromUserId: 'current-user',
          toUserId: 'friend-a',
          amount: 10,
          currency: 'USD',
        },
        {
          groupId: 'group-1',
          fromUserId: 'current-user',
          toUserId: 'friend-a',
          amount: 20,
          currency: 'USD',
        },
      ],
    });
  });

  it('does not persist when planning rejects the combined payment', async () => {
    const commit = vi.fn();
    const service = createCombinedSettlementService({ commit });

    await expect(service.commit({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      paymentIntentId: 'intent-1',
      amount: 30,
      currency: 'USD',
      date: 100,
      expectedBalance: -30,
      directBalance: -10,
      groupBalances: [{ ...groupBalances[0], currency: 'EUR' }],
    })).rejects.toThrow(/currenc/i);

    expect(commit).not.toHaveBeenCalled();
  });

  it('uses scope transfers when direct and group balances point in opposite directions', async () => {
    const commit = vi.fn(async request => ({
      paymentIntentId: request.paymentIntentId,
      reused: false,
      committedAt: 1,
      totalAmount: request.amount,
      currency: request.currency,
      direction: 'friend_paid_you' as const,
      settlements: [],
    }));
    const service = createCombinedSettlementService({ commit });

    await service.commit({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      paymentIntentId: 'intent-opposite',
      amount: 2,
      currency: 'USD',
      date: 100,
      expectedBalance: 2,
      directBalance: 10,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: -8,
        direction: 'you_owe',
      }],
    });

    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      allocations: [{
        groupId: undefined,
        fromUserId: 'friend-a',
        toUserId: 'current-user',
        amount: 2,
        currency: 'USD',
      }],
      transfers: [{
        groupId: 'group-1',
        fromUserId: 'current-user',
        toUserId: 'friend-a',
        amount: 8,
        currency: 'USD',
        signedGroupBalanceDelta: 8,
      }],
    }));
  });

  it('allocates a partial payment from the friend when the combined balance is positive', async () => {
    const commit = vi.fn(async request => ({
      paymentIntentId: request.paymentIntentId,
      reused: false,
      committedAt: 1,
      totalAmount: request.amount,
      currency: request.currency,
      direction: 'friend_paid_you' as const,
      settlements: [],
    }));
    const service = createCombinedSettlementService({ commit });

    await service.commit({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      paymentIntentId: 'intent-positive-group',
      amount: 2,
      currency: 'USD',
      date: 100,
      expectedBalance: 5,
      directBalance: 0,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Lunch',
        currency: 'USD',
        amount: 5,
        direction: 'you_are_owed',
      }],
    });

    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      allocations: [{
        groupId: 'group-1',
        fromUserId: 'friend-a',
        toUserId: 'current-user',
        amount: 2,
        currency: 'USD',
      }],
    }));
  });
});
