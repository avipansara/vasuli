import { describe, expect, it } from 'vitest';
import {
  classifyMissedDueDates,
  getInitialPostingState,
  getNextDueDateAfterResume,
  getNextRecurringDate,
  getRecurringDueDates,
} from './recurring-schedule';

describe('recurring schedule calendar policy', () => {
  describe('getNextRecurringDate', () => {
    it('keeps the weekly anchor weekday across a year boundary', () => {
      expect(getNextRecurringDate('2026-12-30', 'weekly')).toBe('2027-01-06');
    });

    it('clamps monthly dates in short months and returns to the anchor day', () => {
      expect(getNextRecurringDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
      expect(getNextRecurringDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    });

    it('handles leap years for a month-end anchor', () => {
      expect(getNextRecurringDate('2028-01-31', 'monthly', 31)).toBe('2028-02-29');
      expect(getNextRecurringDate('2028-02-29', 'monthly', 31)).toBe('2028-03-31');
    });

    it('requires the original anchor when advancing a monthly date directly', () => {
      expect(() => getNextRecurringDate('2026-02-28', 'monthly')).toThrow(
        'original anchor day',
      );
    });
  });

  describe('getRecurringDueDates', () => {
    it('includes the first and last due dates and excludes later dates', () => {
      expect(
        getRecurringDueDates({
          firstDueDate: '2026-01-31',
          throughDate: '2026-05-01',
          cadence: 'monthly',
          anchorDay: 31,
          lastDueDate: '2026-03-31',
        }),
      ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });

    it('does not create dates before the rule starts', () => {
      expect(
        getRecurringDueDates({
          firstDueDate: '2026-03-29',
          throughDate: '2026-04-12',
          cadence: 'weekly',
        }),
      ).toEqual(['2026-03-29', '2026-04-05', '2026-04-12']);
    });

    it('derives the monthly anchor from the first date for full-list iteration', () => {
      expect(
        getRecurringDueDates({
          firstDueDate: '2026-01-31',
          throughDate: '2026-03-31',
          cadence: 'monthly',
        }),
      ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });
  });

  describe('classifyMissedDueDates', () => {
    it('automatically catches up at most two dates and identifies later dates for review', () => {
      expect(
        classifyMissedDueDates({
          nextDueDate: '2026-01-31',
          asOfDate: '2026-04-01',
          cadence: 'monthly',
          anchorDay: 31,
        }),
      ).toEqual({
        automatic: ['2026-01-31', '2026-02-28'],
        review: ['2026-03-31'],
      });
    });

    it('keeps the original anchor when catch-up starts on a clamped date', () => {
      expect(
        classifyMissedDueDates({
          nextDueDate: '2026-02-28',
          asOfDate: '2026-03-31',
          cadence: 'monthly',
          anchorDay: 31,
        }),
      ).toEqual({ automatic: ['2026-02-28', '2026-03-31'], review: [] });
    });

    it('skips all dates while deliberately paused and does not backfill on resume', () => {
      expect(
        classifyMissedDueDates({
          nextDueDate: '2026-03-01',
          asOfDate: '2026-04-01',
          cadence: 'weekly',
          paused: true,
        }),
      ).toEqual({ automatic: [], review: [] });
    });
  });

  describe('posting threshold', () => {
    it('waits before 9 a.m. and becomes due after 9 a.m. in the saved time zone', () => {
      expect(
        getInitialPostingState({
          dueDate: '2026-07-04',
          timeZone: 'America/Los_Angeles',
          createdAt: new Date('2026-07-04T15:59:00Z'),
        }),
      ).toBe('waiting');
      expect(
        getInitialPostingState({
          dueDate: '2026-07-04',
          timeZone: 'America/Los_Angeles',
          createdAt: new Date('2026-07-04T16:01:00Z'),
        }),
      ).toBe('due');
    });

    it('skips paused dates and keeps today only when resuming before the threshold', () => {
      const beforeThreshold = getNextDueDateAfterResume({
        nextDueDate: '2026-03-01',
        cadence: 'monthly',
        anchorDay: 1,
        timeZone: 'America/Los_Angeles',
        resumedAt: new Date('2026-04-01T15:59:00Z'),
      });
      const afterThreshold = getNextDueDateAfterResume({
        nextDueDate: '2026-03-01',
        cadence: 'monthly',
        anchorDay: 1,
        timeZone: 'America/Los_Angeles',
        resumedAt: new Date('2026-04-01T16:01:00Z'),
      });

      expect(beforeThreshold).toBe('2026-04-01');
      expect(afterThreshold).toBe('2026-05-01');
    });

    it('keeps the original anchor when resuming from a clamped monthly date', () => {
      expect(
        getNextDueDateAfterResume({
          nextDueDate: '2026-02-28',
          cadence: 'monthly',
          anchorDay: 31,
          timeZone: 'America/Los_Angeles',
          resumedAt: new Date('2026-03-31T15:00:00Z'),
        }),
      ).toBe('2026-03-31');
    });

    it('recognizes a future local date even when the UTC day differs', () => {
      expect(
        getInitialPostingState({
          dueDate: '2026-07-06',
          timeZone: 'Pacific/Kiritimati',
          createdAt: new Date('2026-07-04T23:30:00Z'),
        }),
      ).toBe('future');
    });

    it('uses the saved zone after a daylight saving transition', () => {
      expect(
        getInitialPostingState({
          dueDate: '2026-03-08',
          timeZone: 'America/New_York',
          createdAt: new Date('2026-03-08T13:01:00Z'),
        }),
      ).toBe('due');
    });
  });
});
