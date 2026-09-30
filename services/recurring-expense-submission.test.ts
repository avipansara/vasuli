import { describe, expect, it, vi } from 'vitest';
import type { RecurringExpenseRuleCommandResult, RecurringExpenseRuleInput } from '@/types/database';
import { createRecurringExpenseSubmission, waitForRecurringOccurrence } from './recurring-expense-submission';

const rule: RecurringExpenseRuleInput = {
  scopeType: 'friends',
  description: 'Rent',
  amount: 120,
  currency: 'USD',
  paidBy: 'owner',
  splitMethod: 'equal',
  splitType: 'equal',
  cadence: 'monthly',
  anchorDay: 31,
  timeZone: 'America/Chicago',
  firstDueOn: '2026-09-29',
  participants: [
    { userId: 'owner', shareAmount: 60 },
    { userId: 'friend', shareAmount: 60 },
  ],
};

const created: RecurringExpenseRuleCommandResult = { ruleId: 'new-rule', status: 'active', nextDueOn: '2026-09-29' };

describe('recurring expense submission', () => {
  it('lets the owner retry after an offline result without creating a rule', async () => {
    const create = vi.fn().mockResolvedValue(created);
    let online = false;
    const submission = createRecurringExpenseSubmission({ isOnline: async () => online, create });

    await expect(submission.save(rule, async () => 'cancel')).resolves.toEqual({ status: 'offline' });
    expect(create).not.toHaveBeenCalled();

    online = true;
    await expect(submission.save(rule, async () => 'cancel')).resolves.toEqual({ status: 'created', result: created });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('preserves a future first-expense date in the create request', async () => {
    const futureRule = { ...rule, firstDueOn: '2026-09-30' };
    const create = vi.fn().mockResolvedValue({ ...created, nextDueOn: '2026-09-30' });
    const submission = createRecurringExpenseSubmission({ isOnline: async () => true, create });

    await expect(submission.save(futureRule, async () => 'cancel')).resolves.toEqual({
      status: 'created',
      result: { ...created, nextDueOn: '2026-09-30' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(futureRule, false);
  });

  it('allows inspecting a similar rule without creating another', async () => {
    const create = vi.fn().mockResolvedValue({ duplicateWarning: true, existingRuleId: 'existing-rule' });
    const chooseDuplicate = vi.fn().mockResolvedValue('inspect' as const);
    const submission = createRecurringExpenseSubmission({ isOnline: async () => true, create });

    await expect(submission.save(rule, chooseDuplicate)).resolves.toEqual({ status: 'inspect', existingRuleId: 'existing-rule' });
    expect(chooseDuplicate).toHaveBeenCalledWith('existing-rule');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('creates a similar rule only after explicit confirmation', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ duplicateWarning: true, existingRuleId: 'existing-rule' })
      .mockResolvedValueOnce(created);
    const submission = createRecurringExpenseSubmission({ isOnline: async () => true, create });

    await expect(submission.save(rule, async () => 'create_another')).resolves.toEqual({ status: 'created', result: created });
    expect(create).toHaveBeenNthCalledWith(1, rule, false);
    expect(create).toHaveBeenNthCalledWith(2, rule, true);
  });

  it('does not start a second create while the connectivity check is in flight', async () => {
    let finishConnectivity!: (online: boolean) => void;
    const isOnline = vi.fn(() => new Promise<boolean>(resolve => { finishConnectivity = resolve; }));
    const create = vi.fn().mockResolvedValue(created);
    const submission = createRecurringExpenseSubmission({ isOnline, create });

    const first = submission.save(rule, async () => 'cancel');
    await expect(submission.save(rule, async () => 'cancel')).resolves.toEqual({ status: 'in_progress' });
    finishConnectivity(true);
    await expect(first).resolves.toEqual({ status: 'created', result: created });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps a due-today rule waiting until the server confirms its occurrence', async () => {
    const hasOccurrence = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(waitForRecurringOccurrence(hasOccurrence, { attempts: 3, intervalMs: 10, wait })).resolves.toBe(true);
    expect(hasOccurrence).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(10);
  });

  it('does not report posted when checking the server occurrence fails', async () => {
    await expect(waitForRecurringOccurrence(async () => { throw new Error('network unavailable'); }, {
      attempts: 1,
    })).rejects.toThrow('network unavailable');
  });
});
