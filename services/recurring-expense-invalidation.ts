import { queryKeys } from '@/services/query-keys';

type QueryInvalidator = {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>;
};

export function getRecurringRuleInvalidationKeys(userId: string, ruleId?: string): readonly (readonly unknown[])[] {
  return [
    queryKeys.recurringExpenses.list(userId),
    queryKeys.recurringExpenses.detailScope(userId),
    ...(ruleId ? [queryKeys.recurringExpenses.detail(userId, ruleId)] : []),
    queryKeys.recurringExpenses.occurrencesScope(userId),
  ];
}

/** Invalidate all balance and history projections affected by a server-posted expense. */
export function getPostedOccurrenceInvalidationKeys(userId: string): readonly (readonly unknown[])[] {
  return [
    queryKeys.friends.home(userId),
    queryKeys.friends.detailScope(userId),
    queryKeys.groups.list(userId),
    queryKeys.groups.detailScope(userId),
    queryKeys.groups.pairTotalsScope(userId),
    queryKeys.expenses.list(userId),
    ['expenses', 'detail'],
    queryKeys.activity.listScope(userId),
    queryKeys.recurringExpenses.occurrencesScope(userId),
  ];
}

export async function invalidateRecurringRule(
  queryClient: QueryInvalidator,
  userId: string,
  ruleId?: string,
): Promise<void> {
  await Promise.all(getRecurringRuleInvalidationKeys(userId, ruleId).map(queryKey =>
    queryClient.invalidateQueries({ queryKey }),
  ));
}

export async function invalidatePostedOccurrenceImpacts(
  queryClient: QueryInvalidator,
  userId: string,
): Promise<void> {
  await Promise.all(getPostedOccurrenceInvalidationKeys(userId).map(queryKey =>
    queryClient.invalidateQueries({ queryKey }),
  ));
}
