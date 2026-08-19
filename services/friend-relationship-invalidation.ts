import { queryKeys } from '@/services/query-keys';

export const FRIEND_RELATIONSHIP_REALTIME_TABLES = [
  'expenses',
  'expense_splits',
  'settlements',
  'settlement_scope_transfers',
  'groups',
  'group_members',
  'friendships',
] as const;

type RelationshipQueryClient = {
  invalidateQueries(options: { queryKey: readonly unknown[] }): Promise<unknown>;
};

export function getFriendRelationshipInvalidationKeys(
  currentUserId: string,
  friendId?: string,
): readonly (readonly unknown[])[] {
  return [
    queryKeys.friends.home(currentUserId),
    friendId
      ? queryKeys.friends.detail(currentUserId, friendId)
      : queryKeys.friends.detailScope(currentUserId),
  ];
}

export async function invalidateFriendRelationshipSurfaces(
  queryClient: RelationshipQueryClient,
  currentUserId: string,
  friendId?: string,
): Promise<void> {
  await Promise.all(
    getFriendRelationshipInvalidationKeys(currentUserId, friendId).map(queryKey =>
      queryClient.invalidateQueries({ queryKey })
    )
  );
}

export async function refreshFriendRelationshipSurfaces(
  queryClient: RelationshipQueryClient,
  currentUserId: string,
  friendId: string,
  refresh: () => Promise<void>,
): Promise<void> {
  await invalidateFriendRelationshipSurfaces(queryClient, currentUserId, friendId);
  await refresh();
}
