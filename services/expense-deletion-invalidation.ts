import { queryKeys } from '@/services/query-keys';

type ExpenseDeletionInvalidationOptions = {
  expenseId: string;
  groupId?: string;
  paidBy?: string;
  participantIds?: readonly string[];
};

type QueryKey = readonly unknown[];

function uniqueQueryKeys(keys: readonly QueryKey[]): readonly QueryKey[] {
  const seen = new Set<string>();
  return keys.filter(key => {
    const serialized = JSON.stringify(key);
    if (seen.has(serialized)) return false;
    seen.add(serialized);
    return true;
  });
}

export function getExpenseDeletionInvalidationKeys(
  currentUserId: string,
  { expenseId, groupId, paidBy, participantIds = [] }: ExpenseDeletionInvalidationOptions,
): readonly QueryKey[] {
  const affectedFriendIds = [...new Set([
    ...participantIds,
    ...(paidBy ? [paidBy] : []),
  ])].filter(id => id !== currentUserId);
  const relationshipKeys: QueryKey[] = [queryKeys.friends.home(currentUserId)];

  if (groupId) {
    relationshipKeys.push(queryKeys.friends.detailScope(currentUserId));
  } else {
    relationshipKeys.push(
      ...affectedFriendIds.map(friendId => queryKeys.friends.detail(currentUserId, friendId)),
    );
  }

  return uniqueQueryKeys([
    queryKeys.expenses.detail(expenseId),
    queryKeys.expenses.list(currentUserId),
    queryKeys.activity.list(currentUserId),
    ...relationshipKeys,
    ...(groupId
      ? [
        queryKeys.groups.detail(currentUserId, groupId),
        queryKeys.groups.list(currentUserId),
      ]
      : []),
  ]);
}
