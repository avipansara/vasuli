import { describe, expect, it, vi } from 'vitest';
import { handleReceiptRequest } from './worker';

const config = { supabaseUrl: 'https://db.example', serviceRoleKey: 'trusted-key' };
const request = (key = 'trusted-key') => new Request('https://worker.example', { method: 'POST', headers: { Authorization: `Bearer ${key}` } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('push receipt worker', () => {
  it('rejects untrusted requests before accessing the database', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await handleReceiptRequest(request('anon'), config, fetcher)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows a single-use wake-up to send queued pushes without checking receipts', async () => {
    const wakeupId = 'ad100000-0000-4000-8000-000000000001';
    let consumed = false;
    const paths: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname.split('/').at(-1) ?? '';
      paths.push(path);
      if (path === 'consume_push_wakeup') {
        if (consumed) return json(null);
        consumed = true;
        return json('delivery');
      }
      if (path === 'claim_push_notifications') return json([]);
      throw new Error('Unexpected request');
    };
    const wake = () => new Request('https://worker.example', { method: 'POST', body: JSON.stringify({ wakeupId }) });
    const first = await handleReceiptRequest(wake(), config, fetcher);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect((await handleReceiptRequest(wake(), config, fetcher)).status).toBe(401);
    expect(paths).toEqual(['consume_push_wakeup', 'claim_push_notifications', 'consume_push_wakeup']);
  });

  it('checks receipts for a single-use scheduled wake-up', async () => {
    const paths: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname.split('/').at(-1) ?? '';
      paths.push(path);
      if (path === 'consume_push_wakeup') return json('scheduled');
      if (path === 'claim_push_notifications' || path === 'claim_push_receipts') return json([]);
      throw new Error('Unexpected request');
    };
    const result = await handleReceiptRequest(new Request('https://worker.example', {
      method: 'POST', body: JSON.stringify({ wakeupId: 'ad100000-0000-4000-8000-000000000001' }),
    }), config, fetcher);
    expect(result.status).toBe(200);
    expect(paths).toEqual(['consume_push_wakeup', 'claim_push_notifications', 'claim_push_receipts']);
  });

  it('rejects malformed wake-ups without contacting the database', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await handleReceiptRequest(new Request('https://worker.example', {
      method: 'POST', body: JSON.stringify({ wakeupId: 'not-a-uuid' }),
    }), config, fetcher);
    expect(result.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts the configured scheduler credential while using the service credential for database access', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json([]));
    const result = await handleReceiptRequest(request('scheduler-key'), { ...config, schedulerKey: 'scheduler-key' }, fetcher);
    expect(result.status).toBe(200);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer trusted-key');
  });

  it('records provider outcomes and leaves missing receipts for retry', async () => {
    const finished: unknown[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/claim_push_notifications')) return json([]);
      if (url.endsWith('/claim_push_receipts')) return json([
        { receipt_id: 'one', user_id: 'user-1' },
        { receipt_id: 'two', user_id: 'user-2' },
        { receipt_id: 'three', user_id: 'user-3' },
      ]);
      if (url.includes('exp.host')) return json({ data: {
        one: { status: 'ok' },
        two: { status: 'error', message: 'private data', details: { error: 'DeviceNotRegistered' } },
      } });
      if (url.endsWith('/finish_push_receipt')) {
        finished.push(JSON.parse(String(init?.body)));
        return json(null);
      }
      throw new Error('Unexpected request');
    };
    const result = await handleReceiptRequest(request(), config, fetcher);
    expect(await result.json()).toEqual({ checked: 2, pending: 1, deliveryFailed: false, delivery: { sent: 0, skipped: 0, failed: 0 } });
    expect(finished).toEqual([
      { p_receipt_id: 'one', p_user_id: 'user-1', p_outcome: 'delivered_to_provider', p_error_code: null },
      { p_receipt_id: 'two', p_user_id: 'user-2', p_outcome: 'error', p_error_code: 'DeviceNotRegistered' },
    ]);
  });

  it('leaves claims retryable if Expo is unavailable', async () => {
    const fetcher: typeof fetch = async (input) => String(input).includes('exp.host')
      ? json({}, 503) : String(input).endsWith('/claim_push_notifications') ? json([]) : json([{ receipt_id: 'one', user_id: 'user-1' }]);
    expect((await handleReceiptRequest(request(), config, fetcher)).status).toBe(500);
  });

  it('continues checking receipts when the outbox is unavailable', async () => {
    const finish = vi.fn();
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/claim_push_notifications')) return json({}, 503);
      if (url.endsWith('/claim_push_receipts')) return json([{ receipt_id: 'one', user_id: 'user-1' }]);
      if (url.includes('exp.host')) return json({ data: { one: { status: 'ok' } } });
      if (url.endsWith('/finish_push_receipt')) { finish(); return json(null); }
      throw new Error('Unexpected request');
    };
    const result = await handleReceiptRequest(request(), config, fetcher);
    expect(result.status).toBe(500);
    expect(finish).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
