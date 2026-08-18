import { describe, expect, it, vi } from 'vitest';
import type { Settlement } from '@/types/database';
import type { FriendGroupBalanceSummary } from '@/services/friend-detail-service';
import { createCombinedSettlementService } from '@/services/combined-settlement-service';

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
  it('commits the planned allocations and returns one allocation receipt', async () => {
    const create = vi.fn(async (input: Omit<Settlement, 'id' | 'createdAt'>) => settlement({
      ...input,
      id: input.groupId ? 'group-settlement' : 'direct-settlement',
      createdAt: input.date,
    }));
    const service = createCombinedSettlementService({ create });

    await expect(service.commit({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      amount: 30,
      currency: 'USD',
      date: 100,
      directBalance: -10,
      groupBalances,
    })).resolves.toEqual({
      totalAmount: 30,
      currency: 'USD',
      settlements: [
        settlement({ id: 'direct-settlement', amount: 10, date: 100 }),
        settlement({ id: 'group-settlement', groupId: 'group-1', amount: 20, date: 100 }),
      ],
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      groupId: undefined,
      fromUserId: 'current-user',
      toUserId: 'friend-a',
      amount: 10,
      currency: 'USD',
      date: 100,
    });
  });

  it('does not persist when planning rejects the combined payment', async () => {
    const create = vi.fn();
    const service = createCombinedSettlementService({ create });

    await expect(service.commit({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      amount: 30,
      currency: 'USD',
      date: 100,
      directBalance: -10,
      groupBalances: [{ ...groupBalances[0], currency: 'EUR' }],
    })).rejects.toThrow(/currenc/i);

    expect(create).not.toHaveBeenCalled();
  });
});
