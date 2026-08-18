import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCombinedSettlementReceiptEffects } from '@/services/combined-settlement-receipt-effects';
import { activityService } from '@/services/activity-service';

vi.mock('@/services/activity-service', () => ({
  activityService: {
    logSettlementCreated: vi.fn(),
  },
}));

const receipt = (reused: boolean) => ({
  paymentIntentId: 'intent-1',
  reused,
  committedAt: 1,
  totalAmount: 30,
  currency: 'USD',
  direction: 'you_paid_friend' as const,
  settlements: [{
    id: 'settlement-1',
    groupId: 'group-1',
    fromUserId: 'current-user',
    toUserId: 'friend-1',
    amount: 30,
    currency: 'USD',
    date: 1,
    createdAt: 1,
  }],
});

function queryClient() {
  return {
    invalidateQueries: vi.fn(async () => undefined),
    setQueryData: vi.fn(),
  };
}

const currentUser = { id: 'current-user', name: 'Alex', isActive: true, createdAt: 1 };
const friend = { id: 'friend-1', name: 'Sam', isActive: true, createdAt: 1 };

describe('applyCombinedSettlementReceiptEffects', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates all affected caches and logs activity for a new receipt', async () => {
    const client = queryClient();

    await applyCombinedSettlementReceiptEffects({
      receipt: receipt(false),
      currentUserId: 'current-user',
      currentUser,
      friend,
      queryClient: client,
    });

    expect(activityService.logSettlementCreated).toHaveBeenCalledTimes(1);
    expect(client.setQueryData).toHaveBeenCalledTimes(1);
    expect(client.invalidateQueries).toHaveBeenCalledTimes(4);
  });

  it('does not duplicate activity for a reused receipt', async () => {
    const client = queryClient();

    await expect(applyCombinedSettlementReceiptEffects({
      receipt: receipt(true),
      currentUserId: 'current-user',
      currentUser,
      friend,
      queryClient: client,
    })).resolves.toBeUndefined();

    expect(activityService.logSettlementCreated).not.toHaveBeenCalled();
    expect(client.setQueryData).toHaveBeenCalledTimes(1);
    expect(client.invalidateQueries).toHaveBeenCalledTimes(4);
  });

  it('does not fail a committed receipt when activity logging fails', async () => {
    vi.mocked(activityService.logSettlementCreated).mockRejectedValueOnce(new Error('activity unavailable'));
    const client = queryClient();

    await expect(applyCombinedSettlementReceiptEffects({
      receipt: receipt(false),
      currentUserId: 'current-user',
      currentUser,
      friend,
      queryClient: client,
    })).resolves.toBeUndefined();
  });
});
