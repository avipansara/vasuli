import { describe, expect, it, vi } from 'vitest';
import type { Expense, ExpenseSplit, Group, GroupMember, User } from '@/types/database';
import type { PushNotificationData } from './notification-service';
import type { GroupDetailReadModel, GroupExpenseView } from './group-detail-read-model';
import { buildGroupDetailReadModel } from './group-detail-read-model';
import { createQueryCacheAdapter } from './query-cache-adapter';
import { createGroupDetailMutationModule } from './group-detail-mutation';

vi.mock('@/services/notification-service', () => ({
  createExpenseDeletedNotification: vi.fn(),
  notificationService: { sendNotificationToUsers: vi.fn() },
}));

const currentUser: User = { id: 'user-a', name: 'Alex', isActive: true, createdAt: 1 };
const friend: User = { id: 'user-b', name: 'Blair', isActive: true, createdAt: 1, pushToken: 'push-token' };
const group: Group = { id: 'group-1', name: 'Trip', createdAt: 1, updatedAt: 1 };
const members: GroupMember[] = [
  { id: 'member-a', groupId: group.id, userId: currentUser.id, role: 'admin', joinedAt: 1 },
  { id: 'member-b', groupId: group.id, userId: friend.id, role: 'member', joinedAt: 1 },
];

const expense: Expense = {
  id: 'expense-1',
  groupId: group.id,
  description: 'Dinner',
  amount: 30,
  currency: 'USD',
  paidBy: currentUser.id,
  date: 1,
  createdAt: 1,
  updatedAt: 1,
};

const splits: ExpenseSplit[] = [
  { id: 'split-a', expenseId: expense.id, userId: currentUser.id, amount: 15, splitType: 'equal' },
  { id: 'split-b', expenseId: expense.id, userId: friend.id, amount: 15, splitType: 'equal' },
];

function createReadModel(): GroupDetailReadModel {
  return buildGroupDetailReadModel({
    currentUserId: currentUser.id,
    group,
    expenses: [expense],
    members,
    users: [currentUser, friend],
    userFriends: [friend],
    friendships: [],
    splits,
    settlements: [],
  });
}

type HomeFriend = User & { balance: number; recentExpenses?: Expense[] };

function createCache(initial: { group: GroupDetailReadModel; home: HomeFriend[] }) {
  const values = new Map<string, unknown>([
    ['group', initial.group],
    ['home', initial.home],
  ]);
  const key = (value: readonly unknown[]) => JSON.stringify(value);
  const cache = createQueryCacheAdapter({
    get: <T>(queryKey: readonly unknown[]) => values.get(key(queryKey)) as T | undefined,
    set: <T>(queryKey: readonly unknown[], updater: T | ((current: T | undefined) => T)) => {
      const current = values.get(key(queryKey)) as T | undefined;
      values.set(key(queryKey), typeof updater === 'function'
        ? (updater as (value: T | undefined) => T)(current)
        : updater);
    },
    cancel: vi.fn(async () => undefined),
    invalidate: vi.fn(async () => undefined),
  });

  values.set(key(['group-detail']), initial.group);
  values.set(key(['friends-home']), initial.home);

  return {
    cache,
    groupKey: ['group-detail'] as const,
    homeKey: ['friends-home'] as const,
    getGroup: () => values.get(key(['group-detail'])) as GroupDetailReadModel | undefined,
    getHome: () => values.get(key(['friends-home'])) as HomeFriend[] | undefined,
  };
}

function createModule(overrides: Partial<Parameters<typeof createGroupDetailMutationModule>[0]> = {}) {
  return createGroupDetailMutationModule({
    deleteExpense: vi.fn(async () => undefined),
    getUsersByIds: vi.fn(async () => [friend]),
    sendExpenseDeletedNotification: vi.fn(async () => undefined),
    createExpenseDeletedNotification: vi.fn((): PushNotificationData => ({
      type: 'expense_deleted',
      title: 'Expense deleted',
      body: 'Expense deleted',
    })),
    ...overrides,
  });
}

const expenseView = expense as GroupExpenseView;

describe('Group detail mutation module', () => {
  it('deletes an Expense and reconciles Group detail and Friends Home', async () => {
    const state = createCache({
      group: createReadModel(),
      home: [{ ...friend, balance: 15, recentExpenses: [expense] }],
    });
    const deleteExpense = vi.fn(async () => undefined);
    const module = createModule({ deleteExpense });

    await module.deleteExpense({
      expenseId: expense.id,
      expense: expenseView,
      splits,
      currentUser,
      groupName: group.name,
      groupDetailKey: state.groupKey,
      friendsHomeKey: state.homeKey,
      cache: state.cache,
    });

    expect(deleteExpense).toHaveBeenCalledWith(expense.id, currentUser.id, currentUser.name);
    expect(state.getHome()).toEqual([{ ...friend, balance: 0, recentExpenses: [] }]);
    expect(state.getGroup()?.expenses).toEqual([]);
    expect(state.getGroup()?.balances.get(friend.id)).toBe(0);
  });

  it('restores optimistic state when Expense deletion fails', async () => {
    const state = createCache({
      group: createReadModel(),
      home: [{ ...friend, balance: 15, recentExpenses: [expense] }],
    });
    const error = new Error('delete failed');
    const module = createModule({ deleteExpense: vi.fn(async () => { throw error; }) });

    await expect(module.deleteExpense({
      expenseId: expense.id,
      expense: expenseView,
      splits,
      currentUser,
      groupName: group.name,
      groupDetailKey: state.groupKey,
      friendsHomeKey: state.homeKey,
      cache: state.cache,
    })).rejects.toBe(error);

    expect(state.getGroup()?.expenses).toHaveLength(1);
    expect(state.getGroup()?.balances.get(friend.id)).toBe(-15);
    expect(state.getHome()).toEqual([{ ...friend, balance: 15, recentExpenses: [expense] }]);
  });

  it('keeps a successful deletion when notification delivery fails', async () => {
    const state = createCache({
      group: createReadModel(),
      home: [{ ...friend, balance: 15, recentExpenses: [expense] }],
    });
    const sendNotification = vi.fn(async () => { throw new Error('push failed'); });
    const getUsersByIds = vi.fn(async () => [friend]);
    const module = createModule({ sendExpenseDeletedNotification: sendNotification, getUsersByIds });

    await expect(module.deleteExpense({
      expenseId: expense.id,
      expense: expenseView,
      splits,
      currentUser,
      groupName: group.name,
      groupDetailKey: state.groupKey,
      friendsHomeKey: state.homeKey,
      cache: state.cache,
    })).resolves.toBeUndefined();

    expect(state.getHome()).toEqual([{ ...friend, balance: 0, recentExpenses: [] }]);
    expect(getUsersByIds).toHaveBeenCalledWith([friend.id]);
    expect(sendNotification).toHaveBeenCalledOnce();
    expect(state.getGroup()?.expenses).toEqual([]);
  });
});
