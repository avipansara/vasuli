import { describe, expect, it } from 'vitest';

import { getNotificationHref } from '@/lib/notification-link';

describe('getNotificationHref', () => {
  it('links expense notifications to the expense detail', () => {
    expect(getNotificationHref({ type: 'expense_added', expenseId: 'expense-1' }))
      .toBe('/expense-detail/expense-1');
    expect(getNotificationHref({ type: 'expense_updated', expenseId: 'expense-1' }))
      .toBe('/expense-detail/expense-1');
  });

  it('opens a posted recurring expense and its rule from their respective notifications', () => {
    const occurrenceNotification = {
      type: 'expense_added',
      expenseId: 'occurrence-1',
      ruleId: 'rule-1',
      recurring: true,
    };
    expect(getNotificationHref(occurrenceNotification)).toBe('/expense-detail/occurrence-1');
    expect(getNotificationHref({ type: 'recurring_rule_created', ruleId: 'rule-1' }))
      .toBe('/recurring-expenses/rule-1');
    expect(getNotificationHref({ type: 'recurring_rule_updated', ruleId: 'rule-1' }))
      .toBe('/recurring-expenses/rule-1');
    expect(getNotificationHref({ type: 'recurring_rule_paused', ruleId: 'rule-1' }))
      .toBe('/recurring-expenses/rule-1');
    expect(getNotificationHref({ type: 'recurring_rule_resumed', ruleId: 'rule-1' }))
      .toBe('/recurring-expenses/rule-1');
    expect(getNotificationHref({ type: 'expense_added', ruleId: 'rule-1' })).toBeNull();
    expect(getNotificationHref({ type: 'recurring_rule_paused' })).toBe('/recurring-expenses');
    expect(getNotificationHref({ type: 'recurring_rule_resumed', ruleId: 42 }))
      .toBe('/recurring-expenses');
    expect(getNotificationHref({ type: 'recurring_rule_updated', ruleId: '' }))
      .toBe('/recurring-expenses');
  });

  it('links group and friend notifications to their detail screens', () => {
    expect(getNotificationHref({ type: 'member_added', groupId: 'group-1' })).toBe('/groups/group-1');
    expect(getNotificationHref({ type: 'invitation_accepted', friendId: 'friend-1' })).toBe('/friends/friend-1');
  });

  it('returns null when a destination id is missing', () => {
    expect(getNotificationHref({ type: 'expense_added' })).toBeNull();
    expect(getNotificationHref({ type: 'expense_deleted' })).toBeNull();
  });
});
