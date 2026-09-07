import { describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import { settlementOperationMetadataService } from './settlement-operation-metadata-service';

describe('settlement operation metadata reads', () => {
  it('maps authoritative incoming payer/date/amount metadata without actor inference', async () => {
    rpc.mockResolvedValueOnce({ data: [{
      operation_id: 'op-1', status: 'reversed', created_at: '2026-09-01T10:00:00Z',
      reversed_at: '2026-09-02T10:00:00Z', requested_payment_amount: 7,
      currency: 'USD', actor_user_id: 'actor', friend_user_id: 'friend',
      original_date: '2026-08-01T10:00:00Z', original_from_user_id: 'friend', original_to_user_id: 'actor',
    }], error: null });

    await expect(settlementOperationMetadataService.getByFriend('friend')).resolves.toEqual([expect.objectContaining({
      operationId: 'op-1', requestedPaymentAmount: 7,
      fromUserId: 'friend', toUserId: 'actor',
      originalDate: Date.parse('2026-08-01T10:00:00Z'),
    })]);
  });

  it('keeps Group metadata local and does not invent a global payment amount', async () => {
    rpc.mockResolvedValueOnce({ data: [{
      operation_id: 'op-2', status: 'committed', created_at: '2026-09-01T10:00:00Z',
      currency: 'USD', group_id: 'group-1', local_payment_amount: 8,
      local_date: '2026-08-15T10:00:00Z', local_from_user_id: 'a', local_to_user_id: 'b',
    }], error: null });

    const [metadata] = await settlementOperationMetadataService.getByGroup('group-1');
    expect(metadata).toMatchObject({ groupId: 'group-1', localCashAmount: 8, localFromUserId: 'a', localToUserId: 'b' });
    expect(metadata.requestedPaymentAmount).toBeUndefined();
    expect(metadata.fromUserId).toBeUndefined();
  });

  it('propagates authorized read errors without fabricating metadata', async () => {
    const error = new Error('permission denied');
    rpc.mockResolvedValueOnce({ data: null, error });
    await expect(settlementOperationMetadataService.getByFriend('friend')).rejects.toBe(error);
  });
});
