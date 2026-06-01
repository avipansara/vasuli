import { ActivityType, type Activity } from '@/types/database';

export type ActivityHref =
  | `/expense-detail/${string}`
  | `/group/${string}`
  | `/friend/${string}`;

const expenseDetailTypes = new Set<ActivityType>([
  ActivityType.EXPENSE_CREATED,
  ActivityType.EXPENSE_UPDATED,
]);

const settlementTypes = new Set<ActivityType>([
  ActivityType.SETTLEMENT_CREATED,
  ActivityType.SETTLEMENT_UPDATED,
  ActivityType.SETTLEMENT_DELETED,
]);

const groupTypes = new Set<ActivityType>([
  ActivityType.GROUP_CREATED,
  ActivityType.GROUP_UPDATED,
  ActivityType.MEMBER_ADDED,
  ActivityType.MEMBER_REMOVED,
]);

export function getDeletedExpenseTargetIds(activities: Activity[]): ReadonlySet<string> {
  return new Set(
    activities
      .filter((activity) => activity.type === ActivityType.EXPENSE_DELETED)
      .map((activity) => activity.targetId)
  );
}

export function getActivityHref(
  activity: Activity,
  currentUserId?: string,
  deletedExpenseTargetIds?: ReadonlySet<string>
): ActivityHref | null {
  if (expenseDetailTypes.has(activity.type)) {
    if (deletedExpenseTargetIds?.has(activity.targetId)) {
      return activity.groupId ? `/group/${activity.groupId}` : null;
    }

    return `/expense-detail/${activity.targetId}`;
  }

  if (activity.type === ActivityType.EXPENSE_DELETED) {
    return activity.groupId ? `/group/${activity.groupId}` : null;
  }

  if (groupTypes.has(activity.type)) {
    return `/group/${activity.groupId ?? activity.targetId}`;
  }

  if (settlementTypes.has(activity.type)) {
    if (activity.groupId) {
      return `/group/${activity.groupId}`;
    }

    if (currentUserId && activity.userId !== currentUserId) {
      return `/friend/${activity.userId}`;
    }
  }

  return null;
}
