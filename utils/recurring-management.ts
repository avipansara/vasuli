import type { RecurringExpenseRule } from '@/types/database';
import { getRecurringDueDates } from '@/utils/recurring-schedule';

export interface RecurringRuleSections {
  ownedActive: RecurringExpenseRule[];
  sharedActive: RecurringExpenseRule[];
  paused: RecurringExpenseRule[];
  stopped: RecurringExpenseRule[];
  ended: RecurringExpenseRule[];
}

function byNextDueDate(left: RecurringExpenseRule, right: RecurringExpenseRule): number {
  return (left.nextDueOn ?? '9999-12-31').localeCompare(right.nextDueOn ?? '9999-12-31')
    || left.description.localeCompare(right.description);
}

/** Groups visible rules in the order the recurring list presents them. */
export function groupRecurringRules(
  rules: RecurringExpenseRule[],
  viewerId: string,
): RecurringRuleSections {
  const ownedActive: RecurringExpenseRule[] = [];
  const sharedActive: RecurringExpenseRule[] = [];
  const paused: RecurringExpenseRule[] = [];
  const stopped: RecurringExpenseRule[] = [];
  const ended: RecurringExpenseRule[] = [];

  for (const rule of rules) {
    if (rule.status === 'active') {
      (rule.ownerId === viewerId ? ownedActive : sharedActive).push(rule);
    } else if (rule.status === 'paused') paused.push(rule);
    else if (rule.status === 'stopped') stopped.push(rule);
    else ended.push(rule);
  }

  return {
    ownedActive: ownedActive.sort(byNextDueDate),
    sharedActive: sharedActive.sort(byNextDueDate),
    paused: paused.sort(byNextDueDate),
    stopped: stopped.sort(byNextDueDate),
    ended: ended.sort(byNextDueDate),
  };
}

/** The rule RPC intentionally omits owner identity for participants. */
export function canManageRecurringRule(rule: RecurringExpenseRule, viewerId: string): boolean {
  return !!rule.ownerId && rule.ownerId === viewerId;
}

export function getSavedZoneDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Returns dates awaiting explicit owner review after the automatic catch-up limit. */
export function getMissedDatesForReview(
  rule: RecurringExpenseRule,
  now: Date,
): string[] {
  if (!rule.nextDueOn || rule.status !== 'paused'
      || !rule.pausedReason?.startsWith('Missed dates require owner review')) return [];
  return getRecurringDueDates({
    firstDueDate: rule.nextDueOn,
    throughDate: getSavedZoneDate(now, rule.timeZone),
    cadence: rule.cadence,
    anchorDay: rule.anchorDay,
    lastDueDate: rule.lastDueOn,
  });
}

/** Formats a YYYY-MM-DD local calendar date string into readable text. */
export function formatRecurringLocalDate(date: string): string {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatCadence(cadence: string): string {
  switch (cadence) {
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    default:
      return cadence;
  }
}

export function formatStatus(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'stopped':
      return 'Stopped';
    case 'ended':
      return 'Ended';
    default:
      return status;
  }
}

