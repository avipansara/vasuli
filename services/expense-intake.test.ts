import { describe, expect, it, vi } from 'vitest';
import type { Expense } from '@/types/database';
import { submitExpense } from './expense-intake';
import { createQueryCacheAdapter } from './query-cache-adapter';

function createCache() {
  const values = new Map<string, unknown>();
  const events: string[] = [];

  const baseCache = {
    events,
    get<T>(key: string): T | undefined {
      return values.get(key) as T | undefined;
    },
    set<T>(key: string, updater: T | ((current: T | undefined) => T)): void {
      const current = values.get(key) as T | undefined;
      values.set(key, typeof updater === 'function' ? (updater as (value: T | undefined) => T)(current) : updater);
      events.push(`set:${key}`);
    },
    async cancel(key: string): Promise<void> {
      events.push(`cancel:${key}`);
    },
    async invalidate(key: string): Promise<void> {
      events.push(`invalidate:${key}`);
    },
    seed<T>(key: string, value: T): void {
      values.set(key, value);
    },
  };

  return Object.assign(createQueryCacheAdapter(baseCache), { events, seed: baseCache.seed });
}

const group = { id: 'group-1', name: 'Trip', createdAt: 0, updatedAt: 0 };
const user = { id: 'user-1', name: 'Alex', isActive: true, createdAt: 0 };

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    groupId: group.id,
    description: 'Dinner',
    amount: 30,
    currency: 'USD',
    paidBy: user.id,
    createdBy: user.id,
    date: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('submitExpense', () => {
  it('navigates after applying an optimistic group expense and replaces it after persistence', async () => {
    const cache = createCache();
    const navigateBack = vi.fn(() => cache.events.push('navigate'));
    const save = vi.fn(async () => expense());
    cache.seed('home', [{ id: 'user-2', balance: 15, recentExpenses: [expense({ id: 'optimistic:100' })] }]);

    await submitExpense({
      target: { kind: 'group', groupId: group.id, memberIds: ['user-1', 'user-2'] },
      description: 'Dinner',
      amount: 30,
      currency: 'USD',
      date: 1,
      payerId: user.id,
      currentUser: user,
      currentUserId: user.id,
      splits: [
        { userId: 'user-1', amount: 15, splitType: 'equal' },
        { userId: 'user-2', amount: 15, splitType: 'equal' },
      ],
      group,
      cache,
      keys: { home: 'home', groupDetail: 'group-detail', groups: 'groups', expenses: 'expenses', activity: 'activity' },
      save,
      navigateBack,
      logActivity: vi.fn(async () => undefined),
      sendNotifications: vi.fn(async () => undefined),
      warn: vi.fn(),
      now: () => 100,
    });

    expect(navigateBack).toHaveBeenCalledOnce();
    expect(cache.events.indexOf('navigate')).toBeGreaterThan(cache.events.indexOf('set:group-detail'));
    expect(save).toHaveBeenCalledOnce();
    expect(cache.get<{ recentExpenses?: Expense[] }[]>('home')?.[0].recentExpenses?.[0].id).toBe('expense-1');
  });

  it('rolls back optimistic state when persistence fails without navigating again', async () => {
    const cache = createCache();
    const original = {
      group,
      expenses: [],
      members: [{ id: 'member-a', groupId: group.id, userId: user.id, role: 'admin', joinedAt: 0, user }],
      settlements: [],
      balances: new Map(),
      availableUsers: [],
      friendshipStatus: new Map(),
    };
    cache.seed('group-detail', original);
    const navigateBack = vi.fn();
    const persistenceError = new Error('write failed');

    await expect(submitExpense({
      target: { kind: 'group', groupId: group.id, memberIds: ['user-1', 'user-2'] },
      description: 'Dinner',
      amount: 30,
      currency: 'USD',
      date: 1,
      payerId: user.id,
      currentUser: user,
      currentUserId: user.id,
      splits: [{ userId: 'user-1', amount: 15, splitType: 'equal' }, { userId: 'user-2', amount: 15, splitType: 'equal' }],
      group,
      cache,
      keys: { home: 'home', groupDetail: 'group-detail', groups: 'groups', expenses: 'expenses', activity: 'activity' },
      save: vi.fn(async () => { throw persistenceError; }),
      navigateBack,
      logActivity: vi.fn(async () => undefined),
      sendNotifications: vi.fn(async () => undefined),
      warn: vi.fn(),
    })).rejects.toBe(persistenceError);

    expect(cache.get('group-detail')).toBe(original);
    expect(navigateBack).toHaveBeenCalledOnce();
    expect(cache.events).toContain('invalidate:group-detail');
  });

  it('warns independently when follow-up effects fail after the expense is created', async () => {
    const cache = createCache();
    const warn = vi.fn();

    await expect(submitExpense({
      target: { kind: 'group', groupId: group.id, memberIds: ['user-1', 'user-2'] },
      description: 'Dinner',
      amount: 30,
      currency: 'USD',
      date: 1,
      payerId: user.id,
      currentUser: user,
      currentUserId: user.id,
      splits: [{ userId: 'user-1', amount: 15, splitType: 'equal' }, { userId: 'user-2', amount: 15, splitType: 'equal' }],
      group,
      cache,
      keys: { home: 'home', groupDetail: 'group-detail', groups: 'groups', expenses: 'expenses', activity: 'activity' },
      save: vi.fn(async () => expense()),
      navigateBack: vi.fn(),
      logActivity: vi.fn(async () => { throw new Error('activity unavailable'); }),
      sendNotifications: vi.fn(async () => { throw new Error('notifications unavailable'); }),
      warn,
    })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('projects a friend expense into the friend detail and settles its optimistic id', async () => {
    const cache = createCache();
    cache.seed('friend-detail', {
      friend: { id: 'user-2', name: 'Blair', isActive: true, createdAt: 0, balance: 0 },
      expenses: [],
      activity: [],
    });

    await submitExpense({
      target: { kind: 'friends', friendIds: ['user-2'] },
      description: 'Coffee',
      amount: 30,
      currency: 'USD',
      date: 1,
      payerId: user.id,
      currentUser: user,
      currentUserId: user.id,
      splits: [{ userId: 'user-1', amount: 15, splitType: 'equal' }, { userId: 'user-2', amount: 15, splitType: 'equal' }],
      cache,
      keys: { home: 'home', friendDetails: ['friend-detail'], groups: 'groups', expenses: 'expenses', activity: 'activity' },
      save: vi.fn(async () => expense({ id: 'friend-expense-1', groupId: undefined, description: 'Coffee' })),
      navigateBack: vi.fn(),
      logActivity: vi.fn(async () => undefined),
      sendNotifications: vi.fn(async () => undefined),
      warn: vi.fn(),
    });

    expect(cache.get<{ friend: { balance: number }; expenses: Expense[] }>('friend-detail')).toMatchObject({
      friend: { balance: 15 },
      expenses: [{ id: 'friend-expense-1', description: 'Coffee' }],
      relationship: {
        directBalance: 15,
        activity: [],
        totalsByCurrency: [{ currency: 'USD', amount: 15, direction: 'you_are_owed' }],
      },
    });
  });
});
