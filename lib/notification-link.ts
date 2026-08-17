export type NotificationLinkData = {
  type?: unknown;
  expenseId?: unknown;
  groupId?: unknown;
  friendId?: unknown;
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function getNotificationHref(data: NotificationLinkData): string | null {
  const expenseId = stringValue(data.expenseId);
  const groupId = stringValue(data.groupId);
  const friendId = stringValue(data.friendId);

  switch (data.type) {
    case 'expense_added':
    case 'expense_updated':
    case 'expense_reminder':
      return expenseId ? `/expense-detail/${expenseId}` : null;
    case 'expense_deleted':
      return groupId ? `/groups/${groupId}` : null;
    case 'group_created':
    case 'member_added':
    case 'settlement_created':
      return groupId ? `/groups/${groupId}` : friendId ? `/friends/${friendId}` : null;
    case 'invitation_sent':
      return '/invitations';
    case 'invitation_accepted':
      return groupId ? `/groups/${groupId}` : friendId ? `/friends/${friendId}` : null;
    default:
      return null;
  }
}
