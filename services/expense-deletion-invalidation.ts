import { queryKeys } from '@/services/query-keys';

type ExpenseDeletionInvalidationOptions = {
  expenseId: string;
  recurringRuleId?: string;
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
  { expenseId, recurringRuleId, groupId, paidBy, participantIds = [] }: ExpenseDeletionInvalidationOptions,
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
    ...(recurringRuleId ? [queryKeys.recurringExpenses.detail(currentUserId, recurringRuleId)] : []),
    ...(recurringRuleId ? [queryKeys.recurringExpenses.occurrences(currentUserId, recurringRuleId)] : []),
    queryKeys.expenses.list(currentUserId),
    ['expenses', 'detail'],
    queryKeys.activity.listScope(currentUserId),
    ...relationshipKeys,
    queryKeys.friends.detailScope(currentUserId),
    ...(groupId
      ? [
        queryKeys.groups.detail(currentUserId, groupId),
        queryKeys.groups.pairTotals(currentUserId, groupId),
        queryKeys.groups.list(currentUserId),
        queryKeys.groups.detailScope(currentUserId),
        queryKeys.groups.pairTotalsScope(currentUserId),
      ]
      : []),
  ]);
}
