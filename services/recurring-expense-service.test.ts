import { describe, expect, it, vi } from 'vitest';
import { createRecurringExpenseService, RecurringExpenseError } from '@/services/recurring-expense-service';

vi.mock('@/services/auth-profile-service', () => ({
  linkAuthUserToProfile: vi.fn(async () => ({ user: { id: 'owner-1' }, created: false })),
}));

const participant = { user_id: 'owner-1', share_amount: 120, percentage: null };
const rule = {
  id: 'rule-1', owner_id: 'owner-1', scope_type: 'friends', group_id: null,
  description: 'Rent', amount: 120, currency: 'USD', paid_by: 'owner-1',
  split_method: 'equal', split_type: 'equal', cadence: 'monthly', anchor_day: 31,
  time_zone: 'America/Chicago', first_due_on: '2026-01-31', next_due_on: '2026-02-28',
  last_due_on: null, status: 'active', paused_reason: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  participants: [participant],
};

function makeClient(response: unknown, tableResponse: { data: unknown[] | null; error: unknown | null } = {
  data: [{ id: 'rule-1', last_error: null, last_error_at: null }], error: null,
}) {
  const rpc = vi.fn(async () => ({ data: response, error: null }));
  const inFilter = vi.fn(async () => tableResponse);
  const select = vi.fn(() => ({ in: inFilter }));
  const from = vi.fn(() => ({ select }));
  const auth = { getSession: vi.fn(async () => ({
    data: { session: { user: { id: 'auth-owner', email: 'owner@example.com', user_metadata: {} } } },
    error: null,
  })) };
  const client = { rpc, from, auth } as unknown as Parameters<typeof createRecurringExpenseService>[0];
  return { client, rpc, from, select, inFilter };
}

describe('recurring expense service read boundary', () => {
  it('maps server rule data and reads posting diagnostics only for owner-visible rules', async () => {
    const { client, from, inFilter } = makeClient([rule, { ...rule, id: 'rule-2', owner_id: null }], {
      data: [{ id: 'rule-1', last_error: 'A participant left the group.', last_error_at: '2026-02-01T10:00:00Z' }],
      error: null,
    });

    const rules = await createRecurringExpenseService(client).list();

    expect(rules[0]).toMatchObject({
      id: 'rule-1', ownerId: 'owner-1', nextDueOn: '2026-02-28',
      participants: [{ userId: 'owner-1', shareAmount: 120 }],
      lastError: 'A participant left the group.', lastErrorAt: Date.parse('2026-02-01T10:00:00Z'),
    });
    expect(rules[1]).not.toHaveProperty('ownerId');
    expect(rules[1]).not.toHaveProperty('lastError');
    expect(from).toHaveBeenCalledWith('recurring_expense_rules');
    expect(inFilter).toHaveBeenCalledWith('id', ['rule-1']);
  });

  it('surfaces an owner diagnostic read failure instead of returning a clean rule', async () => {
    const { client } = makeClient([rule], { data: null, error: new TypeError('Failed to fetch') });

    await expect(createRecurringExpenseService(client).list()).rejects.toMatchObject({
      name: 'RecurringExpenseError', kind: 'offline',
      userMessage: 'You appear to be offline. Reconnect and try again.',
    });
  });

  it('surfaces an RLS-filtered owner diagnostic row instead of assuming there is no error', async () => {
    const { client } = makeClient([rule], { data: [], error: null });

    await expect(createRecurringExpenseService(client).list()).rejects.toMatchObject({
      kind: 'stale_rule',
      userMessage: 'This recurring expense changed. Refresh it and review the latest schedule.',
    });
  });

  it('does not request owner-only diagnostics for shared participant reads', async () => {
    const { client, from } = makeClient([{ ...rule, owner_id: null }]);

    const [sharedRule] = await createRecurringExpenseService(client).list();

    expect(sharedRule.ownerId).toBeUndefined();
    expect(sharedRule.lastError).toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it('returns a stale missed-date receipt so the owner can refresh without reporting success', async () => {
    const { client } = makeClient({ rule_id: 'rule-1', stale_expected_date: true, next_due_on: '2026-02-28' });
    await expect(createRecurringExpenseService(client).reviewMissedDate('owner-1', 'rule-1', '2026-01-31', 'skip')).resolves.toMatchObject({
      reviewOutcome: 'stale',
      staleExpectedDate: true,
      nextDueOn: '2026-02-28',
    });
  });

  it('preserves the stop/post race dates returned by the server', async () => {
    const { client } = makeClient({
      rule_id: 'rule-1', status: 'stopped',
      stopped_after_due_on: '2026-02-28', last_posted_due_on: '2026-01-31',
    });
    const result = await createRecurringExpenseService(client).stop('owner-1', 'rule-1');
    expect(result).toMatchObject({
      stoppedAfterDueOn: '2026-02-28',
      lastPostedDueOn: '2026-01-31',
    });
  });

  it('returns missed-date repair failures as explicit outcomes with their reason', async () => {
    const { client } = makeClient({
      rule_id: 'rule-1', status: 'paused',
      reason: 'A saved group participant is no longer a member.', reviewed: null,
    });
    const result = await createRecurringExpenseService(client).reviewMissedDate('owner-1', 'rule-1', '2026-01-31', 'post');
    expect(result).toMatchObject({
      reviewOutcome: 'needs_repair',
      reason: 'A saved group participant is no longer a member.',
      reviewed: null,
    });
  });
});

describe('recurring expense errors', () => {
  it('maps participant eligibility SQL errors to repair guidance', async () => {
    const { client } = makeClient(null);
    const rpc = vi.fn(async () => ({ data: null, error: { code: '23514', message: 'Every participant must belong to the selected group' } }));
    (client as unknown as { rpc: typeof rpc }).rpc = rpc;
    const service = createRecurringExpenseService(client);

    await expect(service.get('rule-1')).rejects.toBeInstanceOf(RecurringExpenseError);
    await expect(service.get('rule-1')).rejects.toMatchObject({
      kind: 'invalid_participant',
      userMessage: 'A participant is no longer eligible. Review the people in this recurring expense.',
    });
  });

  it('maps a posted-date uniqueness conflict to the occurrence edit path', async () => {
    const { client } = makeClient(null);
    const rpc = vi.fn(async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }));
    (client as unknown as { rpc: typeof rpc }).rpc = rpc;
    await expect(createRecurringExpenseService(client).get('rule-1')).rejects.toMatchObject({
      kind: 'already_posted_date',
      userMessage: 'That date has already posted. Edit the posted expense from its details.',
    });
  });
});
