import type { Expense } from '@/types/database';
import { formatDate } from './date';
import { formatRecurringLocalDate } from './recurring-management';

/** Formats a recurring occurrence by its date-only value, independent of viewer timezone. */
export function formatExpenseDate(expense: Pick<Expense, 'date' | 'effectiveDate'>): string {
  return expense.effectiveDate
    ? formatRecurringLocalDate(expense.effectiveDate)
    : formatDate(expense.date);
}

export function formatCalendarDateString(value: string, locale = 'en-US', options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function dateOnlyToLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}


export function getExpenseDateUpdate(
  original: Pick<Expense, 'recurringRuleId' | 'effectiveDate'>,
  selectedLocalDate: Date,
): Partial<Pick<Expense, 'date' | 'effectiveDate'>> {
  if (!original.recurringRuleId) return { date: selectedLocalDate.getTime() };
  const selectedDate = `${selectedLocalDate.getFullYear()}-${String(selectedLocalDate.getMonth() + 1).padStart(2, '0')}-${String(selectedLocalDate.getDate()).padStart(2, '0')}`;
  return selectedDate === original.effectiveDate
    ? {}
    : { date: selectedLocalDate.getTime(), effectiveDate: selectedDate };
}
