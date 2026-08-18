import { describe, expect, it, vi } from 'vitest';
import { settlementService } from '@/services/settlement-service';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}));

describe('settlement commit adapter', () => {
  it('sends one RPC request and maps a reused receipt', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        paymentIntentId: 'intent-1',
        reused: true,
        totalAmount: 30,
        currency: 'USD',
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
      totalAmount: 30,
      settlements: [{
        id: 'settlement-1',
        groupId: undefined,
        amount: 30,
      }],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('commit_combined_settlement', {
      p_payment_intent_id: 'intent-1',
      p_friend_id: 'friend-a',
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
    });
  });
});
