import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { User, Settlement } from '@/types/database';
import type { FriendGroupBalanceSummary } from '@/services/friend-detail-service';
import { settlementModule, settlementService, shouldLogSettlementActivity } from '@/services/settlement-service';
import { queryKeys } from '@/services/query-keys';

const rpc = vi.hoisted(() => vi.fn());
const logSettlementCreated = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}));

vi.mock('@/services/activity-service', () => ({
  activityService: {
    logSettlementCreated,
  },
}));

const currentUser: User = {
  id: 'current-user',
  name: 'Current User',
  email: 'current@example.com',
  isActive: true,
  createdAt: Date.now(),
};

const friend: User = {
  id: 'friend-a',
  name: 'Friend A',
  email: 'friend@example.com',
  isActive: true,
  createdAt: Date.now(),
};

const settlement = (input: Partial<Settlement>): Settlement => ({
  id: input.id ?? 'settlement',
  operationId: input.operationId,
  groupId: input.groupId,
  fromUserId: input.fromUserId ?? 'current-user',
  toUserId: input.toUserId ?? 'friend-a',
  amount: input.amount ?? 0,
  currency: input.currency ?? 'USD',
  date: input.date ?? Date.parse('2026-08-18T03:00:00.000Z'),
  notes: input.notes,
  createdAt: input.createdAt ?? Date.parse('2026-08-18T03:00:00.000Z'),
});

const rawSettlement = (input: Partial<{
  id: string;
  groupId: string | null;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  date: string;
  createdAt: string;
}>) => ({
  id: input.id ?? 'settlement',
  groupId: input.groupId ?? null,
  fromUserId: input.fromUserId ?? 'current-user',
  toUserId: input.toUserId ?? 'friend-a',
  amount: input.amount ?? 0,
  currency: input.currency ?? 'USD',
  date: input.date ?? '2026-08-18T03:00:00.000Z',
  createdAt: input.createdAt ?? '2026-08-18T03:00:00.000Z',
});

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

describe('settlementModule.preview', () => {

  it('transfers an opposing group balance before allocating the net payment', () => {
    expect(settlementModule.preview({
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
    expect(settlementModule.preview({
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
    expect(settlementModule.preview({
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
    const plan = settlementModule.preview({
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
    expect(settlementModule.preview({
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

  it('allocates the verified partial mixed-scope fixture in the net direction', () => {
    expect(settlementModule.preview({
      currentUserId: 'current-user',
      friendId: 'friend-a',
      currency: 'USD',
      amount: 5,
      directBalance: -30,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: 20,
        direction: 'you_are_owed',
      }],
    })).toEqual({
      transfers: [],
      allocations: [{
        groupId: undefined,
        fromUserId: 'current-user',
        toUserId: 'friend-a',
        amount: 5,
        currency: 'USD',
      }],
    });
  });

  it('offsets opposing scopes only when the full net payment settles every scope', () => {
    expect(settlementModule.preview({
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

describe('shouldLogSettlementActivity', () => {
  it('returns true for a newly committed receipt', () => {
    expect(shouldLogSettlementActivity({
      paymentIntentId: 'intent-1',
      reused: false,
      committedAt: 1,
      totalAmount: 10,
      currency: 'USD',
      direction: 'you_paid_friend',
      settlements: [],
    })).toBe(true);
  });

  it('returns false for a reused receipt', () => {
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
});

describe('settlementModule.reverse', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('reverses an operation and invalidates relationship caches', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        operationId: 'operation-1',
        status: 'reversed',
        reversedAt: '2026-08-18T04:00:00.000Z',
        reused: false,
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const result = await settlementModule.reverse({
      operationId: 'operation-1',
      expectedBalance: 15,
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      queryClient,
    });

    expect(result).toEqual({
      operationId: 'operation-1',
      status: 'reversed',
      reversedAt: Date.parse('2026-08-18T04:00:00.000Z'),
      reused: false,
    });

    expect(rpc).toHaveBeenCalledWith('reverse_settlement_operation', {
      p_operation_id: 'operation-1',
      p_expected_balance: 15,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.friends.home(currentUser.id) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.friends.detail(currentUser.id, 'friend-a') });

    invalidateSpy.mockRestore();
  });

  it('maps a stale balance RPC error to a typed CombinedSettlementError', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'SETTLEMENT_STALE_BALANCE' },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(settlementModule.reverse({
      operationId: 'operation-stale',
      expectedBalance: 15,
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      queryClient,
    })).rejects.toMatchObject({ code: 'stale_balance' });
  });

  it('passes a zero expected balance through to the RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        operationId: 'operation-zero',
        status: 'reversed',
        reversedAt: '2026-08-18T04:00:00.000Z',
        reused: false,
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await settlementModule.reverse({
      operationId: 'operation-zero',
      expectedBalance: 0,
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      queryClient,
    });

    expect(rpc).toHaveBeenCalledWith('reverse_settlement_operation', {
      p_operation_id: 'operation-zero',
      p_expected_balance: 0,
    });
  });

  it('maps a repeated reversal receipt without issuing a second command', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        operationId: 'operation-repeated',
        status: 'reversed',
        reversedAt: '2026-08-18T04:00:00.000Z',
        reused: true,
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(settlementModule.reverse({
      operationId: 'operation-repeated',
      expectedBalance: 0,
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      queryClient,
    })).resolves.toEqual({
      operationId: 'operation-repeated',
      status: 'reversed',
      reversedAt: Date.parse('2026-08-18T04:00:00.000Z'),
      reused: true,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('settlementModule.commit', () => {
  beforeEach(() => {
    rpc.mockReset();
    logSettlementCreated.mockReset();
  });

  it('commits the planned allocations and returns one allocation receipt', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-1',
        reused: false,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 30,
        currency: 'USD',
        direction: 'you_paid_friend',
        settlements: [
          rawSettlement({ id: 'direct-settlement', amount: 10 }),
          rawSettlement({ id: 'group-settlement', groupId: 'group-1', amount: 20 }),
        ],
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-1',
      amount: 30,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: -30,
      directBalance: -10,
      groupBalances,
      friend,
      currentUser,
      queryClient,
    })).resolves.toEqual({
      paymentIntentId: 'intent-1',
      reused: false,
      committedAt: Date.parse('2026-08-18T03:00:00.000Z'),
      totalAmount: 30,
      currency: 'USD',
      direction: 'you_paid_friend',
      settlements: [
        settlement({ id: 'direct-settlement', amount: 10 }),
        settlement({ id: 'group-settlement', groupId: 'group-1', amount: 20 }),
      ],
      mode: 'all_balances',
      affectedGroupIds: ['group-1'],
      transfers: [],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('commit_settlement_operation', {
      p_payment_intent_id: 'intent-1',
      p_friend_id: 'friend-a',
      p_group_id: null,
      p_mode: 'all_balances',
      p_amount: 30,
      p_currency: 'USD',
      p_date: '2026-08-18T03:00:00.000Z',
      p_expected_balance: -30,
      p_allocations: [
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
      p_transfers: [],
    });
  });

  it('does not persist when planning rejects the combined payment', async () => {
    await expect(settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-1',
      amount: 30,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: -30,
      directBalance: -10,
      groupBalances: [{ ...groupBalances[0], currency: 'EUR' }],
      friend,
      currentUser,
      queryClient: new QueryClient(),
    })).rejects.toThrow(/currenc/i);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses scope transfers when direct and group balances point in opposite directions', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-opposite',
        reused: false,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 2,
        currency: 'USD',
        direction: 'friend_paid_you',
        settlements: [],
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-opposite',
      amount: 2,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: 2,
      directBalance: 10,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: -8,
        direction: 'you_owe',
      }],
      friend,
      currentUser,
      queryClient,
    });

    expect(rpc).toHaveBeenCalledWith('commit_settlement_operation', expect.objectContaining({
      p_allocations: [{
        groupId: undefined,
        fromUserId: 'friend-a',
        toUserId: 'current-user',
        amount: 2,
        currency: 'USD',
      }],
      p_transfers: [{
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
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-positive-group',
        reused: false,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 2,
        currency: 'USD',
        direction: 'friend_paid_you',
        settlements: [],
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-positive-group',
      amount: 2,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: 5,
      directBalance: 0,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Lunch',
        currency: 'USD',
        amount: 5,
        direction: 'you_are_owed',
      }],
      friend,
      currentUser,
      queryClient,
    });

    expect(rpc).toHaveBeenCalledWith('commit_settlement_operation', expect.objectContaining({
      p_allocations: [{
        groupId: 'group-1',
        fromUserId: 'friend-a',
        toUserId: 'current-user',
        amount: 2,
        currency: 'USD',
      }],
    }));
  });

  it('logs activity, updates group read model, and invalidates caches for a new receipt', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-effects',
        reused: false,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 30,
        currency: 'USD',
        direction: 'you_paid_friend',
        settlements: [{
          id: 'settlement-1',
          groupId: 'group-1',
          fromUserId: 'current-user',
          toUserId: 'friend-a',
          amount: 30,
          currency: 'USD',
          date: '2026-08-18T03:00:00.000Z',
          createdAt: '2026-08-18T03:00:00.000Z',
        }],
        affectedGroupIds: ['group-1'],
        transfers: [],
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setDataSpy = vi.spyOn(queryClient, 'setQueryData');

    await settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-effects',
      amount: 30,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: -30,
      directBalance: -30,
      groupBalances: [],
      friend,
      currentUser,
      queryClient,
    });

    expect(logSettlementCreated).toHaveBeenCalledTimes(1);
    expect(setDataSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.friends.home(currentUser.id) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.friends.detail(currentUser.id, 'friend-a') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.groups.list(currentUser.id) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.activity.list(currentUser.id) });

    invalidateSpy.mockRestore();
    setDataSpy.mockRestore();
  });

  it('does not log activity for a reused receipt', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-reused',
        reused: true,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 30,
        currency: 'USD',
        direction: 'you_paid_friend',
        settlements: [{
          id: 'settlement-1',
          groupId: 'group-1',
          fromUserId: 'current-user',
          toUserId: 'friend-a',
          amount: 30,
          currency: 'USD',
          date: '2026-08-18T03:00:00.000Z',
          createdAt: '2026-08-18T03:00:00.000Z',
        }],
        affectedGroupIds: ['group-1'],
        transfers: [],
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-reused',
      amount: 30,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: -30,
      directBalance: -30,
      groupBalances: [],
      friend,
      currentUser,
      queryClient,
    });

    expect(logSettlementCreated).not.toHaveBeenCalled();
  });

  it('does not fail a committed receipt when activity logging fails', async () => {
    logSettlementCreated.mockRejectedValueOnce(new Error('activity unavailable'));
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-log-fail',
        reused: false,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 30,
        currency: 'USD',
        direction: 'you_paid_friend',
        settlements: [{
          id: 'settlement-1',
          groupId: 'group-1',
          fromUserId: 'current-user',
          toUserId: 'friend-a',
          amount: 30,
          currency: 'USD',
          date: '2026-08-18T03:00:00.000Z',
          createdAt: '2026-08-18T03:00:00.000Z',
        }],
        affectedGroupIds: ['group-1'],
        transfers: [],
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-log-fail',
      amount: 30,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: -30,
      directBalance: -30,
      groupBalances: [],
      friend,
      currentUser,
      queryClient,
    })).resolves.toBeDefined();
  });

  it('maps a stale balance RPC error to a typed CombinedSettlementError', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'SETTLEMENT_STALE_BALANCE' },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-stale',
      amount: 10,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: -10,
      directBalance: -10,
      groupBalances: [],
      friend,
      currentUser,
      queryClient,
    })).rejects.toMatchObject({ code: 'stale_balance' });

    expect(logSettlementCreated).not.toHaveBeenCalled();
  });

  it('commits a zero-net settlement through the transfer-only RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-zero-net',
        reused: false,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 0,
        currency: 'USD',
        direction: 'you_paid_friend',
        settlements: [],
        operationId: 'operation-zero-net',
        mode: 'all_balances',
        affectedGroupIds: ['group-1'],
        transfers: [],
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-zero-net',
      amount: 0,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: 0,
      directBalance: 8,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: -8,
        direction: 'you_owe',
      }],
      friend,
      currentUser,
      queryClient,
    })).resolves.toMatchObject({
      operationId: 'operation-zero-net',
      totalAmount: 0,
      affectedGroupIds: ['group-1'],
    });

    expect(rpc).toHaveBeenCalledWith('commit_zero_net_settlement_operation', expect.objectContaining({
      p_payment_intent_id: 'intent-zero-net',
      p_expected_balance: 0,
      p_transfers: [expect.objectContaining({ groupId: 'group-1' })],
    }));
  });

  it('commits a group-scoped settlement with the group mode', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-group',
        reused: false,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 20,
        currency: 'USD',
        direction: 'you_paid_friend',
        settlements: [rawSettlement({ id: 'group-settlement', groupId: 'group-1', amount: 20 })],
        mode: 'group',
        affectedGroupIds: ['group-1'],
        transfers: [],
      },
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await settlementModule.commit({
      currentUserId: currentUser.id,
      friendId: 'friend-a',
      paymentIntentId: 'intent-group',
      amount: 20,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: -20,
      directBalance: 0,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: -20,
        direction: 'you_owe',
      }],
      mode: 'group',
      groupId: 'group-1',
      friend,
      currentUser,
      queryClient,
    });

    expect(rpc).toHaveBeenCalledWith('commit_settlement_operation', expect.objectContaining({
      p_mode: 'group',
      p_group_id: 'group-1',
    }));
  });

});

describe('settlementService.commit adapter', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('sends one RPC request and maps a reused receipt', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-1',
        reused: true,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 30,
        currency: 'USD',
        direction: 'you_paid_friend',
        settlements: [{
          id: 'settlement-1',
          groupId: null,
          fromUserId: 'current-user',
          toUserId: 'friend-a',
          amount: 30,
          currency: 'USD',
          date: '2026-08-18T03:00:00.000Z',
          notes: null,
          createdAt: '2026-08-18T03:00:00.000Z',
        }],
      },
      error: null,
    });

    await expect(settlementService.commit({
      paymentIntentId: 'intent-1',
      friendId: 'friend-a',
      amount: 30,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: 30,
      allocations: [{
        groupId: undefined,
        fromUserId: 'current-user',
        toUserId: 'friend-a',
        amount: 30,
        currency: 'USD',
      }],
    })).resolves.toMatchObject({
      paymentIntentId: 'intent-1',
      reused: true,
      committedAt: Date.parse('2026-08-18T03:00:00.000Z'),
      totalAmount: 30,
      direction: 'you_paid_friend',
      settlements: [{
        id: 'settlement-1',
        groupId: undefined,
        amount: 30,
      }],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('commit_settlement_operation', {
      p_payment_intent_id: 'intent-1',
      p_friend_id: 'friend-a',
      p_group_id: null,
      p_mode: 'all_balances',
      p_amount: 30,
      p_currency: 'USD',
      p_date: '2026-08-18T03:00:00.000Z',
      p_expected_balance: 30,
      p_allocations: [{
        groupId: undefined,
        fromUserId: 'current-user',
        toUserId: 'friend-a',
        amount: 30,
        currency: 'USD',
      }],
      p_transfers: [],
    });
  });

  it('maps unknown RPC failures to a retryable transient outcome', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('network unavailable') });

    await expect(settlementService.commit({
      paymentIntentId: 'intent-2',
      friendId: 'friend-a',
      amount: 30,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: 30,
      allocations: [],
    })).rejects.toMatchObject({ code: 'transient' });
  });

  it('uses the transfer-only RPC for a zero-net operation', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-zero',
        reused: false,
        committedAt: '2026-08-18T03:00:00.000Z',
        totalAmount: 0,
        currency: 'USD',
        direction: 'you_paid_friend',
        settlements: [],
        operationId: 'operation-zero',
        mode: 'all_balances',
        affectedGroupIds: ['group-1'],
        transfers: [],
      },
      error: null,
    });

    await expect(settlementService.commit({
      paymentIntentId: 'intent-zero',
      friendId: 'friend-a',
      amount: 0,
      currency: 'USD',
      date: Date.parse('2026-08-18T03:00:00.000Z'),
      expectedBalance: 0,
      allocations: [],
      transfers: [{
        groupId: 'group-1',
        fromUserId: 'current-user',
        toUserId: 'friend-a',
        amount: 8,
        currency: 'USD',
        signedGroupBalanceDelta: 8,
      }],
    })).resolves.toMatchObject({
      operationId: 'operation-zero',
      totalAmount: 0,
      affectedGroupIds: ['group-1'],
    });

    expect(rpc).toHaveBeenCalledWith('commit_zero_net_settlement_operation', {
      p_payment_intent_id: 'intent-zero',
      p_friend_id: 'friend-a',
      p_currency: 'USD',
      p_date: '2026-08-18T03:00:00.000Z',
      p_expected_balance: 0,
      p_transfers: [{
        groupId: 'group-1',
        fromUserId: 'current-user',
        toUserId: 'friend-a',
        amount: 8,
        currency: 'USD',
        signedGroupBalanceDelta: 8,
      }],
    });
  });
});

describe('settlementService.reverse adapter', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('reverses a settlement operation through the operation-level RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        operationId: 'operation-1',
        status: 'reversed',
        reversedAt: '2026-08-18T04:00:00.000Z',
        reused: false,
      },
      error: null,
    });

    await expect(settlementService.reverse('operation-1', 0)).resolves.toEqual({
      operationId: 'operation-1',
      status: 'reversed',
      reversedAt: Date.parse('2026-08-18T04:00:00.000Z'),
      reused: false,
    });

    expect(rpc).toHaveBeenCalledWith('reverse_settlement_operation', {
      p_operation_id: 'operation-1',
      p_expected_balance: 0,
    });
  });

  it('maps an unauthorized reversal to the shared settlement error', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'SETTLEMENT_REVERSAL_UNAUTHORIZED' },
    });

    await expect(settlementService.reverse('operation-2', 0)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects a reversal receipt with an invalid timestamp', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        operationId: 'operation-3',
        status: 'reversed',
        reversedAt: 'not-a-date',
        reused: false,
      },
      error: null,
    });

    await expect(settlementService.reverse('operation-3', 0)).rejects.toThrow(/invalid receipt/i);
  });
});
