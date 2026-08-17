import { describe, expect, it } from 'vitest';

import { getNotificationHref } from '@/lib/notification-link';

describe('getNotificationHref', () => {
  it('links expense notifications to the expense detail', () => {
    expect(getNotificationHref({ type: 'expense_added', expenseId: 'expense-1' }))
      .toBe('/expense-detail/expense-1');
    expect(getNotificationHref({ type: 'expense_updated', expenseId: 'expense-1' }))
      .toBe('/expense-detail/expense-1');
  });

  it('links group and friend notifications to their detail screens', () => {
    expect(getNotificationHref({ type: 'member_added', groupId: 'group-1' })).toBe('/group/group-1');
    expect(getNotificationHref({ type: 'invitation_accepted', friendId: 'friend-1' })).toBe('/friend/friend-1');
  });

  it('returns null when a destination id is missing', () => {
    expect(getNotificationHref({ type: 'expense_added' })).toBeNull();
    expect(getNotificationHref({ type: 'expense_deleted' })).toBeNull();
  });
});
