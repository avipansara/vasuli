type Delivery = {
  delivery_id: string;
  event_type: string;
  push_token: string | null;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

type Rpc = (name: string, body: Record<string, unknown>) => Promise<unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function deliverQueuedNotifications(rpc: Rpc, fetcher: typeof fetch, expoAccessToken?: string): Promise<{ sent: number; skipped: number; failed: number }> {
  const claimed = await rpc('claim_push_notifications', { p_limit: 50 });
  if (!Array.isArray(claimed) || !claimed.every(row => isObject(row)
    && typeof row.delivery_id === 'string' && typeof row.event_type === 'string'
    && (typeof row.push_token === 'string' || row.push_token === null)
    && typeof row.title === 'string' && typeof row.body === 'string' && isObject(row.data))) {
    throw new Error('Invalid notification claim response');
  }
  const rows = claimed as Delivery[];
  const counts = { sent: 0, skipped: 0, failed: 0 };
  const finish = async (row: Delivery, status: 'sent' | 'skipped' | 'failed', error: string | null = null, receipt: string | null = null) => {
    await rpc('finish_push_notification', {
      p_delivery_id: row.delivery_id, p_status: status, p_token: row.push_token,
      p_receipt_id: receipt, p_error: error,
    });
    counts[status] += 1;
  };
  const ready: Delivery[] = [];
  for (const row of rows) {
    if (row.push_token?.trim()) ready.push(row);
    else await finish(row, 'skipped');
  }
  if (!ready.length) return counts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;
  let tickets: unknown[];
  try {
    const result = await fetcher('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers,
      body: JSON.stringify(ready.map(row => ({
        to: row.push_token, title: row.title, body: row.body, data: row.data,
        sound: 'default', priority: 'high', channelId: 'default',
      }))),
    });
    if (!result.ok) throw new Error('Expo request failed');
    const body: unknown = await result.json();
    if (!isObject(body) || !Array.isArray(body.data) || body.data.length !== ready.length) throw new Error('Invalid Expo response');
    tickets = body.data;
  } catch {
    for (const row of ready) await finish(row, 'failed', 'ExpoUnavailable');
    return counts;
  }
  for (let index = 0; index < ready.length; index += 1) {
    const ticket = tickets[index];
    if (isObject(ticket) && ticket.status === 'ok' && typeof ticket.id === 'string' && ticket.id) {
      await finish(ready[index], 'sent', null, ticket.id);
    } else {
      const detail = isObject(ticket) && isObject(ticket.details) ? ticket.details.error : undefined;
      const code = typeof detail === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(detail) ? detail : 'InvalidExpoTicket';
      await finish(ready[index], code === 'DeviceNotRegistered' ? 'skipped' : 'failed', code);
    }
  }
  return counts;
}
