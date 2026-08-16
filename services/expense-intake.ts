import type { FriendDetailData } from './friend-detail-service';
import type { GroupDetailData } from './group-detail-service';
import { calculateGroupBalances } from './group-balance';
import type { Expense, User } from '@/types/database';

export type ExpenseSplitInput = {
  userId: string;
  amount: number;
  splitType: 'equal' | 'exact' | 'percentage';
};

export type ExpenseIntakeCacheKey = string | readonly unknown[];

export type ExpenseIntakeCache = {
  get<T>(key: ExpenseIntakeCacheKey): T | undefined;
  set<T>(key: ExpenseIntakeCacheKey, updater: T | ((current: T | undefined) => T)): void;
  cancel(key: ExpenseIntakeCacheKey): Promise<void>;
  invalidate(key: ExpenseIntakeCacheKey): Promise<void>;
};

type ExpenseTarget =
  | { kind: 'group'; groupId: string; memberIds: string[] }
  | { kind: 'friends'; friendIds: string[] };

export type SubmitExpenseInput = {
  target: ExpenseTarget;
  description: string;
  amount: number;
  currency: string;
  date: number;
  payerId: string;
  currentUserId: string;
  currentUser: User;
  splits: ExpenseSplitInput[];
  group?: { id: string; name: string };
  cache: ExpenseIntakeCache;
  keys: {
    home: ExpenseIntakeCacheKey;
    groupDetail?: ExpenseIntakeCacheKey;
    friendDetails?: ExpenseIntakeCacheKey[];
    groups: ExpenseIntakeCacheKey;
    expenses: ExpenseIntakeCacheKey;
    activity: ExpenseIntakeCacheKey;
  };
  save(input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, splits: ExpenseSplitInput[]): Promise<Expense>;
  navigateBack(): void;
  logActivity(input: { expense: Expense; userName: string; groupName?: string }): Promise<void>;
  sendNotifications(input: { expense: Expense; groupName?: string }): Promise<void>;
  warn(error: unknown): void;
  now?: () => number;
};

type HomeFriend = { id: string; balance: number; recentExpenses?: Expense[] };

function buildCachedSplits(expenseId: string, splits: ExpenseSplitInput[]) {
  return splits.map((split, index) => ({
    id: `optimistic-split:${expenseId}:${index}`,
    expenseId,
    userId: split.userId,
    amount: split.amount,
    splitType: split.splitType,
  }));
}

function updateHomeFriends(
  current: HomeFriend[] | undefined,
  expense: Expense,
  splits: ExpenseSplitInput[],
  currentUserId: string,
): HomeFriend[] | undefined {
  if (!current) return current;

  return current.map(friend => {
    const currentUserSplit = splits.find(split => split.userId === currentUserId);
    const friendSplit = splits.find(split => split.userId === friend.id);
    if (!currentUserSplit || !friendSplit) return friend;

    const balanceDelta = expense.paidBy === currentUserId
      ? friendSplit.amount
      : expense.paidBy === friend.id ? -currentUserSplit.amount : 0;
    if (balanceDelta === 0) return friend;

    return {
      ...friend,
      balance: Math.abs(friend.balance + balanceDelta) < 0.01 ? 0 : friend.balance + balanceDelta,
      recentExpenses: [
        { ...expense, amount: Math.abs(balanceDelta) },
        ...(friend.recentExpenses ?? []),
      ].filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index).slice(0, 2),
    };
  });
}

function updateGroupDetail(
  current: GroupDetailData | null | undefined,
  expense: Expense,
  splits: ExpenseSplitInput[],
  currentUser: User,
): GroupDetailData | null {
  if (!current) return null;

  const nextExpenses = [
    { ...expense, paidByUser: currentUser },
    ...current.expenses.filter(item => item.id !== expense.id),
  ];
  const nextSplits = [
    ...buildCachedSplits(expense.id, splits),
    ...current.splits.filter(split => split.expenseId !== expense.id),
  ];

  return {
    ...current,
    expenses: nextExpenses,
    splits: nextSplits,
    balances: calculateGroupBalances(nextExpenses, nextSplits, current.settlements),
  };
}

function updateFriendDetail(
  current: FriendDetailData | null | undefined,
  expense: Expense,
  splits: ExpenseSplitInput[],
  currentUserId: string,
): FriendDetailData | null {
  if (!current) return null;

  const currentUserSplit = splits.find(split => split.userId === currentUserId);
  const friendSplit = splits.find(split => split.userId === current.friend.id);
  if (!currentUserSplit || !friendSplit) return current;

  const balanceDelta = expense.paidBy === currentUserId
    ? friendSplit.amount
    : expense.paidBy === current.friend.id ? -currentUserSplit.amount : 0;
  const expenseWithSplit = {
    ...expense,
    yourShare: currentUserSplit.amount,
    friendShare: friendSplit.amount,
    paidByName: expense.paidBy === currentUserId ? 'You' : current.friend.name,
  };

  return {
    ...current,
    friend: {
      ...current.friend,
      balance: Math.abs(current.friend.balance + balanceDelta) < 0.01 ? 0 : current.friend.balance + balanceDelta,
    },
    expenses: [expenseWithSplit, ...current.expenses.filter(item => item.id !== expense.id)],
  };
}

export async function submitExpense(input: SubmitExpenseInput): Promise<void> {
  const now = input.now ?? Date.now;
  const createdAt = now();
  const optimisticExpense: Expense = {
    id: `optimistic:${createdAt}`,
    groupId: input.target.kind === 'group' ? input.target.groupId : undefined,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    paidBy: input.payerId,
    createdBy: input.currentUserId,
    date: input.date,
    createdAt,
    updatedAt: createdAt,
  };

  const keys = [input.keys.home, ...(input.keys.groupDetail ? [input.keys.groupDetail] : []), ...(input.keys.friendDetails ?? [])];
  await Promise.all(keys.map(key => input.cache.cancel(key)));
  const previous = new Map<ExpenseIntakeCacheKey, unknown>(keys.map(key => [key, input.cache.get(key)]));

  input.cache.set<HomeFriend[]>(input.keys.home, current => updateHomeFriends(current, optimisticExpense, input.splits, input.currentUserId) ?? []);
  if (input.target.kind === 'group' && input.keys.groupDetail) {
    input.cache.set<GroupDetailData | null>(input.keys.groupDetail, current => updateGroupDetail(current, optimisticExpense, input.splits, input.currentUser) ?? null);
  }
  if (input.target.kind === 'friends') {
    input.keys.friendDetails?.forEach((key, index) => {
      input.cache.set<FriendDetailData | null>(key, current => updateFriendDetail(current, optimisticExpense, input.splits, input.currentUserId) ?? null);
    });
  }
  input.navigateBack();

  try {
    const expense = await input.save({
      groupId: optimisticExpense.groupId,
      description: optimisticExpense.description,
      amount: optimisticExpense.amount,
      currency: optimisticExpense.currency,
      paidBy: optimisticExpense.paidBy,
      createdBy: optimisticExpense.createdBy,
      date: optimisticExpense.date,
    }, input.splits);

    if (input.target.kind === 'group' && input.keys.groupDetail) {
      input.cache.set<GroupDetailData | null>(input.keys.groupDetail, current => current ? {
        ...current,
        expenses: current.expenses.map(item => item.id === optimisticExpense.id ? { ...item, ...expense } : item),
        splits: [
          ...buildCachedSplits(expense.id, input.splits),
          ...current.splits.filter(split => split.expenseId !== optimisticExpense.id && split.expenseId !== expense.id),
        ],
      } : null);
    }
    input.cache.set<HomeFriend[]>(input.keys.home, current => current?.map(friend => ({
      ...friend,
      recentExpenses: friend.recentExpenses?.map(item => item.id === optimisticExpense.id
        ? { ...item, ...expense, amount: item.amount }
        : item),
    })) ?? []);
    if (input.target.kind === 'friends') {
      input.keys.friendDetails?.forEach(key => {
        input.cache.set<FriendDetailData | null>(key, current => current ? {
          ...current,
          expenses: current.expenses.map(item => item.id === optimisticExpense.id ? { ...item, ...expense } : item),
        } : null);
      });
    }

    await Promise.allSettled([
      input.logActivity({ expense, userName: input.currentUser.name || 'Someone', groupName: input.group?.name }),
      input.sendNotifications({ expense, groupName: input.group?.name }),
    ]).then(results => {
      results.filter(result => result.status === 'rejected').forEach(result => input.warn(result.reason));
    });

    await Promise.allSettled([
      input.cache.invalidate(input.keys.home),
      ...(input.keys.groupDetail ? [input.cache.invalidate(input.keys.groupDetail)] : []),
      ...input.keys.friendDetails?.map(key => input.cache.invalidate(key) as Promise<unknown>) ?? [],
      input.cache.invalidate(input.keys.groups),
      input.cache.invalidate(input.keys.expenses),
      input.cache.invalidate(input.keys.activity),
    ]);
  } catch (error) {
    previous.forEach((value, key) => input.cache.set(key, value));
    await Promise.allSettled(keys.map(key => input.cache.invalidate(key)));
    throw error;
  }
}
