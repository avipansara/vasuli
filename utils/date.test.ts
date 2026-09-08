import { describe, expect, it } from 'vitest';
import { formatDate, formatDateRange, getTimePeriod, toDate } from './date';

describe('date utilities', () => {
  describe('toDate', () => {
    it('returns the Date instance if already Date', () => {
      const now = new Date();
      expect(toDate(now)).toBe(now);
    });

    it('parses timestamps and strings into Date instances', () => {
      const d1 = toDate(1700000000000);
      expect(d1.getTime()).toBe(1700000000000);
      const d2 = toDate('2026-08-20T12:00:00Z');
      expect(d2).toBeInstanceOf(Date);
    });
  });

  describe('formatDate', () => {
    const testTimestamp = new Date('2026-08-20T15:30:00Z').getTime();

    it('formats using short preset by default', () => {
      const result = formatDate(testTimestamp);
      expect(result).toMatch(/Aug 20, 2026/);
    });

    it('formats monthDay preset', () => {
      const result = formatDate(testTimestamp, 'monthDay');
      expect(result).toMatch(/Aug 20/);
    });

    it('formats monthYear preset', () => {
      const result = formatDate(testTimestamp, 'monthYear');
      expect(result).toMatch(/August 2026/);
    });

    it('formats iso preset as YYYY-MM-DD', () => {
      const date = new Date(2026, 7, 20); // August is month 7 (0-indexed)
      const result = formatDate(date, 'iso');
      expect(result).toBe('2026-08-20');
    });

    it('formats dateTime preset with date and time', () => {
      const result = formatDate(testTimestamp, 'dateTime');
      expect(result).toContain('Aug 20 at');
    });

    it('supports custom Intl.DateTimeFormatOptions', () => {
      const result = formatDate(testTimestamp, { weekday: 'long' });
      expect(result).toBe('Thursday');
    });

    it('returns empty string for invalid dates', () => {
      expect(formatDate('invalid-date')).toBe('');
      expect(formatDate(NaN)).toBe('');
    });
  });

  describe('formatDateRange', () => {
    it('returns empty placeholder when no items', () => {
      expect(formatDateRange([])).toBe('No expenses yet');
    });

    it('formats single date', () => {
      const date = new Date(2026, 7, 20);
      expect(formatDateRange([{ date }])).toBe('Aug 20');
      expect(formatDateRange([date])).toBe('Aug 20');
    });

    it('formats range between different dates', () => {
      const start = new Date(2026, 7, 20);
      const end = new Date(2026, 8, 5);
      expect(formatDateRange([{ date: start }, { date: end }])).toBe('Aug 20 – Sep 5');
    });
  });

  describe('getTimePeriod', () => {
    const reference = new Date(2026, 8, 8, 12, 0, 0); // Tuesday, Sep 8, 2026

    it('returns Today for same-day timestamp', () => {
      const today = new Date(2026, 8, 8, 8, 0, 0).getTime();
      expect(getTimePeriod(today, reference)).toBe('Today');
    });

    it('returns Yesterday for 1 day prior', () => {
      const yesterday = new Date(2026, 8, 7, 18, 0, 0).getTime();
      expect(getTimePeriod(yesterday, reference)).toBe('Yesterday');
    });

    it('returns This Week for dates within current week', () => {
      // Sep 8 is Tuesday; Monday was Sep 7
      // Let's test with Sep 11 (Friday) reference, Sep 9 date
      const friday = new Date(2026, 8, 11, 12, 0, 0);
      const wednesday = new Date(2026, 8, 9, 10, 0, 0).getTime();
      expect(getTimePeriod(wednesday, friday)).toBe('This Week');
    });

    it('returns This Month for dates within same month but earlier week', () => {
      const lateMonth = new Date(2026, 8, 28, 12, 0, 0);
      const earlyMonth = new Date(2026, 8, 2, 10, 0, 0).getTime();
      expect(getTimePeriod(earlyMonth, lateMonth)).toBe('This Month');
    });

    it('returns Earlier for dates in previous months', () => {
      const past = new Date(2026, 6, 1, 10, 0, 0).getTime();
      expect(getTimePeriod(past, reference)).toBe('Earlier');
    });

    it('returns Earlier for invalid dates', () => {
      expect(getTimePeriod(NaN)).toBe('Earlier');
    });
  });
});
