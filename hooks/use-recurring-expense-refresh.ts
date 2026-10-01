import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useRealtime } from '@/hooks/use-realtime';
import { invalidatePostedOccurrenceImpacts, invalidateRecurringRule } from '@/services/recurring-expense-invalidation';

/** Keeps open recurring and balance screens current when the server posts or edits a rule. */
export function useRecurringExpenseRefresh(userId: string | undefined, enabled = true): void {
  const queryClient = useQueryClient();
  const active = enabled && !!userId;
  const onExpenseChange = useCallback(() => {
    if (userId) void invalidatePostedOccurrenceImpacts(queryClient, userId);
  }, [queryClient, userId]);
  const onRuleChange = useCallback(() => {
    if (userId) {
      void invalidateRecurringRule(queryClient, userId);
      void invalidatePostedOccurrenceImpacts(queryClient, userId);
    }
  }, [queryClient, userId]);

  useEffect(() => {
    if (!active || !userId) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        // Participants cannot receive rule-table events under owner-only RLS.
        // Refreshing on app resume complements the list/detail focus hooks.
        void invalidateRecurringRule(queryClient, userId);
        void invalidatePostedOccurrenceImpacts(queryClient, userId);
      }
    });
    return () => subscription.remove();
  }, [active, queryClient, userId]);

  // An occurrence is inserted into the ordinary expenses table by the server
  // worker; rule updates also cover create/edit/pause/resume/stop.
  useRealtime({ table: 'expenses', onChange: onExpenseChange, enabled: active });
  useRealtime({ table: 'recurring_expense_rules', onChange: onRuleChange, enabled: active });
}
