export type DateInput = Date | number | string;

export type DateFormatPreset =
  | 'short'
  | 'monthDay'
  | 'monthYear'
  | 'iso'
  | 'isoUtc'
  | 'time'
  | 'dateTime';

const PRESET_OPTIONS: Record<Exclude<DateFormatPreset, 'iso' | 'isoUtc' | 'dateTime'>, Intl.DateTimeFormatOptions> = {
  short: { month: 'short', day: 'numeric', year: 'numeric' },
  monthDay: { month: 'short', day: 'numeric' },
  monthYear: { month: 'long', year: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
};

/**
 * Safely parses any DateInput into a valid Date instance.
 */
export function toDate(value: DateInput): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

/**
 * Formats a Date, timestamp, or date string into a localized display string.
 * Defaults to 'short' preset: e.g. "Aug 20, 2026".
 */
export function formatDate(
  value: DateInput,
  optionsOrPreset: DateFormatPreset | Intl.DateTimeFormatOptions = 'short',
  locale: string = 'en-US'
): string {
  const date = toDate(value);
  if (isNaN(date.getTime())) {
    return '';
  }

  if (typeof optionsOrPreset === 'string') {
    if (optionsOrPreset === 'iso' || optionsOrPreset === 'isoUtc') {
      const isUtc = optionsOrPreset === 'isoUtc';
      const year = isUtc ? date.getUTCFullYear() : date.getFullYear();
      const month = String((isUtc ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
      const day = String(isUtc ? date.getUTCDate() : date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    if (optionsOrPreset === 'dateTime') {
      const datePart = date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      const timePart = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
      return `${datePart} at ${timePart}`;
    }

    return date.toLocaleDateString(locale, PRESET_OPTIONS[optionsOrPreset]);
  }

  return date.toLocaleDateString(locale, optionsOrPreset);
}

/**
 * Formats a date range from an array of expenses or dates.
 * Returns e.g. "Aug 20 – Sep 5", or "Aug 20" for single-day range, or "No expenses yet".
 */
export function formatDateRange(
  items: (DateInput | { date: DateInput })[],
  locale: string = 'en-US'
): string {
  if (items.length === 0) return 'No expenses yet';

  const timestamps = items
    .map(item => {
      const val = typeof item === 'object' && item !== null && 'date' in item ? item.date : item;
      return toDate(val as DateInput).getTime();
    })
    .filter(time => !isNaN(time))
    .sort((a, b) => a - b);

  if (timestamps.length === 0) return 'No expenses yet';

  const first = new Date(timestamps[0]);
  const last = new Date(timestamps[timestamps.length - 1]);

  const formatMonthDay = (date: Date) => formatDate(date, 'monthDay', locale);

  return timestamps[0] === timestamps[timestamps.length - 1]
    ? formatMonthDay(first)
    : `${formatMonthDay(first)} – ${formatMonthDay(last)}`;
}

/**
 * Categorizes a timestamp into a relative activity period:
 * "Today", "Yesterday", "This Week", "This Month", or "Earlier".
 */
export function getTimePeriod(timestamp: number, relativeTo: Date = new Date()): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Earlier';

  // Strip time parts to compare calendar dates
  const todayDate = new Date(relativeTo.getFullYear(), relativeTo.getMonth(), relativeTo.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = todayDate.getTime() - targetDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  // Start of this week (Monday)
  const currentDayOfWeek = relativeTo.getDay(); // 0 (Sunday) to 6 (Saturday)
  const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
  const mondayOfThisWeek = new Date(todayDate.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);

  if (targetDate.getTime() >= mondayOfThisWeek.getTime()) {
    return 'This Week';
  }

  // Start of this month
  const firstOfThisMonth = new Date(relativeTo.getFullYear(), relativeTo.getMonth(), 1);
  if (targetDate.getTime() >= firstOfThisMonth.getTime()) {
    return 'This Month';
  }

  return 'Earlier';
}
