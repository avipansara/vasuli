import { areGroupBalancesSettled } from './group-balance';
import { groupService } from './group-service';
import type { QueryCacheAdapter, QueryCacheKey } from './query-cache-adapter';

export type GroupDetailGroupMutationDependencies = {
  deleteGroup: typeof groupService.delete;
};

const defaultDependencies: GroupDetailGroupMutationDependencies = {
  deleteGroup: groupService.delete,
};

export type DeleteGroupParams = {
  groupId: string;
  currentUserId: string;
  balances: Map<string, number>;
  groupDetailKey: QueryCacheKey;
  groupListKey: QueryCacheKey;
  cache: Pick<QueryCacheAdapter, 'invalidate'>;
};

function canDeleteGroup(balances: Map<string, number>): boolean {
  return areGroupBalancesSettled(balances);
}

export function createGroupDetailGroupMutation(
  dependencies: GroupDetailGroupMutationDependencies = defaultDependencies,
) {
  return {
    canDeleteGroup,

    async deleteGroup(params: DeleteGroupParams): Promise<{ status: 'deleted' | 'blocked' }> {
      if (!canDeleteGroup(params.balances)) return { status: 'blocked' };

      await dependencies.deleteGroup(params.groupId, params.currentUserId);
      await Promise.all([
        safelyInvalidate(params.cache, params.groupDetailKey),
        safelyInvalidate(params.cache, params.groupListKey),
      ]);
      return { status: 'deleted' };
    },
  };
}

async function safelyInvalidate(cache: Pick<QueryCacheAdapter, 'invalidate'>, key: QueryCacheKey) {
  try {
    await cache.invalidate(key);
  } catch (error) {
    console.warn('Group cache invalidation failed after Group deletion:', error);
  }
}

export const groupDetailGroupMutation = createGroupDetailGroupMutation();
