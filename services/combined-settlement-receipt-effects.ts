import { activityService } from './activity-service';
import type { CombinedSettlementReceipt } from './combined-settlement-service';
import { shouldLogSettlementActivity } from './combined-settlement-service';
import { applyScopeTransferToGroupReadModel, applySettlementToGroupReadModel, type GroupDetailReadModel } from './group-detail-read-model';
import { queryKeys } from './query-keys';
import { getFriendRelationshipInvalidationKeys } from './friend-relationship-invalidation';
import type { User } from '@/types/database';

type ReceiptEffectsQueryClient = {
  invalidateQueries(options: { queryKey: readonly unknown[] }): Promise<unknown>;
  setQueryData<T>(queryKey: readonly unknown[], updater: (current: T | undefined) => T): void;
};

type ReceiptEffectsParams = {
  receipt: CombinedSettlementReceipt;
  currentUserId: string;
  friend: User;
  currentUser: User;
  queryClient: ReceiptEffectsQueryClient;
};

export async function applyCombinedSettlementReceiptEffects({
  receipt,
  currentUserId,
  friend,
  currentUser,
  queryClient,
}: ReceiptEffectsParams): Promise<void> {
  const settledGroupIds = [...new Set(
    receipt.settlements.flatMap(settlement => settlement.groupId ? [settlement.groupId] : [])
  )];
  const affectedGroupIds = [...new Set([
    ...settledGroupIds,
    ...(receipt.affectedGroupIds ?? []),
    ...(receipt.transfers ?? []).map(transfer => transfer.groupId),
  ])];

  await invalidateSafely(queryClient, [
    ...getFriendRelationshipInvalidationKeys(currentUserId, friend.id),
    queryKeys.groups.list(currentUserId),
  ]);

  if (shouldLogSettlementActivity(receipt)) {
    try {
      for (const settlement of receipt.settlements) {
        const currentUserPaid = settlement.fromUserId === currentUserId;
        await activityService.logSettlementCreated({
          settlementId: settlement.id,
          fromUserId: settlement.fromUserId,
          fromUserName: currentUserPaid ? currentUser.name : friend.name,
          toUserName: currentUserPaid ? friend.name : currentUser.name,
          amount: settlement.amount,
          groupId: settlement.groupId,
        });
      }
    } catch (error) {
      console.warn('Settlement activity logging failed after commit:', error);
    }
  }

  for (const groupId of affectedGroupIds) {
    const groupSettlements = receipt.settlements.filter(settlement => settlement.groupId === groupId);
    try {
      queryClient.setQueryData<GroupDetailReadModel | null>(
        queryKeys.groups.detail(currentUserId, groupId),
        current => {
          const withSettlements = groupSettlements.reduce(
            (model, settlement) => model ? applySettlementToGroupReadModel(model, settlement) : model,
            current ?? null,
          );
          return (receipt.transfers ?? [])
            .filter(transfer => transfer.groupId === groupId)
            .reduce(
              (model, transfer) => model ? applyScopeTransferToGroupReadModel(model, transfer) : model,
              withSettlements,
            );
        }
      );
    } catch (error) {
      console.warn(`Group ${groupId} cache update failed after settlement commit:`, error);
    }
  }

  await invalidateSafely(queryClient, [
    ...affectedGroupIds.map(groupId => queryKeys.groups.detail(currentUserId, groupId)),
    queryKeys.activity.list(currentUserId),
  ]);
}

async function invalidateSafely(
  queryClient: ReceiptEffectsQueryClient,
  queryKeysToInvalidate: readonly (readonly unknown[])[],
): Promise<void> {
  try {
    await Promise.all(queryKeysToInvalidate.map(queryKey => queryClient.invalidateQueries({ queryKey })));
  } catch (error) {
    console.warn('Settlement cache invalidation failed after commit:', error);
  }
}
