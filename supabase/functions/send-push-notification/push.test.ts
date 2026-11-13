import { describe, expect, it } from 'vitest';

import { buildExpoMessages, chunk, parsePushNotificationBody, readPushTickets, tokenBatches } from './push';

describe('Expo push tickets', () => {
  it('distinguishes accepted and rejected messages without retaining Expo error text', () => {
    expect(readPushTickets({ data: [
      { status: 'ok', id: 'receipt-1' },
      { status: 'error', message: 'contains a token', details: { error: 'DeviceNotRegistered' } },
    ] }, 2)).toEqual([{ status: 'ok', id: 'receipt-1' }, { status: 'error', code: 'DeviceNotRegistered' }]);
  });

  it('rejects incomplete or malformed responses', () => {
    expect(readPushTickets({ data: [{ status: 'ok', id: 'receipt-1' }] }, 2)).toBeNull();
    expect(readPushTickets({ data: [{ status: 'ok' }] }, 1)).toBeNull();
  });
});

describe('parsePushNotificationBody', () => {
  it('accepts tokens + notification', () => {
    const r = parsePushNotificationBody({
      tokens: ['ExponentPushToken[x]', 'ExponentPushToken[y]'],
      notification: {
        type: 'invitation_sent',
        title: 'Hi',
        body: 'You were invited',
        data: { inviterName: 'Sam' },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tokens).toEqual(['ExponentPushToken[x]', 'ExponentPushToken[y]']);
      expect(r.notification.type).toBe('invitation_sent');
      expect(r.notification.title).toBe('Hi');
      expect(r.notification.data?.inviterName).toBe('Sam');
    }
  });

  it('accepts single token aliases', () => {
    const r = parsePushNotificationBody({
      push_token: 'ExponentPushToken[z]',
      notification: {
        type: 'expense_added',
        title: 'Expense',
        body: 'Someone added one',
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tokens).toEqual(['ExponentPushToken[z]']);
    }
  });

  it('dedupes tokens', () => {
    const r = parsePushNotificationBody({
      tokens: ['ExponentPushToken[a]', 'ExponentPushToken[a]'],
      notification: {
        type: 'member_added',
        title: 'T',
        body: 'B',
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tokens).toEqual(['ExponentPushToken[a]']);
  });

  it('accepts expense update notifications', () => {
    const r = parsePushNotificationBody({
      tokens: ['ExponentPushToken[a]'],
      notification: {
        type: 'expense_updated',
        title: 'Expense Updated',
        body: 'Someone edited an expense',
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.notification.type).toBe('expense_updated');
  });

  it('accepts expense delete notifications', () => {
    const r = parsePushNotificationBody({
      tokens: ['ExponentPushToken[a]'],
      notification: {
        type: 'expense_deleted',
        title: 'Expense Deleted',
        body: 'Someone deleted an expense',
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.notification.type).toBe('expense_deleted');
  });

  it.each(['recurring_rule_created', 'recurring_rule_updated'] as const)(
    'accepts %s rule notices',
    (type) => {
      const result = parsePushNotificationBody({
        tokens: ['ExponentPushToken[a]'],
        notification: { type, title: 'Recurring expense', body: 'Monthly rent' },
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.notification.type).toBe(type);
    },
  );

  it('rejects unknown notification type', () => {
    const r = parsePushNotificationBody({
      tokens: ['ExponentPushToken[a]'],
      notification: {
        type: 'unknown_type',
        title: 'T',
        body: 'B',
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok && 'missing' in r) {
      expect(r.missing.some((m) => m.includes('notification'))).toBe(true);
    }
  });

  it('returns missing when no tokens', () => {
    const r = parsePushNotificationBody({
      tokens: [],
      notification: { type: 'group_created', title: 'T', body: 'B' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok && 'missing' in r) expect(r.missing).toContain('tokens');
  });

  it('rejects non-object body', () => {
    expect(parsePushNotificationBody(null).ok).toBe(false);
    expect(parsePushNotificationBody('x').ok).toBe(false);
  });
});

describe('buildExpoMessages', () => {
  it('embeds type in data', () => {
    const msgs = buildExpoMessages(['ExponentPushToken[1]'], {
      type: 'settlement_created',
      title: 'Pay',
      body: 'Done',
      data: { amount: 10 },
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].to).toBe('ExponentPushToken[1]');
    expect((msgs[0].data as Record<string, unknown>).type).toBe('settlement_created');
    expect((msgs[0].data as Record<string, unknown>).amount).toBe(10);
  });
});

describe('chunk / tokenBatches', () => {
  it('chunks to 100', () => {
    const arr = Array.from({ length: 250 }, (_, i) => String(i));
    expect(chunk(arr, 100).length).toBe(3);
    expect(tokenBatches(arr).map((b) => b.length)).toEqual([100, 100, 50]);
  });
});
