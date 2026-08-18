import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, SettlementScopeTransfer, User } from '@/types/database';
import { calculateGroupBalances } from './group-balance';
import type { Friendship } from './friendship-service';

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface GroupExpenseSplitView extends ExpenseSplit {
  user?: User;
}

export interface GroupExpenseView extends Expense {
  paidByUser?: User;
  splits: GroupExpenseSplitView[];
}

export interface GroupMemberView extends GroupMember {
  user?: User;
}

export interface GroupDetailReadModel {
  group: Group;
  expenses: GroupExpenseView[];
  members: GroupMemberView[];
  balances: Map<string, number>;
  availableUsers: User[];
  friendshipStatus: Map<string, FriendshipStatus>;
  settlements: Settlement[];
  scopeTransfers: SettlementScopeTransfer[];
}

export type GroupDetailReadModelInput = {
  currentUserId: string;
  group: Group;
  expenses: Expense[];
  members: GroupMember[];
  users: User[];
  userFriends: User[];
  friendships: Friendship[];
  splits: ExpenseSplit[];
  settlements: Settlement[];
  scopeTransfers?: SettlementScopeTransfer[];
};

export function buildFriendshipStatus(
  currentUserId: string,
  friendships: Friendship[],
): Map<string, FriendshipStatus> {
  const statusMap = new Map<string, FriendshipStatus>();

  for (const friendship of friendships) {
    const otherId = friendship.userId === currentUserId ? friendship.friendId : friendship.userId;

    if (friendship.status === 'accepted') {
      statusMap.set(otherId, 'accepted');
    } else if (friendship.status === 'pending') {
      statusMap.set(otherId, friendship.userId === currentUserId ? 'pending_sent' : 'pending_received');
    }
  }

  return statusMap;
}

function createExpenseView(
  expense: Expense,
  splits: ExpenseSplit[],
  usersById: Map<string, User>,
): GroupExpenseView {
  return {
    ...expense,
    paidByUser: usersById.get(expense.paidBy),
    splits: splits.map(split => ({
      ...split,
      user: usersById.get(split.userId),
    })),
  };
}

function calculateGroupDetailBalances(
  expenses: GroupExpenseView[],
  members: GroupMemberView[],
  settlements: Settlement[],
  scopeTransfers: SettlementScopeTransfer[],
): Map<string, number> {
  const balances = calculateGroupBalances(
    expenses,
    expenses.flatMap(expense => expense.splits),
    settlements,
    scopeTransfers,
  );
  for (const member of members) {
    if (!balances.has(member.userId)) balances.set(member.userId, 0);
  }
  return balances;
}

export function buildGroupDetailReadModel(input: GroupDetailReadModelInput): GroupDetailReadModel {
  const usersById = new Map(input.users.map(user => [user.id, user]));
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of input.splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  const memberIds = new Set(input.members.map(member => member.userId));

  const model: GroupDetailReadModel = {
    group: input.group,
    expenses: input.expenses.map(expense => createExpenseView(expense, splitsByExpenseId.get(expense.id) ?? [], usersById)),
    members: input.members.map(member => ({ ...member, user: usersById.get(member.userId) })),
    balances: new Map(),
    availableUsers: input.userFriends.filter(user => !memberIds.has(user.id)),
    friendshipStatus: buildFriendshipStatus(input.currentUserId, input.friendships),
    settlements: input.settlements,
    scopeTransfers: input.scopeTransfers ?? [],
  };

  return {
    ...model,
    balances: calculateGroupDetailBalances(model.expenses, model.members, model.settlements, model.scopeTransfers),
  };
}

export function addExpenseToGroupReadModel(
  model: GroupDetailReadModel,
  expense: Expense,
  splits: ExpenseSplit[],
): GroupDetailReadModel {
  const scopeTransfers = model.scopeTransfers ?? [];
  const usersById = new Map(model.members.flatMap(member => member.user ? [[member.user.id, member.user] as const] : []));
  const nextExpenses = [
    createExpenseView(expense, splits, usersById),
    ...model.expenses.filter(existing => existing.id !== expense.id),
  ];
  return {
    ...model,
    expenses: nextExpenses,
    balances: calculateGroupDetailBalances(nextExpenses, model.members, model.settlements, scopeTransfers),
    scopeTransfers,
  };
}

export function applySettlementToGroupReadModel(
  model: GroupDetailReadModel,
  settlement: Settlement,
): GroupDetailReadModel {
  const scopeTransfers = model.scopeTransfers ?? [];
  if (model.settlements.some(existing => existing.id === settlement.id)) return model;

  const settlements = [...model.settlements, settlement];
  return {
    ...model,
    settlements,
    balances: calculateGroupDetailBalances(model.expenses, model.members, settlements, scopeTransfers),
    scopeTransfers,
  };
}

export function applyScopeTransferToGroupReadModel(
  model: GroupDetailReadModel,
  transfer: SettlementScopeTransfer,
): GroupDetailReadModel {
  const existingTransfers = model.scopeTransfers ?? [];
  if (existingTransfers.some(existing => existing.id === transfer.id)) return model;

  const scopeTransfers = [...existingTransfers, transfer];
  return {
    ...model,
    scopeTransfers,
    balances: calculateGroupDetailBalances(model.expenses, model.members, model.settlements, scopeTransfers),
  };
}

export function removeExpenseFromGroupReadModel(
  model: GroupDetailReadModel,
  expenseId: string,
): GroupDetailReadModel {
  const scopeTransfers = model.scopeTransfers ?? [];
  const expenses = model.expenses.filter(expense => expense.id !== expenseId);
  return {
    ...model,
    expenses,
    balances: calculateGroupDetailBalances(expenses, model.members, model.settlements, scopeTransfers),
    scopeTransfers,
  };
}

export type GroupHomeFriendView = Pick<User, 'id'> & {
  balance: number;
  recentExpenses?: Expense[];
};

export function removeExpenseFromHomeFriends<T extends GroupHomeFriendView>(
  current: T[] | undefined,
  expense: Expense,
  splits: ExpenseSplit[],
  currentUserId: string,
): T[] | undefined {
  if (!current) return current;

  const currentUserSplit = splits.find(split => split.userId === currentUserId);
  if (!currentUserSplit) return current;

  return current.map(friend => {
    const friendSplit = splits.find(split => split.userId === friend.id);
    if (!friendSplit) return friend;

    const balanceDelta = expense.paidBy === currentUserId
      ? -friendSplit.amount
      : expense.paidBy === friend.id ? currentUserSplit.amount : 0;
    if (balanceDelta === 0) return friend;

    const nextBalance = friend.balance + balanceDelta;
    return {
      ...friend,
      balance: Math.abs(nextBalance) < 0.01 ? 0 : nextBalance,
      recentExpenses: friend.recentExpenses?.filter(item => item.id !== expense.id),
    };
  });
}
