import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settlementService } from '@/services/settlement-service';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}));

describe('settlement commit adapter', () => {
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

    await expect(settlementService.reverse('operation-1')).resolves.toEqual({
      operationId: 'operation-1',
      status: 'reversed',
      reversedAt: Date.parse('2026-08-18T04:00:00.000Z'),
      reused: false,
    });

    expect(rpc).toHaveBeenCalledWith('reverse_settlement_operation', {
      p_operation_id: 'operation-1',
    });
  });

  it('maps an unauthorized reversal to the shared settlement error', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'SETTLEMENT_REVERSAL_UNAUTHORIZED' },
    });

    await expect(settlementService.reverse('operation-2')).rejects.toMatchObject({
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

    await expect(settlementService.reverse('operation-3')).rejects.toThrow(/invalid receipt/i);
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
