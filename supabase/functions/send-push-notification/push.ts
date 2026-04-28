/** Matches app `PushNotificationData.type` in services/notification-service.ts */
export type PushNotificationType =
  | 'expense_added'
  | 'expense_reminder'
  | 'group_created'
  | 'member_added'
  | 'invitation_sent'
  | 'invitation_accepted'
  | 'settlement_created';

export interface PushNotificationPayload {
  type: PushNotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type ParsedPushBody =
  | { ok: true; tokens: string[]; notification: PushNotificationPayload }
  | { ok: false; missing: string[] }
  | { ok: false; invalid: true };

const EXPO_BATCH_SIZE = 100;

const ALLOWED_TYPES = new Set<string>([
  'expense_added',
  'expense_reminder',
  'group_created',
  'member_added',
  'invitation_sent',
  'invitation_accepted',
  'settlement_created',
]);

function readString(o: Record<string, unknown>, camel: string, snake: string): string {
  const v = o[camel] ?? o[snake];
  return typeof v === 'string' ? v.trim() : '';
}

function readOptionalData(o: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = o.data;
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

function parseNotificationObject(raw: unknown): PushNotificationPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const n = raw as Record<string, unknown>;
  const type = readString(n, 'type', 'type');
  const title = readString(n, 'title', 'title');
  const body = readString(n, 'body', 'body');
  const data = readOptionalData(n);
  if (!type || !title || !body) return null;
  if (!ALLOWED_TYPES.has(type)) return null;
  return { type: type as PushNotificationType, title, body, data };
}

export function parsePushNotificationBody(raw: unknown): ParsedPushBody {
  if (!raw || typeof raw !== 'object') return { ok: false, invalid: true };
  const o = raw as Record<string, unknown>;

  const single = readString(o, 'token', 'push_token');
  const tokensRaw = o.tokens ?? o.expo_push_tokens;
  const tokens: string[] = [];
  if (single) tokens.push(single);
  if (Array.isArray(tokensRaw)) {
    for (const t of tokensRaw) {
      if (typeof t === 'string' && t.trim()) tokens.push(t.trim());
    }
  }
  const unique = [...new Set(tokens)];

  const notification = parseNotificationObject(o.notification);

  const missing: string[] = [];
  if (unique.length === 0) missing.push('tokens');
  if (!notification) {
    missing.push('notification');
  } else {
    if (!notification.title) missing.push('notification.title');
    if (!notification.body) missing.push('notification.body');
  }

  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, tokens: unique, notification: notification! };
}

export function buildExpoMessages(
  tokens: string[],
  notification: PushNotificationPayload,
): Record<string, unknown>[] {
  const data = { ...notification.data, type: notification.type };
  return tokens.map((to) => ({
    to,
    sound: 'default',
    title: notification.title,
    body: notification.body,
    data,
    priority: 'high',
    channelId: 'default',
  }));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function tokenBatches(tokens: string[]): string[][] {
  return chunk(tokens, EXPO_BATCH_SIZE);
}
