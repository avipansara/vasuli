import type { SettlementScopeTransfer } from '@/types/database';
import { friendDetailModule } from './friend-detail-module';
import { settlementModule } from './settlement-service';
import type { QueryCacheAdapter, QueryCacheKey } from './query-cache-adapter';

type FriendDetail = Awaited<ReturnType<typeof friendDetailModule.getDetail>>;
type SettlementReverseParams = Parameters<typeof settlementModule.reverse>[0];
type SettlementReverseResult = Awaited<ReturnType<typeof settlementModule.reverse>>;

export type GroupDetailSettlementMutationDependencies = {
  getFriendDetail: (currentUserId: string, friendId: string) => Promise<FriendDetail>;
  reverse: (params: SettlementReverseParams) => Promise<SettlementReverseResult>;
};

const defaultDependencies: GroupDetailSettlementMutationDependencies = {
  getFriendDetail: friendDetailModule.getDetail,
  reverse: settlementModule.reverse,
};

export type ReverseGroupDetailTransferParams = {
  transfer: SettlementScopeTransfer;
  currentUserId: string;
  groupDetailKey: QueryCacheKey;
  cache: Pick<QueryCacheAdapter, 'invalidate'>;
  queryClient: SettlementReverseParams['queryClient'];
};

export type GroupDetailTransferMutationResult =
  | { status: 'ignored' }
  | SettlementReverseResult;

function canReverseTransfer(transfer: SettlementScopeTransfer, currentUserId: string): boolean {
  return !transfer.isReversal && (
    transfer.fromUserId === currentUserId || transfer.toUserId === currentUserId
  );
}

export function createGroupDetailSettlementMutation(
  dependencies: GroupDetailSettlementMutationDependencies = defaultDependencies,
) {
  return {
    canReverseTransfer,

    async reverseTransfer(
      params: ReverseGroupDetailTransferParams,
    ): Promise<GroupDetailTransferMutationResult> {
      const { transfer } = params;
      if (!canReverseTransfer(transfer, params.currentUserId)) {
        return { status: 'ignored' };
      }

      const friendId = transfer.fromUserId === params.currentUserId
        ? transfer.toUserId
        : transfer.fromUserId;
      const friendDetail = await dependencies.getFriendDetail(params.currentUserId, friendId);
      const expectedBalance = friendDetail?.relationship.totalsByCurrency
        .find(total => total.currency === transfer.currency)?.amount ?? 0;

      const result = await dependencies.reverse({
        operationId: transfer.operationId,
        expectedBalance,
        currentUserId: params.currentUserId,
        friendId,
        queryClient: params.queryClient,
      });
      try {
        await params.cache.invalidate(params.groupDetailKey);
      } catch (error) {
        console.warn('Group detail cache invalidation failed after settlement reversal:', error);
      }
      return result;
    },
  };
}

export const groupDetailSettlementMutation = createGroupDetailSettlementMutation();
