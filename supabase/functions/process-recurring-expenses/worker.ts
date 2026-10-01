export const DEFAULT_BATCH_SIZE = 50;
export const MAX_BATCH_SIZE = 100;
export const MAX_PUSH_ATTEMPTS = 10;
export const PUSH_BATCH_SIZE = 100;
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  batchSize?: number;
  expoAccessToken?: string;
}

type JsonObject = Record<string, unknown>;

interface DueRule {
  rule_id: string;
  expected_due_on: string;
}

interface OccurrencePushDelivery {
  delivery_id: string;
  recipient_id: string;
  push_token: string | null;
  recipient_name: string;
  expense_id: string;
  description: string;
  amount: number;
  currency: string;
  group_id: string | null;
  group_name: string | null;
  attempt_count: number;
}

interface RuleNoticeDelivery {
  delivery_id: string;
  rule_id: string;
  recipient_id: string;
  push_token: string | null;
  event_type: 'rule_created' | 'rule_updated';
  payload: JsonObject;
  attempt_count: number;
}

interface PushMessageDelivery {
  delivery_id: string;
  push_token: string | null;
  finish_function: 'finish_recurring_expense_push_delivery' | 'finish_recurring_expense_rule_notification';
  title: string;
  body: string;
  data: JsonObject;
}

function jsonResponse(body: JsonObject, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function arrayData<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function parseBatchSize(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, value));
}

async function supabaseRequest<T>(
  config: WorkerConfig,
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`;
  const response = await fetcher(url, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  if (!body) return undefined as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('Database returned an invalid response');
  }
}

async function rpc<T>(
  config: WorkerConfig,
  functionName: string,
  args: JsonObject,
  fetcher: typeof fetch,
): Promise<T> {
  return await supabaseRequest<T>(config, `rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(args),
  }, fetcher);
}

async function finishDelivery(
  config: WorkerConfig,
  deliveryId: string,
  finishFunction: PushMessageDelivery['finish_function'],
  status: 'sent' | 'skipped' | 'failed',
  failure: string | null,
  fetcher: typeof fetch,
): Promise<void> {
  await rpc(config, finishFunction, {
    p_delivery_id: deliveryId,
    p_status: status,
    p_error: failure,
  }, fetcher);
}

async function deliverPushes(
  config: WorkerConfig,
  deliveries: PushMessageDelivery[],
  fetcher: typeof fetch,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const ready: PushMessageDelivery[] = [];
  let skipped = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    if (delivery.push_token?.trim()) {
      ready.push(delivery);
    } else {
      try {
        await finishDelivery(config, delivery.delivery_id, delivery.finish_function, 'skipped', null, fetcher);
        skipped += 1;
      } catch {
        failed += 1;
      }
    }
  }

  let sent = 0;
  for (let start = 0; start < ready.length; start += PUSH_BATCH_SIZE) {
    const batch = ready.slice(start, start + PUSH_BATCH_SIZE);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.expoAccessToken) headers.Authorization = `Bearer ${config.expoAccessToken}`;
    let response: Response;
    let tickets: unknown[] = [];
    try {
      response = await fetcher(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map((delivery) => ({
          to: delivery.push_token,
          sound: 'default',
          title: delivery.title,
          body: delivery.body,
          data: delivery.data,
          priority: 'high',
          channelId: 'default',
        }))),
      });
      const body: unknown = await response.json();
      tickets = isObject(body) && Array.isArray(body.data) ? body.data : [];
      if (!response.ok) throw new Error(`Expo push service returned ${response.status}`);
      if (tickets.length !== batch.length) throw new Error('Expo returned an incomplete push response');
    } catch (error: unknown) {
      const message = errorMessage(error).slice(0, 500);
      for (const delivery of batch) {
        try {
          await finishDelivery(config, delivery.delivery_id, delivery.finish_function, 'failed', message, fetcher);
        } catch {
          failed += 1;
          continue;
        }
        failed += 1;
      }
      continue;
    }

    for (let index = 0; index < batch.length; index += 1) {
      const ticket = tickets[index];
      const ticketObject = isObject(ticket) ? ticket : {};
      const ticketError = ticketObject.status === 'error'
        ? (isObject(ticketObject.details) && typeof ticketObject.details.error === 'string'
          ? ticketObject.details.error
          : 'Expo rejected the push notification')
        : ticketObject.status === 'ok'
          ? null
          : 'Expo returned an invalid push ticket';
      const status = ticketError ? 'failed' : 'sent';
      try {
        await finishDelivery(config, batch[index].delivery_id, batch[index].finish_function, status, ticketError, fetcher);
        if (status === 'sent') sent += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { sent, skipped, failed };
}

function toOccurrencePush(row: OccurrencePushDelivery): PushMessageDelivery {
  return {
    delivery_id: row.delivery_id,
    push_token: row.push_token,
    finish_function: 'finish_recurring_expense_push_delivery',
    title: 'Recurring expense added',
    body: `${row.description} · ${row.currency} ${row.amount}`,
    data: {
      type: 'expense_added',
      expenseId: row.expense_id,
      groupId: row.group_id,
      recurring: true,
    },
  };
}

function toRuleNoticePush(row: RuleNoticeDelivery): PushMessageDelivery {
  const description = typeof row.payload.description === 'string' ? row.payload.description : 'Recurring expense';
  const currency = typeof row.payload.currency === 'string' ? row.payload.currency : '';
  const amount = typeof row.payload.amount === 'number' || typeof row.payload.amount === 'string'
    ? String(row.payload.amount)
    : '';
  const cadence = row.payload.cadence === 'weekly' ? 'Weekly' : 'Monthly';
  const nextDate = typeof row.payload.next_due_on === 'string' ? row.payload.next_due_on : null;
  const text = [description, [currency, amount].filter(Boolean).join(' '), cadence, nextDate ? `Next ${nextDate}` : null]
    .filter(Boolean)
    .join(' · ');
  return {
    delivery_id: row.delivery_id,
    push_token: row.push_token,
    finish_function: 'finish_recurring_expense_rule_notification',
    title: row.event_type === 'rule_created' ? 'New recurring expense' : 'Recurring expense updated',
    body: text,
    data: {
      type: row.event_type === 'rule_created' ? 'recurring_rule_created' : 'recurring_rule_updated',
      ruleId: row.rule_id,
      recurring: true,
    },
  };
}

export async function handleRecurringExpenseRequest(
  request: Request,
  config: WorkerConfig,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!config.serviceRoleKey || request.headers.get('Authorization') !== `Bearer ${config.serviceRoleKey}`) {
    return jsonResponse({ error: 'Authorization required' }, 401);
  }
  if (!config.supabaseUrl) return jsonResponse({ error: 'Worker is not configured' }, 500);

  const batchSize = parseBatchSize(config.batchSize);
  const summary = {
    rules: 0, posted: 0, paused: 0, ruleFailures: 0, activities: 0,
    pushSent: 0, pushSkipped: 0, pushFailed: 0,
    ruleNoticeSent: 0, ruleNoticeSkipped: 0, ruleNoticeFailed: 0,
  };
  try {
    const dueRules = arrayData<DueRule>(await rpc(config, 'claim_due_recurring_expense_rules', {
      p_limit: batchSize,
    }, fetcher));

    for (const rule of dueRules) {
      summary.rules += 1;
      try {
        const result = await rpc<unknown>(config, 'post_due_recurring_expenses', {
          p_rule_id: rule.rule_id,
          p_expected_due_on: rule.expected_due_on,
        }, fetcher);
        if (isObject(result)) {
          const posted = Array.isArray(result.posted) ? result.posted.length : 0;
          summary.posted += posted;
          if (result.status === 'paused') summary.paused += 1;
        }
      } catch {
        summary.ruleFailures += 1;
        try {
          await rpc(config, 'record_recurring_expense_worker_error', {
            p_rule_id: rule.rule_id,
            p_expected_due_on: rule.expected_due_on,
            p_error: 'Temporary server error while posting a due occurrence. The worker will retry.',
          }, fetcher);
        } catch {
          // The scheduled invocation result still reports the failed rule.
        }
      }
    }

    try {
      const delivered = await rpc<unknown>(config, 'deliver_recurring_expense_activities', {
        p_limit: batchSize,
      }, fetcher);
      summary.activities = typeof delivered === 'number' ? delivered : 0;
    } catch {
      // Outbox rows remain pending and will be retried by the next invocation.
    }

    try {
      const deliveries = arrayData<OccurrencePushDelivery>(await rpc(config, 'claim_recurring_expense_push_deliveries', {
        p_limit: batchSize,
      }, fetcher));
      const pushed = await deliverPushes(config, deliveries.map(toOccurrencePush), fetcher);
      summary.pushSent = pushed.sent;
      summary.pushSkipped = pushed.skipped;
      summary.pushFailed = pushed.failed;
    } catch {
      summary.pushFailed += 1;
    }

    try {
      const notices = arrayData<RuleNoticeDelivery>(await rpc(config, 'claim_recurring_expense_rule_notifications', {
        p_limit: batchSize,
      }, fetcher));
      const delivered = await deliverPushes(config, notices.map(toRuleNoticePush), fetcher);
      summary.ruleNoticeSent = delivered.sent;
      summary.ruleNoticeSkipped = delivered.skipped;
      summary.ruleNoticeFailed = delivered.failed;
    } catch {
      summary.ruleNoticeFailed += 1;
    }

    return jsonResponse(summary, 200);
  } catch {
    // Keep diagnostics useful without putting credentials or raw database
    // responses in Edge Function logs or HTTP responses.
    console.error('Recurring expense worker could not read its due batch.');
    return jsonResponse({ error: 'Recurring expense worker failed to read due work' }, 500);
  }
}
