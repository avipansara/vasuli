import { useQuery } from '@tanstack/react-query';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { queryKeys } from '@/services/query-keys';
import { recurringExpenseService } from '@/services/recurring-expense-service';

export function useRecurringExpenseOccurrences(userId: string, ruleId: string) {
  const query = useQuery({
    queryKey: queryKeys.recurringExpenses.occurrences(userId, ruleId),
    enabled: !!userId && !!ruleId,
    staleTime: 0,
    queryFn: () => recurringExpenseService.getRecentOccurrences(ruleId),
  });
  useRefetchOnFocus({
    enabled: !!userId && !!ruleId,
    isFetching: query.isFetching,
    isStale: query.isStale,
    refetch: query.refetch,
  });
  return query;
}

export function useRecurringExpenseRules(userId: string) {
  const query = useQuery({
    queryKey: queryKeys.recurringExpenses.list(userId),
    enabled: !!userId,
    staleTime: 0,
    queryFn: () => recurringExpenseService.list(),
  });
  useRefetchOnFocus({
    enabled: !!userId,
    isFetching: query.isFetching,
    isStale: query.isStale,
    refetch: query.refetch,
  });
  return query;
}

export function useRecurringExpenseRule(userId: string, ruleId: string) {
  const query = useQuery({
    queryKey: queryKeys.recurringExpenses.detail(userId, ruleId),
    enabled: !!userId && !!ruleId,
    staleTime: 0,
    queryFn: () => recurringExpenseService.get(ruleId),
  });
  useRefetchOnFocus({
    enabled: !!userId && !!ruleId,
    isFetching: query.isFetching,
    isStale: query.isStale,
    refetch: query.refetch,
  });
  return query;
}
