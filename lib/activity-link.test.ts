import { describe, expect, it } from 'vitest';

import { getActivityHref } from '@/lib/activity-link';
import { ActivityType, type Activity } from '@/types/database';

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 'activity-1',
    type: ActivityType.EXPENSE_CREATED,
    userId: 'friend-1',
    targetId: 'expense-1',
    description: 'Dinner',
    createdAt: 1,
    ...overrides,
  };
}

describe('getActivityHref', () => {
  it('links active expense activities to the expense detail', () => {
    expect(getActivityHref(activity({ type: ActivityType.EXPENSE_CREATED }))).toBe('/expense-detail/expense-1');
    expect(getActivityHref(activity({ type: ActivityType.EXPENSE_UPDATED }))).toBe('/expense-detail/expense-1');
  });

  it('links deleted expense activities to the group when available', () => {
    expect(
      getActivityHref(activity({ type: ActivityType.EXPENSE_DELETED, groupId: 'group-1' }))
    ).toBe('/group/group-1');
  });

  it('links group and member activities to the group detail', () => {
    expect(getActivityHref(activity({ type: ActivityType.GROUP_CREATED, targetId: 'group-1' }))).toBe('/group/group-1');
    expect(getActivityHref(activity({ type: ActivityType.MEMBER_ADDED, groupId: 'group-2' }))).toBe('/group/group-2');
  });

  it('links ungrouped settlement activities to the other user when known', () => {
    expect(
      getActivityHref(
        activity({ type: ActivityType.SETTLEMENT_CREATED, userId: 'friend-1', targetId: 'settlement-1' }),
        'current-user'
      )
    ).toBe('/friend/friend-1');
  });

  it('does not link deleted ungrouped expenses or current-user-only settlements', () => {
    expect(getActivityHref(activity({ type: ActivityType.EXPENSE_DELETED }))).toBeNull();
    expect(
      getActivityHref(
        activity({ type: ActivityType.SETTLEMENT_CREATED, userId: 'current-user', targetId: 'settlement-1' }),
        'current-user'
      )
    ).toBeNull();
  });
});
