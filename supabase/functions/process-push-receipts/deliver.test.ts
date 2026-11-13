import { describe, expect, it, vi } from 'vitest';
import { deliverQueuedNotifications } from './deliver';

const delivery = (id: string, token: string | null) => ({
  delivery_id: id, event_type: 'settlement_reversed', push_token: token,
  title: 'Payment deleted', body: 'A payment was deleted',
  data: { type: 'settlement_reversed', friendId: 'actor' },
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('queued notification delivery', () => {
  it('records accepted tickets, removes invalid tokens and skips absent tokens', async () => {
    const rpc = vi.fn(async (name: string) => name === 'claim_push_notifications'
      ? [delivery('accepted', 'token-a'), delivery('invalid', 'token-b'), delivery('missing', null)] : null);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [
      { status: 'ok', id: 'ticket-a' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ] }));
    expect(await deliverQueuedNotifications(rpc, fetcher)).toEqual({ sent: 1, skipped: 2, failed: 0 });
    expect(rpc).toHaveBeenCalledWith('finish_push_notification', expect.objectContaining({ p_delivery_id: 'accepted', p_status: 'sent', p_receipt_id: 'ticket-a', p_token: 'token-a' }));
    expect(rpc).toHaveBeenCalledWith('finish_push_notification', expect.objectContaining({ p_delivery_id: 'invalid', p_status: 'skipped', p_error: 'DeviceNotRegistered' }));
    const messages = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(messages).toHaveLength(2);
    expect(messages[0].data).toEqual({ type: 'settlement_reversed', friendId: 'actor' });
  });

  it('marks an unavailable Expo batch for retry', async () => {
    const rpc = vi.fn(async (name: string) => name === 'claim_push_notifications' ? [delivery('one', 'token-a')] : null);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, 503));
    expect(await deliverQueuedNotifications(rpc, fetcher)).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(rpc).toHaveBeenCalledWith('finish_push_notification', expect.objectContaining({ p_delivery_id: 'one', p_status: 'failed', p_error: 'ExpoUnavailable' }));
  });
});
