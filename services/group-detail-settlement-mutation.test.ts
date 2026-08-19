import { describe, expect, it, vi } from 'vitest';
import type { SettlementScopeTransfer } from '@/types/database';
import {
  createGroupDetailSettlementMutation,
  type GroupDetailSettlementMutationDependencies,
} from './group-detail-settlement-mutation';

const transfer: SettlementScopeTransfer = {
  id: 'transfer-1',
  operationId: 'operation-1',
  groupId: 'group-1',
  fromUserId: 'user-a',
  toUserId: 'user-b',
  currency: 'USD',
  signedGroupBalanceDelta: 12,
  createdAt: 1,
};

function createCache() {
  return {
    invalidate: vi.fn(async () => undefined),
  };
}

describe('Group detail SettlementScopeTransfer mutation', () => {
  it('delegates an eligible transfer with the current relationship Balance', async () => {
    const cache = createCache();
    const reverse = vi.fn<GroupDetailSettlementMutationDependencies['reverse']>(async () => ({
      operationId: transfer.operationId,
      status: 'reversed',
      reversedAt: 1,
      reused: false,
    }));
    const getFriendDetail = vi.fn<GroupDetailSettlementMutationDependencies['getFriendDetail']>();
    getFriendDetail.mockResolvedValue({
      relationship: { totalsByCurrency: [{ currency: 'USD', amount: 15 }] },
    } as unknown as Awaited<ReturnType<GroupDetailSettlementMutationDependencies['getFriendDetail']>>);
    const mutation = createGroupDetailSettlementMutation({ reverse, getFriendDetail });

    const result = await mutation.reverseTransfer({
      transfer,
      currentUserId: 'user-a',
      groupDetailKey: ['groups', 'detail', 'user-a', 'group-1'],
      cache,
      queryClient: {} as never,
    });

    expect(result).toEqual({
      operationId: transfer.operationId,
      status: 'reversed',
      reversedAt: 1,
      reused: false,
    });
    expect(getFriendDetail).toHaveBeenCalledWith('user-a', 'user-b');
    expect(reverse).toHaveBeenCalledWith({
      operationId: 'operation-1',
      expectedBalance: 15,
      currentUserId: 'user-a',
      friendId: 'user-b',
      queryClient: {},
    });
    expect(cache.invalidate).toHaveBeenCalledWith(['groups', 'detail', 'user-a', 'group-1']);
  });

  it('does not call persistence for reversed or unauthorized transfers', async () => {
    const reverse = vi.fn<GroupDetailSettlementMutationDependencies['reverse']>();
    const getFriendDetail = vi.fn<GroupDetailSettlementMutationDependencies['getFriendDetail']>();
    const mutation = createGroupDetailSettlementMutation({ reverse, getFriendDetail });
    const cache = createCache();

    await expect(mutation.reverseTransfer({
      transfer: { ...transfer, isReversal: true },
      currentUserId: 'user-a',
      groupDetailKey: ['group'],
      cache,
      queryClient: {} as never,
    })).resolves.toEqual({ status: 'ignored' });

    await expect(mutation.reverseTransfer({
      transfer,
      currentUserId: 'user-c',
      groupDetailKey: ['group'],
      cache,
      queryClient: {} as never,
    })).resolves.toEqual({ status: 'ignored' });

    expect(reverse).not.toHaveBeenCalled();
    expect(getFriendDetail).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it('propagates stale-Balance failures without refreshing Group detail', async () => {
    const cache = createCache();
    const staleError = new Error('stale balance');
    const reverse = vi.fn<GroupDetailSettlementMutationDependencies['reverse']>(async () => {
      throw staleError;
    });
    const getFriendDetail = vi.fn<GroupDetailSettlementMutationDependencies['getFriendDetail']>();
    getFriendDetail.mockResolvedValue({
      relationship: { totalsByCurrency: [{ currency: 'USD', amount: 15 }] },
    } as unknown as Awaited<ReturnType<GroupDetailSettlementMutationDependencies['getFriendDetail']>>);
    const mutation = createGroupDetailSettlementMutation({ reverse, getFriendDetail });

    await expect(mutation.reverseTransfer({
      transfer,
      currentUserId: 'user-a',
      groupDetailKey: ['group'],
      cache,
      queryClient: {} as never,
    })).rejects.toBe(staleError);

    expect(cache.invalidate).not.toHaveBeenCalled();
  });
});
