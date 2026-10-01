import { describe, expect, it } from 'vitest';
import type { RecurringExpenseRule } from '@/types/database';
import {
  canManageRecurringRule,
  formatCadence,
  formatRecurringLocalDate,
  formatStatus,
  getMissedDatesForReview,
  getSavedZoneDate,
  groupRecurringRules,
} from '@/utils/recurring-management';

function makeRule(overrides: Partial<RecurringExpenseRule> = {}): RecurringExpenseRule {
  return {
    id: 'rule-1',
    ownerId: 'user-1',
    scopeType: 'group',
    groupId: 'group-1',
    description: 'Internet',
    amount: 60,
    currency: 'USD',
    paidBy: 'user-1',
    splitMethod: 'equal',
    splitType: 'equal',
    cadence: 'monthly',
    anchorDay: 15,
    timeZone: 'America/New_York',
    firstDueOn: '2026-01-15',
    nextDueOn: '2026-02-15',
    lastDueOn: undefined,
    status: 'active',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    participants: [
      { userId: 'user-1', shareAmount: 30 },
      { userId: 'user-2', shareAmount: 30 },
    ],
    ...overrides,
  };
}

describe('recurring-management utils', () => {
  describe('groupRecurringRules', () => {
    it('partitions rules into owned, shared, paused, stopped, and ended sections sorted by next due date', () => {
      const ownedActive1 = makeRule({ id: 'r1', ownerId: 'user-1', nextDueOn: '2026-03-01', description: 'B rule' });
      const ownedActive2 = makeRule({ id: 'r2', ownerId: 'user-1', nextDueOn: '2026-02-01', description: 'A rule' });
      const sharedActive = makeRule({ id: 'r3', ownerId: 'user-2', nextDueOn: '2026-02-15' });
      const paused = makeRule({ id: 'r4', ownerId: 'user-1', status: 'paused', nextDueOn: '2026-02-20' });
      const stopped = makeRule({ id: 'r5', ownerId: 'user-1', status: 'stopped', nextDueOn: undefined });
      const ended = makeRule({ id: 'r6', ownerId: 'user-1', status: 'ended', nextDueOn: undefined });

      const sections = groupRecurringRules(
        [ownedActive1, ownedActive2, sharedActive, paused, stopped, ended],
        'user-1'
      );

      expect(sections.ownedActive.map(r => r.id)).toEqual(['r2', 'r1']);
      expect(sections.sharedActive.map(r => r.id)).toEqual(['r3']);
      expect(sections.paused.map(r => r.id)).toEqual(['r4']);
      expect(sections.stopped.map(r => r.id)).toEqual(['r5']);
      expect(sections.ended.map(r => r.id)).toEqual(['r6']);
    });
  });

  describe('canManageRecurringRule', () => {
    it('returns true when viewer matches ownerId', () => {
      const rule = makeRule({ ownerId: 'user-1' });
      expect(canManageRecurringRule(rule, 'user-1')).toBe(true);
    });

    it('returns false when viewer does not match ownerId or ownerId is omitted for shared rules', () => {
      const rule = makeRule({ ownerId: 'user-2' });
      expect(canManageRecurringRule(rule, 'user-1')).toBe(false);

      const sharedRule = makeRule({ ownerId: undefined });
      expect(canManageRecurringRule(sharedRule, 'user-1')).toBe(false);
    });
  });

  describe('getSavedZoneDate', () => {
    it('computes correct calendar date in specified time zone', () => {
      // 2026-02-01 02:00:00 UTC is 2026-01-31 21:00:00 in America/New_York (UTC-5)
      const date = new Date(Date.UTC(2026, 1, 1, 2, 0, 0));
      expect(getSavedZoneDate(date, 'America/New_York')).toBe('2026-01-31');
      expect(getSavedZoneDate(date, 'UTC')).toBe('2026-02-01');
    });
  });

  describe('getMissedDatesForReview', () => {
    it('returns missed dates when paused for missed date review', () => {
      const rule = makeRule({
        status: 'paused',
        pausedReason: 'Missed dates require owner review (limit exceeded)',
        cadence: 'weekly',
        nextDueOn: '2026-02-01',
        timeZone: 'UTC',
      });
      const asOf = new Date(Date.UTC(2026, 1, 16)); // Feb 16, 2026
      const missed = getMissedDatesForReview(rule, asOf);
      expect(missed).toEqual(['2026-02-01', '2026-02-08', '2026-02-15']);
    });

    it('returns empty array when rule is active or paused for other reasons', () => {
      const ruleActive = makeRule({
        status: 'active',
        cadence: 'weekly',
        nextDueOn: '2026-02-01',
      });
      expect(getMissedDatesForReview(ruleActive, new Date())).toEqual([]);

      const rulePausedManually = makeRule({
        status: 'paused',
        pausedReason: 'Paused by owner',
        cadence: 'weekly',
        nextDueOn: '2026-02-01',
      });
      expect(getMissedDatesForReview(rulePausedManually, new Date())).toEqual([]);
    });
  });

  describe('formatting helpers', () => {
    it('formats recurring local dates properly', () => {
      expect(formatRecurringLocalDate('2026-09-30')).toBe('Sep 30, 2026');
      expect(formatRecurringLocalDate('')).toBe('');
    });

    it('formats cadence and status labels', () => {
      expect(formatCadence('weekly')).toBe('Weekly');
      expect(formatCadence('monthly')).toBe('Monthly');
      expect(formatStatus('active')).toBe('Active');
      expect(formatStatus('paused')).toBe('Paused');
      expect(formatStatus('stopped')).toBe('Stopped');
      expect(formatStatus('ended')).toBe('Ended');
    });
  });
});


describe('recurring occurrence date and status display', () => {
  it('formats effective dates independently of the viewer timezone', async () => {
    const { formatRecurringLocalDate } = await import('@/utils/recurring-management');
    expect(formatRecurringLocalDate('2026-01-02')).toBe('Jan 2, 2026');
  });

  it('uses the same semantic status palette for list and detail statuses', async () => {
    const { getRecurringStatusColor } = await import('@/utils/recurring-status');
    const colors = { success: 'success', textSecondary: 'secondary' };
    expect(getRecurringStatusColor('active', colors, 'paused')).toBe('success');
    expect(getRecurringStatusColor('paused', colors, 'paused')).toBe('paused');
    expect(getRecurringStatusColor('stopped', colors, 'paused')).toBe('secondary');
    expect(getRecurringStatusColor('ended', colors, 'paused')).toBe('secondary');
  });
});
