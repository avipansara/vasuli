import { describe, expect, it, vi } from 'vitest';
import { handleRecurringExpenseRequest } from './worker';

const config = { supabaseUrl: 'https://project.example', serviceRoleKey: 'server-secret' };

function request(authorization = 'Bearer server-secret'): Request {
  return new Request('https://worker.example/process-recurring-expenses', {
    method: 'POST',
    headers: { Authorization: authorization },
  });
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('recurring expense worker', () => {
  it('requires the server credential and does not accept user requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await handleRecurringExpenseRequest(request('Bearer anon-key'), config, fetcher);
    expect(result.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await result.json()).toEqual({ error: 'Authorization required' });
  });

  it('continues after a rule posting error and stores a retry diagnostic', async () => {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const path = url.pathname.split('/').at(-1) ?? '';
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push({ path, body });
      if (path === 'claim_due_recurring_expense_rules') {
        return response([
          { rule_id: 'rule-fails', expected_due_on: '2026-09-29' },
          { rule_id: 'rule-works', expected_due_on: '2026-09-29' },
        ]);
      }
      if (path === 'post_due_recurring_expenses' && body.p_rule_id === 'rule-fails') {
        return response({ message: 'temporary database issue' }, 500);
      }
      if (path === 'post_due_recurring_expenses') {
        return response({ status: 'active', posted: [{ expense_id: 'expense-1' }] });
      }
      if (path === 'deliver_recurring_expense_activities') return response(1);
      if (path === 'claim_recurring_expense_push_deliveries') return response([]);
      return response(null);
    };

    const result = await handleRecurringExpenseRequest(request(), config, fetcher);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ rules: 2, posted: 1, ruleFailures: 1, activities: 1 });
    expect(calls).toContainEqual({
      path: 'record_recurring_expense_worker_error',
      body: expect.objectContaining({
        p_rule_id: 'rule-fails',
        p_expected_due_on: '2026-09-29',
        p_error: expect.stringContaining('Temporary server error'),
      }),
    });
    expect(calls.some((call) => call.path === 'post_due_recurring_expenses' && call.body.p_rule_id === 'rule-works')).toBe(true);
  });

  it('records a failed Expo response for retry without logging tokens', async () => {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'exp.host') return response({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] });
      const path = url.pathname.split('/').at(-1) ?? '';
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push({ path, body });
      if (path === 'claim_due_recurring_expense_rules') return response([]);
      if (path === 'deliver_recurring_expense_activities') return response(0);
      if (path === 'claim_recurring_expense_push_deliveries') {
        return response([{
          delivery_id: 'delivery-1', recipient_id: 'recipient-1', push_token: 'ExponentPushToken[private]',
          recipient_name: 'Avery', expense_id: 'expense-1', description: 'Rent', amount: 120,
          currency: 'USD', group_id: null, group_name: null, attempt_count: 0,
        }]);
      }
      return response(null);
    };

    const result = await handleRecurringExpenseRequest(request(), config, fetcher);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ pushFailed: 1, pushSent: 0 });
    expect(calls).toContainEqual({
      path: 'finish_recurring_expense_push_delivery',
      body: { p_delivery_id: 'delivery-1', p_status: 'failed', p_error: 'DeviceNotRegistered' },
    });
  });

  it('sends queued rule creation notices through the leased delivery path', async () => {
    const databaseCalls: { path: string; body: Record<string, unknown> }[] = [];
    let expoPayload: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'exp.host') {
        expoPayload = JSON.parse(String(init?.body ?? '[]')) as Record<string, unknown>[];
        return response({ data: [{ status: 'ok', id: 'expo-ticket' }] });
      }
      const path = url.pathname.split('/').at(-1) ?? '';
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      databaseCalls.push({ path, body });
      if (path === 'claim_due_recurring_expense_rules') return response([]);
      if (path === 'deliver_recurring_expense_activities') return response(0);
      if (path === 'claim_recurring_expense_push_deliveries') return response([]);
      if (path === 'claim_recurring_expense_rule_notifications') {
        return response([{
          delivery_id: 'notice-1', rule_id: 'rule-1', recipient_id: 'recipient-1',
          push_token: 'ExponentPushToken[notice-test]', event_type: 'rule_created',
          payload: { description: 'Rent', amount: 120, currency: 'USD', cadence: 'monthly', next_due_on: '2026-10-01' },
          attempt_count: 0,
        }]);
      }
      return response(null);
    };

    const result = await handleRecurringExpenseRequest(request(), config, fetcher);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ ruleNoticeSent: 1, ruleNoticeFailed: 0 });
    expect(expoPayload[0]).toMatchObject({
      title: 'New recurring expense',
      body: 'Rent · USD 120 · Monthly · Next 2026-10-01',
      data: { type: 'recurring_rule_created', ruleId: 'rule-1', recurring: true },
    });
    expect(databaseCalls).toContainEqual({
      path: 'finish_recurring_expense_rule_notification',
      body: { p_delivery_id: 'notice-1', p_status: 'sent', p_error: null },
    });
  });

  it('rejects non-POST methods before any database request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await handleRecurringExpenseRequest(new Request('https://worker.example', { method: 'GET' }), config, fetcher);
    expect(result.status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
