import type { RecurringExpenseStatus } from '@/types/database';

export function getRecurringStatusColor(
  status: RecurringExpenseStatus,
  colors: { success: string; textSecondary: string },
  pausedColor: string,
): string {
  switch (status) {
    case 'active': return colors.success;
    case 'paused': return pausedColor;
    case 'stopped':
    case 'ended': return colors.textSecondary;
    default: return colors.textSecondary;
  }
}

