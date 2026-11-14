import type { PushNotificationPayload } from './push.ts';

// Old app versions still send expense pushes after the server has queued them.
export async function filterQueuedExpenseTokens(
  tokens: string[], notification: PushNotificationPayload,
  config: { supabaseUrl: string; serviceRoleKey: string }, fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const expenseId = notification.data?.expenseId;
  if (notification.type !== 'expense_added' || typeof expenseId !== 'string' || !expenseId) return tokens;
  if (!config.supabaseUrl || !config.serviceRoleKey) throw new Error('Missing server configuration');
  const response = await fetcher(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/queued_expense_push_tokens`, {
    method: 'POST',
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_expense_id: expenseId, p_tokens: tokens }),
  });
  const result: unknown = await response.json();
  // Before the outbox migration, the old app remains responsible for sending.
  if (response.status === 404 && result && typeof result === 'object' && 'code' in result && result.code === 'PGRST202') return tokens;
  if (!response.ok || !Array.isArray(result) || !result.every((token) => typeof token === 'string')) {
    throw new Error('Could not check queued expense notifications');
  }
  const queued = new Set(result);
  return tokens.filter((token) => !queued.has(token));
}
