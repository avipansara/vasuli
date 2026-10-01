import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recurringExpenseService } from '@/services/recurring-expense-service';
import { invalidatePostedOccurrenceImpacts, invalidateRecurringRule } from '@/services/recurring-expense-invalidation';

/** Centralizes cache refresh for every authenticated recurring rule command. */
export function useRecurringExpenseMutations(userId: string) {
  const queryClient = useQueryClient();
  const invalidate = async (ruleId?: string) => {
    await Promise.all([
      invalidateRecurringRule(queryClient, userId, ruleId),
      invalidatePostedOccurrenceImpacts(queryClient, userId),
    ]);
  };

  const create = useMutation({
    mutationFn: ({ rule, confirmDuplicate = false }: {
      rule: Parameters<typeof recurringExpenseService.create>[1];
      confirmDuplicate?: boolean;
    }) => recurringExpenseService.create(userId, rule, confirmDuplicate),
    onSuccess: result => invalidate(result.ruleId),
  });
  const edit = useMutation({
    mutationFn: ({ ruleId, rule }: { ruleId: string; rule: Parameters<typeof recurringExpenseService.edit>[2] }) =>
      recurringExpenseService.edit(userId, ruleId, rule),
    onSuccess: result => invalidate(result.ruleId),
  });
  const pause = useMutation({ mutationFn: (ruleId: string) => recurringExpenseService.pause(userId, ruleId), onSuccess: result => invalidate(result.ruleId) });
  const resume = useMutation({ mutationFn: (ruleId: string) => recurringExpenseService.resume(userId, ruleId), onSuccess: result => invalidate(result.ruleId) });
  const stop = useMutation({ mutationFn: (ruleId: string) => recurringExpenseService.stop(userId, ruleId), onSuccess: result => invalidate(result.ruleId) });
  const reviewMissedDate = useMutation({
    mutationFn: ({ ruleId, dueOn, action }: { ruleId: string; dueOn: string; action: 'post' | 'skip' }) =>
      recurringExpenseService.reviewMissedDate(userId, ruleId, dueOn, action),
    onSuccess: result => invalidate(result.ruleId),
  });

  return { create, edit, pause, resume, stop, reviewMissedDate };
}
