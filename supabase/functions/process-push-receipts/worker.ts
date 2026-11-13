type Config = { supabaseUrl: string; serviceRoleKey: string; schedulerKey?: string; expoAccessToken?: string };
type Claim = { receipt_id: string; user_id: string };

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function handleReceiptRequest(request: Request, config: Config, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const schedulerKey = config.schedulerKey || config.serviceRoleKey;
  if (!schedulerKey || request.headers.get('Authorization') !== `Bearer ${schedulerKey}`) {
    return response({ error: 'Authorization required' }, 401);
  }
  if (!config.supabaseUrl || !config.serviceRoleKey) return response({ error: 'Worker is not configured' }, 500);
  const rpc = async (name: string, body: Record<string, unknown>): Promise<unknown> => {
    const result = await fetcher(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!result.ok) throw new Error('Database request failed');
    const text = await result.text();
    return text ? JSON.parse(text) : null;
  };

  try {
    const claimed = await rpc('claim_push_receipts', { p_limit: 100 });
    if (!Array.isArray(claimed)) throw new Error('Invalid claim response');
    const rows: Claim[] = claimed.filter((row): row is Claim => object(row) && typeof row.receipt_id === 'string' && typeof row.user_id === 'string');
    if (rows.length !== claimed.length) throw new Error('Invalid claim response');
    if (!rows.length) return response({ checked: 0, pending: 0 }, 200);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.expoAccessToken) headers.Authorization = `Bearer ${config.expoAccessToken}`;
    const result = await fetcher('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST', headers, body: JSON.stringify({ ids: [...new Set(rows.map(row => row.receipt_id))] }),
    });
    if (!result.ok) throw new Error('Expo receipt request failed');
    const body: unknown = await result.json();
    if (!object(body) || !object(body.data)) throw new Error('Invalid Expo receipt response');
    let checked = 0;
    for (const row of rows) {
      const receipt = body.data[row.receipt_id];
      if (!object(receipt) || (receipt.status !== 'ok' && receipt.status !== 'error')) continue;
      const rawCode = object(receipt.details) ? receipt.details.error : undefined;
      const code = typeof rawCode === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(rawCode) ? rawCode : 'UnknownError';
      await rpc('finish_push_receipt', {
        p_receipt_id: row.receipt_id,
        p_user_id: row.user_id,
        p_outcome: receipt.status === 'ok' ? 'delivered_to_provider' : 'error',
        p_error_code: receipt.status === 'ok' ? null : code,
      });
      checked += 1;
    }
    return response({ checked, pending: rows.length - checked }, 200);
  } catch {
    console.error('Push receipt worker failed');
    return response({ error: 'Receipt processing failed' }, 500);
  }
}
