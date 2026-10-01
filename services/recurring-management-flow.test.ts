import { describe, expect, it, vi } from 'vitest';
import type { RecurringExpenseRule, RecurringExpenseRuleInput } from '@/types/database';
import { createRecurringExpenseService } from '@/services/recurring-expense-service';
import {
  canManageRecurringRule,
  formatCadence,
  formatRecurringLocalDate,
  formatStatus,
  getMissedDatesForReview,
  groupRecurringRules,
} from '@/utils/recurring-management';

vi.mock('@/services/auth-profile-service', () => ({
  linkAuthUserToProfile: vi.fn(async () => ({ user: { id: 'owner-1' }, created: false })),
}));

function makeRule(overrides: Partial<RecurringExpenseRule> = {}): RecurringExpenseRule {
  return {
    id: 'rule-1',
    ownerId: 'owner-1',
    scopeType: 'group',
    groupId: 'group-1',
    description: 'Rent',
    amount: 1200,
    currency: 'USD',
    paidBy: 'owner-1',
    splitMethod: 'equal',
    splitType: 'equal',
    cadence: 'monthly',
    anchorDay: 1,
    timeZone: 'America/New_York',
    firstDueOn: '2026-01-01',
    nextDueOn: '2026-02-01',
    status: 'active',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    participants: [
      { userId: 'owner-1', shareAmount: 600 },
      { userId: 'friend-1', shareAmount: 600 },
    ],
    ...overrides,
  };
}

describe('recurring management flow', () => {
  it('groups rules correctly into owned active, shared active, paused, stopped, and ended sections', () => {
    const ownedActive = makeRule({ id: 'r1', ownerId: 'owner-1', status: 'active', nextDueOn: '2026-03-01' });
    const sharedActive = makeRule({ id: 'r2', ownerId: 'other-user', status: 'active', nextDueOn: '2026-02-15' });
    const paused = makeRule({ id: 'r3', status: 'paused', nextDueOn: '2026-02-20', pausedReason: 'Paused by owner' });
    const stopped = makeRule({ id: 'r4', status: 'stopped', nextDueOn: undefined });
    const ended = makeRule({ id: 'r5', status: 'ended', nextDueOn: undefined });

    const grouped = groupRecurringRules(
      [ownedActive, sharedActive, paused, stopped, ended],
      'owner-1'
    );

    expect(grouped.ownedActive).toHaveLength(1);
    expect(grouped.ownedActive[0].id).toBe('r1');
    expect(grouped.sharedActive).toHaveLength(1);
    expect(grouped.sharedActive[0].id).toBe('r2');
    expect(grouped.paused).toHaveLength(1);
    expect(grouped.paused[0].id).toBe('r3');
    expect(grouped.stopped).toHaveLength(1);
    expect(grouped.stopped[0].id).toBe('r4');
    expect(grouped.ended).toHaveLength(1);
    expect(grouped.ended[0].id).toBe('r5');
  });

  it('restricts management permissions to rule owner and enforces read-only for participants', () => {
    const ownedRule = makeRule({ ownerId: 'owner-1' });
    const sharedRule = makeRule({ ownerId: undefined });

    expect(canManageRecurringRule(ownedRule, 'owner-1')).toBe(true);
    expect(canManageRecurringRule(ownedRule, 'friend-1')).toBe(false);
    expect(canManageRecurringRule(sharedRule, 'owner-1')).toBe(false);
  });

  it('detects missed dates awaiting review and formats dates cleanly', () => {
    const rule = makeRule({
      status: 'paused',
      pausedReason: 'Missed dates require owner review (limit exceeded)',
      cadence: 'weekly',
      nextDueOn: '2026-02-01',
      timeZone: 'UTC',
    });
    const asOf = new Date(Date.UTC(2026, 1, 16));
    const missed = getMissedDatesForReview(rule, asOf);
    expect(missed).toEqual(['2026-02-01', '2026-02-08', '2026-02-15']);
    expect(formatRecurringLocalDate(missed[0])).toBe('Feb 1, 2026');
    expect(formatCadence(rule.cadence)).toBe('Weekly');
    expect(formatStatus(rule.status)).toBe('Paused');
  });

  it('calls edit command and returns first unposted date in result', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        rule_id: 'rule-1',
        applies_from: '2026-03-01',
        status: 'active',
        material_change: true,
      },
      error: null,
    }));
    const auth = { getSession: vi.fn(async () => ({
      data: { session: { user: { id: 'auth-owner', email: 'owner@example.com', user_metadata: {} } } },
      error: null,
    })) };
    const client = { rpc, auth } as unknown as Parameters<typeof createRecurringExpenseService>[0];

    const service = createRecurringExpenseService(client);
    const updatedInput: RecurringExpenseRuleInput = {
      scopeType: 'group',
      groupId: 'group-1',
      description: 'Rent updated',
      amount: 1300,
      currency: 'USD',
      paidBy: 'owner-1',
      splitMethod: 'equal',
      splitType: 'equal',
      cadence: 'monthly',
      anchorDay: 1,
      timeZone: 'America/New_York',
      firstDueOn: '2026-01-01',
      participants: [{ userId: 'owner-1', shareAmount: 650 }, { userId: 'friend-1', shareAmount: 650 }],
    };

    const result = await service.edit('owner-1', 'rule-1', updatedInput);
    expect(result.ruleId).toBe('rule-1');
    expect(result.appliesFrom).toBe('2026-03-01');
    expect(result.materialChange).toBe(true);
  });

  it('calls pause and resume commands correctly', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { rule_id: 'rule-1', status: 'paused', next_due_on: '2026-02-01' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { rule_id: 'rule-1', status: 'active', next_due_on: '2026-03-01' },
        error: null,
      });

    const auth = { getSession: vi.fn(async () => ({
      data: { session: { user: { id: 'auth-owner', email: 'owner@example.com', user_metadata: {} } } },
      error: null,
    })) };
    const client = { rpc, auth } as unknown as Parameters<typeof createRecurringExpenseService>[0];

    const service = createRecurringExpenseService(client);
    const pauseResult = await service.pause('owner-1', 'rule-1');
    expect(pauseResult.status).toBe('paused');

    const resumeResult = await service.resume('owner-1', 'rule-1');
    expect(resumeResult.status).toBe('active');
    expect(resumeResult.nextDueOn).toBe('2026-03-01');
  });

  it('calls stop command and returns stopped and last posted dates', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        rule_id: 'rule-1',
        status: 'stopped',
        stopped_after_due_on: '2026-02-01',
        last_posted_due_on: '2026-01-01',
      },
      error: null,
    }));
    const auth = { getSession: vi.fn(async () => ({
      data: { session: { user: { id: 'auth-owner', email: 'owner@example.com', user_metadata: {} } } },
      error: null,
    })) };
    const client = { rpc, auth } as unknown as Parameters<typeof createRecurringExpenseService>[0];

    const service = createRecurringExpenseService(client);
    const stopResult = await service.stop('owner-1', 'rule-1');
    expect(stopResult.status).toBe('stopped');
    expect(stopResult.lastPostedDueOn).toBe('2026-01-01');
    expect(stopResult.stoppedAfterDueOn).toBe('2026-02-01');
  });
});
