import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, User } from '@/types/database';
import type { Friendship } from './friendship-service';
import { expenseService } from './expense-service';
import { friendshipService } from './friendship-service';
import { groupService } from './group-service';
import { settlementService } from './settlement-service';
import { userService } from './user-service';

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface GroupExpenseWithUser extends Expense {
  paidByUser?: User;
}

export interface GroupMemberWithUser extends GroupMember {
  user?: User;
}

export interface GroupDetailData {
  group: Group;
  expenses: GroupExpenseWithUser[];
  members: GroupMemberWithUser[];
  balances: Map<string, number>;
  availableUsers: User[];
  friendshipStatus: Map<string, FriendshipStatus>;
  splits: ExpenseSplit[];
  settlements: Settlement[];
}

export function calculateGroupBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[]
): Map<string, number> {
  const balances = new Map<string, number>();
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  for (const expense of expenses) {
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amount);

    for (const split of splitsByExpenseId.get(expense.id) ?? []) {
      balances.set(split.userId, (balances.get(split.userId) ?? 0) - split.amount);
    }
  }

  for (const settlement of settlements) {
    balances.set(settlement.fromUserId, (balances.get(settlement.fromUserId) ?? 0) + settlement.amount);
    balances.set(settlement.toUserId, (balances.get(settlement.toUserId) ?? 0) - settlement.amount);
  }

  for (const [userId, balance] of balances) {
    if (Math.abs(balance) < 0.01) {
      balances.set(userId, 0);
    }
  }

  return balances;
}

export function buildFriendshipStatus(
  currentUserId: string,
  friendships: Friendship[]
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

export function buildGroupDetailData(params: {
  currentUserId: string;
  group: Group;
  expenses: Expense[];
  members: GroupMember[];
  users: User[];
  userFriends: User[];
  friendships: Friendship[];
  splits: ExpenseSplit[];
  settlements: Settlement[];
}): GroupDetailData {
  const usersById = new Map(params.users.map(user => [user.id, user]));
  const memberIds = new Set(params.members.map(member => member.userId));

  return {
    group: params.group,
    expenses: params.expenses.map(expense => ({
      ...expense,
      paidByUser: usersById.get(expense.paidBy),
    })),
    members: params.members.map(member => ({
      ...member,
      user: usersById.get(member.userId),
    })),
    balances: calculateGroupBalances(params.expenses, params.splits, params.settlements),
    availableUsers: params.userFriends.filter(user => !memberIds.has(user.id)),
    friendshipStatus: buildFriendshipStatus(params.currentUserId, params.friendships),
    splits: params.splits,
    settlements: params.settlements,
  };
}

export const groupDetailService = {
  async getDetail(currentUserId: string, groupId: string): Promise<GroupDetailData | null> {
    const group = await groupService.getById(groupId);
    if (!group) return null;

    const [expenses, members, settlements, userFriends, friendships] = await Promise.all([
      expenseService.getByGroup(groupId),
      groupService.getMembers(groupId),
      settlementService.getByGroup(groupId),
      userService.getUserFriends(currentUserId),
      friendshipService.getAllFriendships(currentUserId),
    ]);

    const userIds = [
      ...members.map(member => member.userId),
      ...expenses.map(expense => expense.paidBy),
    ];
    const [users, splits] = await Promise.all([
      userService.getByIds(userIds),
      expenseService.getSplitsForExpenses(expenses.map(expense => expense.id)),
    ]);

    return buildGroupDetailData({
      currentUserId,
      group,
      expenses,
      members,
      users,
      userFriends,
      friendships,
      splits,
      settlements,
    });
  },
};
