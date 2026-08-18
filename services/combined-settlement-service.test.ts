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
      totalAmount: 10,
      currency: 'USD',
      settlements: [],
    })).toBe(true);
    expect(shouldLogSettlementActivity({
      paymentIntentId: 'intent-1',
      reused: true,
      totalAmount: 10,
      currency: 'USD',
      settlements: [],
    })).toBe(false);
  });

  it('commits the planned allocations and returns one allocation receipt', async () => {
    const commit = vi.fn(async (request) => ({
      paymentIntentId: request.paymentIntentId,
      reused: false,
      totalAmount: request.amount,
      currency: request.currency,
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
      totalAmount: 30,
      currency: 'USD',
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
});
