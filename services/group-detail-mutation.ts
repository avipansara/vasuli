import type { Expense, ExpenseSplit, User } from '@/types/database';
import { expenseService } from './expense-service';
import {
  createExpenseDeletedNotification,
  notificationService,
  type PushNotificationData,
} from './notification-service';
import {
  removeExpenseFromGroupReadModel,
  removeExpenseFromHomeFriends,
  type GroupDetailReadModel,
} from './group-detail-read-model';
import type { QueryCacheAdapter, QueryCacheKey, QueryCacheSnapshot } from './query-cache-adapter';
import { userService } from './user-service';

type HomeFriend = User & {
  balance: number;
  recentExpenses?: Expense[];
};

export type GroupDetailExpenseMutationDependencies = {
  deleteExpense: (expenseId: string, userId: string, userName: string) => Promise<void>;
  getUsersByIds: (userIds: string[]) => Promise<User[]>;
  sendExpenseDeletedNotification: (
    tokens: string[],
    notification: PushNotificationData,
  ) => Promise<void>;
  createExpenseDeletedNotification: (
    expenseId: string,
    expenseName: string,
    amount: number,
    deletedBy: string,
    groupName?: string,
    groupId?: string,
  ) => PushNotificationData;
};

const defaultDependencies: GroupDetailExpenseMutationDependencies = {
  deleteExpense: expenseService.delete,
  getUsersByIds: userService.getByIds,
  sendExpenseDeletedNotification: notificationService.sendNotificationToUsers,
  createExpenseDeletedNotification,
};

export type DeleteGroupDetailExpenseParams = {
  expenseId: string;
  expense?: Expense;
  splits: ExpenseSplit[];
  currentUser: Pick<User, 'id' | 'name'>;
  groupName?: string;
  groupDetailKey: QueryCacheKey;
  friendsHomeKey: QueryCacheKey;
  cache: QueryCacheAdapter;
};

export function createGroupDetailMutationModule(
  dependencies: GroupDetailExpenseMutationDependencies = defaultDependencies,
) {
  return {
    async deleteExpense(params: DeleteGroupDetailExpenseParams): Promise<void> {
      const currentUserSplit = params.expense
        ? params.splits.find(split => split.userId === params.currentUser.id)
        : undefined;
      const cacheKeys = [
        params.groupDetailKey,
        ...(currentUserSplit ? [params.friendsHomeKey] : []),
      ];
      let cacheSnapshot: QueryCacheSnapshot | undefined;

      try {
        cacheSnapshot = await params.cache.capture(cacheKeys);

        if (params.expense) {
          params.cache.set<GroupDetailReadModel | null>(
            params.groupDetailKey,
            current => current ? removeExpenseFromGroupReadModel(current, params.expenseId) : null,
          );
        }

        if (currentUserSplit) {
          params.cache.set<HomeFriend[] | undefined>(
            params.friendsHomeKey,
            current => removeExpenseFromHomeFriends(
              current,
              params.expense!,
              params.splits,
              params.currentUser.id,
            ),
          );
        }

        await dependencies.deleteExpense(
          params.expenseId,
          params.currentUser.id,
          params.currentUser.name,
        );
      } catch (error) {
        if (cacheSnapshot) {
          await params.cache.restore(cacheSnapshot);
        }
        await safelyInvalidate(params.cache, params.friendsHomeKey);
        throw error;
      }

      await safelyInvalidate(params.cache, params.groupDetailKey);
      await safelyInvalidate(params.cache, params.friendsHomeKey);
      await notifyExpenseParticipants(params, dependencies);
    },
  };
}

async function notifyExpenseParticipants(
  params: DeleteGroupDetailExpenseParams,
  dependencies: GroupDetailExpenseMutationDependencies,
): Promise<void> {
  if (!params.expense) return;

  try {
    const participantIds = params.splits
      .map(split => split.userId)
      .filter(userId => userId !== params.currentUser.id);
    const users = await dependencies.getUsersByIds(participantIds);
    const pushTokens = users
      .map(user => user.pushToken)
      .filter((token): token is string => Boolean(token));

    if (pushTokens.length === 0) return;

    await dependencies.sendExpenseDeletedNotification(
      pushTokens,
      dependencies.createExpenseDeletedNotification(
        params.expense.id,
        params.expense.description,
        params.expense.amount,
        params.currentUser.name,
        params.groupName,
        params.expense.groupId,
      ),
    );
  } catch (error) {
    console.error('Expense deletion notification failed after mutation:', error);
  }
}

async function safelyInvalidate(cache: QueryCacheAdapter, key: QueryCacheKey): Promise<void> {
  try {
    await cache.invalidate(key);
  } catch (error) {
    console.warn('Group detail cache invalidation failed after Expense deletion:', error);
  }
}

export const groupDetailMutationModule = createGroupDetailMutationModule();
