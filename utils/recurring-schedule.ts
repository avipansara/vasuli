export type RecurrenceCadence = 'weekly' | 'monthly';
export type LocalDate = string;
export type InitialPostingState = 'future' | 'waiting' | 'due';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function parseLocalDate(value: LocalDate): Date {
  if (!LOCAL_DATE_PATTERN.test(value)) {
    throw new Error(`Invalid local date: ${value}`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid local date: ${value}`);
  }
  return date;
}

function formatLocalDate(date: Date): LocalDate {
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MILLIS_PER_DAY);
}

/** Returns the next scheduled local calendar date without converting it to an instant. */
export function getNextRecurringDate(
  currentDueDate: LocalDate,
  cadence: RecurrenceCadence,
  anchorDay?: number,
): LocalDate {
  const current = parseLocalDate(currentDueDate);
  if (cadence === 'weekly') {
    return formatLocalDate(addDays(current, 7));
  }

  if (anchorDay === undefined) {
    throw new Error('Monthly recurrence requires its original anchor day');
  }
  const requestedAnchorDay = anchorDay;
  if (!Number.isInteger(requestedAnchorDay) || requestedAnchorDay < 1 || requestedAnchorDay > 31) {
    throw new Error(`Invalid monthly anchor day: ${requestedAnchorDay}`);
  }
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth() + 1;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const day = Math.min(requestedAnchorDay, daysInMonth(nextYear, nextMonth - 1));
  return formatLocalDate(new Date(Date.UTC(nextYear, nextMonth - 1, day)));
}

export interface RecurringDueDatesInput {
  firstDueDate: LocalDate;
  throughDate: LocalDate;
  cadence: RecurrenceCadence;
  anchorDay?: number;
  lastDueDate?: LocalDate;
}

/** Lists scheduled local dates in order, including an inclusive last due date. */
export function getRecurringDueDates({
  firstDueDate,
  throughDate,
  cadence,
  anchorDay,
  lastDueDate,
}: RecurringDueDatesInput): LocalDate[] {
  parseLocalDate(firstDueDate);
  parseLocalDate(throughDate);
  if (lastDueDate) parseLocalDate(lastDueDate);
  const effectiveEnd = lastDueDate && lastDueDate < throughDate ? lastDueDate : throughDate;
  const dates: LocalDate[] = [];
  const effectiveAnchorDay = cadence === 'monthly' ? anchorDay ?? parseLocalDate(firstDueDate).getUTCDate() : anchorDay;
  let current = firstDueDate;
  while (current <= effectiveEnd) {
    dates.push(current);
    const next = getNextRecurringDate(current, cadence, effectiveAnchorDay);
    if (next <= current) throw new Error('Recurring schedule did not advance');
    current = next;
  }
  return dates;
}

interface MissedDueDatesBaseInput {
  nextDueDate: LocalDate;
  asOfDate: LocalDate;
  cadence: RecurrenceCadence;
  lastDueDate?: LocalDate;
  paused?: boolean;
}

export type MissedDueDatesInput =
  | (Omit<MissedDueDatesBaseInput, 'cadence'> & { cadence: 'weekly'; anchorDay?: number })
  | (Omit<MissedDueDatesBaseInput, 'cadence'> & { cadence: 'monthly'; anchorDay: number });

export interface MissedDueDates {
  automatic: LocalDate[];
  review: LocalDate[];
}

/** Splits missed dates into at most two automatic posts and later owner-review dates. */
export function classifyMissedDueDates({
  nextDueDate,
  asOfDate,
  cadence,
  anchorDay,
  lastDueDate,
  paused = false,
}: MissedDueDatesInput): MissedDueDates {
  if (cadence === 'monthly' && anchorDay === undefined) {
    throw new Error('Monthly catch-up requires its original anchor day');
  }
  if (paused) return { automatic: [], review: [] };
  const missed = getRecurringDueDates({
    firstDueDate: nextDueDate,
    throughDate: asOfDate,
    cadence,
    anchorDay,
    lastDueDate,
  });
  return { automatic: missed.slice(0, 2), review: missed.slice(2) };
}

export interface InitialPostingStateInput {
  dueDate: LocalDate;
  timeZone: string;
  createdAt: Date;
}

interface LocalDateTimeParts {
  date: LocalDate;
  hour: number;
}

function getLocalDateTimeParts(value: Date, timeZone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}

/** Applies the approximate 9 a.m. threshold in the rule's saved IANA time zone. */
export function getInitialPostingState({
  dueDate,
  timeZone,
  createdAt,
}: InitialPostingStateInput): InitialPostingState {
  parseLocalDate(dueDate);
  const local = getLocalDateTimeParts(createdAt, timeZone);
  if (local.date > dueDate) return 'due';
  if (local.date < dueDate) return 'future';
  return local.hour >= 9 ? 'due' : 'waiting';
}

interface ResumeDueDateBaseInput {
  nextDueDate: LocalDate;
  cadence: RecurrenceCadence;
  lastDueDate?: LocalDate;
  timeZone: string;
  resumedAt: Date;
}

export type ResumeDueDateInput =
  | (Omit<ResumeDueDateBaseInput, 'cadence'> & { cadence: 'weekly'; anchorDay?: number })
  | (Omit<ResumeDueDateBaseInput, 'cadence'> & { cadence: 'monthly'; anchorDay: number });

/** Finds the first date after a deliberate pause, without backfilling skipped dates. */
export function getNextDueDateAfterResume({
  nextDueDate,
  cadence,
  anchorDay,
  lastDueDate,
  timeZone,
  resumedAt,
}: ResumeDueDateInput): LocalDate | null {
  const local = getLocalDateTimeParts(resumedAt, timeZone);
  const resumedDate = local.date;
  if (cadence === 'monthly' && anchorDay === undefined) {
    throw new Error('Monthly resume requires its original anchor day');
  }
  const effectiveAnchorDay = anchorDay;
  let candidate = nextDueDate;

  while (candidate < resumedDate || (candidate === resumedDate && local.hour >= 9)) {
    candidate = getNextRecurringDate(candidate, cadence, effectiveAnchorDay);
  }
  if (lastDueDate && candidate > lastDueDate) return null;
  return candidate;
}
