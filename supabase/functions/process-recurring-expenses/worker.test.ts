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

  it('allows a one-use scheduler wake-up and rejects replay', async () => {
    let consumed = false;
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname.split('/').at(-1) ?? '';
      calls.push(path);
      if (path === 'consume_recurring_worker_wakeup') {
        if (consumed) return response(false);
        consumed = true;
        return response(true);
      }
      if (path === 'deliver_recurring_expense_activities') return response(0);
      return response([]);
    };
    const wake = () => new Request('https://worker.example', {
      method: 'POST', body: JSON.stringify({ wakeupId: 'ad100000-0000-4000-8000-000000000001' }),
    });
    const first = await handleRecurringExpenseRequest(wake(), config, fetcher);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect((await handleRecurringExpenseRequest(wake(), config, fetcher)).status).toBe(401);
    expect(calls.filter(path => path === 'claim_due_recurring_expense_rules')).toHaveLength(1);
  });

  it('rejects malformed wake-ups without a database call', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await handleRecurringExpenseRequest(new Request('https://worker.example', {
      method: 'POST', body: JSON.stringify({ wakeupId: 'invalid' }),
    }), config, fetcher);
    expect(result.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an oversized wake-up before contacting the database', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await handleRecurringExpenseRequest(new Request('https://worker.example', {
      method: 'POST', body: JSON.stringify({ wakeupId: 'ad100000-0000-4000-8000-000000000001', padding: 'x'.repeat(1100) }),
    }), config, fetcher);
    expect(result.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
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
      if (path === 'claim_recurring_expense_rule_notifications') return response([]);
      return response(null);
    };

    const result = await handleRecurringExpenseRequest(request(), config, fetcher);
    expect(result.status).toBe(503);
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

  it('skips unregistered tokens and requests safe cleanup', async () => {
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
      if (path === 'claim_recurring_expense_rule_notifications') return response([]);
      return response(null);
    };

    const result = await handleRecurringExpenseRequest(request(), config, fetcher);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ pushFailed: 0, pushSkipped: 1, pushSent: 0 });
    expect(calls).toContainEqual({
      path: 'finish_recurring_push_with_receipt',
      body: { p_kind: 'occurrence', p_delivery_id: 'delivery-1', p_status: 'skipped', p_error: 'DeviceNotRegistered', p_token: 'ExponentPushToken[private]', p_receipt_id: null },
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
      path: 'finish_recurring_push_with_receipt',
      body: { p_kind: 'rule', p_delivery_id: 'notice-1', p_status: 'sent', p_error: null, p_token: 'ExponentPushToken[notice-test]', p_receipt_id: 'expo-ticket' },
    });
  });

  it('reports activity delivery failure without suppressing other work', async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname.split('/').at(-1) ?? '';
      calls.push(path);
      if (path === 'deliver_recurring_expense_activities') return response({}, 503);
      return response([]);
    };
    const result = await handleRecurringExpenseRequest(request(), config, fetcher);
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ activityFailed: 1 });
    expect(calls).toContain('claim_recurring_expense_push_deliveries');
  });

  it('reports a receipt persistence failure without marking the push sent', async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'exp.host') return response({ data: [{ status: 'ok', id: 'ticket' }] });
      const path = url.pathname.split('/').at(-1) ?? '';
      calls.push(path);
      if (path === 'claim_recurring_expense_push_deliveries') return response([{
        delivery_id: 'one', recipient_id: 'friend', push_token: 'token', recipient_name: 'Sam',
        expense_id: 'expense', description: 'Rent', amount: 1, currency: 'USD', group_id: null, group_name: null, attempt_count: 0,
      }]);
      if (path === 'finish_recurring_push_with_receipt') return response({}, 503);
      if (path === 'deliver_recurring_expense_activities') return response(0);
      return response([]);
    };
    const result = await handleRecurringExpenseRequest(request(), config, fetcher);
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ pushFailed: 1, pushSent: 0 });
    expect(calls).not.toContain('finish_recurring_expense_push_delivery');
  });

  it('rejects non-POST methods before any database request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await handleRecurringExpenseRequest(new Request('https://worker.example', { method: 'GET' }), config, fetcher);
    expect(result.status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
