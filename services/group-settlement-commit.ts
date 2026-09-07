import { activityService } from './activity-service';
import { getFriendRelationshipInvalidationKeys } from './friend-relationship-invalidation';
import { applyCancellationToGroupReadModel, applySettlementToGroupReadModel, type GroupDetailReadModel } from './group-detail-read-model';
import { queryKeys } from './query-keys';
import { settlementService, type CombinedSettlementCommitRequest, type CombinedSettlementReceipt } from './settlement-service';
import type { User } from '@/types/database';

// ADR-0001: Group Settle creates `group`-mode settlement operations so every
// new group payment receives an operation ID and gains whole-operation Delete.
// Group creation stays group-only: exactly one cash allocation in this group
// and never any scope transfer. Truly historical legacy payments (no
// operation_id) keep their existing presentation and never gain operation
// deletion. The mutation boundary for deletion stays settlementModule.reverse;
// commit RPC contracts are unchanged.

export type GroupSettlementCommitRequestInput = {
  paymentIntentId: string;
  friendId: string;
  groupId: string;
  amount: number;
  currency: string;
  date: number;
  expectedBalance: number;
  fromUserId: string;
  toUserId: string;
};

function isWholeCent(amount: number): boolean {
  return Number.isFinite(amount) && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

/**
 * Build a group-only commit request for the existing
 * `commit_settlement_operation` boundary (`p_mode='group'`). Pure helper so
 * the route stays thin and the group-only invariant is unit-testable.
 */
export function buildGroupSettlementCommitRequest(
  input: GroupSettlementCommitRequestInput,
): CombinedSettlementCommitRequest {
  const { paymentIntentId, friendId, groupId, amount, currency, date, expectedBalance, fromUserId, toUserId } = input;
  if (!paymentIntentId || !friendId || !groupId || !currency) {
    throw new Error('A group settlement requires a payment intent, friend, group, and currency.');
  }
  if (!Number.isFinite(amount) || amount <= 0 || !isWholeCent(amount)) {
    throw new Error('Group settlement amount must be greater than zero and use at most two decimal places.');
  }
  if (!Number.isFinite(expectedBalance)) {
    throw new Error('Group settlement expected balance is invalid.');
  }
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    throw new Error('Group settlement participants are invalid.');
  }

  return {
    paymentIntentId,
    friendId,
    amount,
    currency,
    date,
    expectedBalance,
    allocations: [{ groupId, fromUserId, toUserId, amount, currency }],
    mode: 'group',
    groupId,
  };
}

export type GroupSettlementCommitQueryClient = {
  invalidateQueries(options: { queryKey: readonly unknown[] }): Promise<unknown>;
  setQueryData<T>(queryKey: readonly unknown[], updater: (current: T | undefined) => T): void;
};

export type CommitGroupSettlementParams = GroupSettlementCommitRequestInput & {
  currentUserId: string;
  friend: User;
  currentUser: User;
  queryClient: GroupSettlementCommitQueryClient;
};

async function invalidateSafely(
  queryClient: GroupSettlementCommitQueryClient,
  keys: readonly (readonly unknown[])[],
): Promise<void> {
  try {
    await Promise.all(keys.map(queryKey => queryClient.invalidateQueries({ queryKey })));
  } catch (error) {
    console.warn('Group settlement cache invalidation failed after commit:', error);
  }
}

/**
 * Commit a new group payment through the existing group-mode operation
 * boundary. The returned receipt carries the operation ID, so the payment
 * appears as one group activity with whole-operation Delete. Idempotency
 * rides the caller-supplied payment intent: retrying with the same intent
 * returns the original (`reused: true`) receipt without duplicating rows.
 */
export async function commitGroupSettlement(
  params: CommitGroupSettlementParams,
): Promise<CombinedSettlementReceipt> {
  const request = buildGroupSettlementCommitRequest(params);
  const receipt = await settlementService.commit(request);

  await invalidateSafely(params.queryClient, [
    ...getFriendRelationshipInvalidationKeys(params.currentUserId, params.friendId),
    queryKeys.groups.list(params.currentUserId),
  ]);

  if (!receipt.reused) {
    try {
      for (const settlement of receipt.settlements) {
        const currentUserPaid = settlement.fromUserId === params.currentUserId;
        await activityService.logSettlementCreated({
          settlementId: settlement.id,
          fromUserId: settlement.fromUserId,
          fromUserName: currentUserPaid ? params.currentUser.name : params.friend.name,
          toUserName: currentUserPaid ? params.friend.name : params.currentUser.name,
          amount: settlement.amount,
          groupId: settlement.groupId,
        });
      }
    } catch (error) {
      console.warn('Group settlement activity logging failed after commit:', error);
    }
  }

  // Group creation stays group-only (allocations carry this group alone and
  // no cancellations are ever sent), but the cache projection still folds any
  // receipt cancellations so a cleared scope never leaves a stale read model.
  const affectedGroupIds = [...new Set([
    params.groupId,
    ...(receipt.affectedGroupIds ?? []),
    ...receipt.settlements.flatMap(item => (item.groupId ? [item.groupId] : [])),
    ...(receipt.cancellations ?? []).map(cancellation => cancellation.groupId),
  ])];
  // Receipt cancellations always belong to this commit's operation between
  // the committing pair, so the cache projection scopes them to that pair
  // explicitly rather than resolving through possibly-stale metadata.
  const receiptPair: [string, string] = [params.currentUserId, params.friendId];
  for (const affectedGroupId of affectedGroupIds) {
    const groupSettlements = receipt.settlements.filter(item => item.groupId === affectedGroupId);
    const groupCancellations = (receipt.cancellations ?? []).filter(cancellation => cancellation.groupId === affectedGroupId);
    try {
      params.queryClient.setQueryData<GroupDetailReadModel | null>(
        queryKeys.groups.detail(params.currentUserId, affectedGroupId),
        current => {
          if (!current) return current ?? null;
          const withSettlements = groupSettlements.reduce(
            (model, settlement) => (model ? applySettlementToGroupReadModel(model, settlement) : model),
            current,
          );
          return groupCancellations.reduce(
            (model, cancellation) => (model ? applyCancellationToGroupReadModel(model, cancellation, () => receiptPair) : model),
            withSettlements,
          );
        },
      );
    } catch (error) {
      console.warn(`Group ${affectedGroupId} cache update failed after settlement commit:`, error);
    }
  }

  await invalidateSafely(params.queryClient, [
    ...affectedGroupIds.map(affectedGroupId => queryKeys.groups.detail(params.currentUserId, affectedGroupId)),
    ...affectedGroupIds.map(affectedGroupId => queryKeys.groups.pairTotals(params.currentUserId, affectedGroupId)),
    queryKeys.activity.list(params.currentUserId),
  ]);

  return receipt;
}
