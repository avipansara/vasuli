import { describe, expect, it } from 'vitest';
import { formatExpenseDate, getExpenseDateUpdate } from './expense-date';

describe('getExpenseDateUpdate', () => {
  it('formats the effective calendar day even when the stored posting instant falls on another viewer day', () => {
    expect(formatExpenseDate({ date: Date.parse('2026-10-01T02:00:00Z'), effectiveDate: '2026-09-30' })).toBe('Sep 30, 2026');
  });

  it('does not write an unchanged recurring calendar date during amount-only edits', () => {
    expect(getExpenseDateUpdate({ recurringRuleId: 'rule', effectiveDate: '2026-09-29' }, new Date(2026, 8, 29, 12))).toEqual({});
  });

  it('persists an intentional recurring calendar-date edit while preserving the separate schedule identity', () => {
    expect(getExpenseDateUpdate({ recurringRuleId: 'rule', effectiveDate: '2026-09-29' }, new Date(2026, 8, 30, 12))).toEqual({ date: new Date(2026, 8, 30, 12).getTime(), effectiveDate: '2026-09-30' });
  });

  it('keeps ordinary expense timestamp edits unchanged', () => {
    const selected = new Date(2026, 8, 30, 12);
    expect(getExpenseDateUpdate({ effectiveDate: undefined }, selected)).toEqual({ date: selected.getTime() });
  });
});
