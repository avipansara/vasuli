export type NotificationLinkData = {
  type?: unknown;
  expenseId?: unknown;
  groupId?: unknown;
  friendId?: unknown;
  ruleId?: unknown;
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function getNotificationHref(data: NotificationLinkData): string | null {
  const expenseId = stringValue(data.expenseId);
  const groupId = stringValue(data.groupId);
  const friendId = stringValue(data.friendId);
  const ruleId = stringValue(data.ruleId);

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
    case 'recurring_rule_created':
    case 'recurring_rule_updated':
    case 'recurring_rule_paused':
    case 'recurring_rule_resumed':
      return ruleId ? `/recurring-expenses/${ruleId}` : '/recurring-expenses';
    default:
      return null;
  }
}
