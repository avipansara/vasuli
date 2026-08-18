import { expenseService } from './expense-service';
import { friendshipService } from './friendship-service';
import { groupService } from './group-service';
import { settlementService } from './settlement-service';
import { userService } from './user-service';
import { scopeTransferService } from './scope-transfer-service';
import {
  buildGroupDetailReadModel,
  type GroupDetailReadModel,
} from './group-detail-read-model';

export type { GroupDetailReadModel } from './group-detail-read-model';

export type GroupDetailDataSource = {
  getGroup(groupId: string): ReturnType<typeof groupService.getById>;
  getExpenses(groupId: string): ReturnType<typeof expenseService.getByGroup>;
  getMembers(groupId: string): ReturnType<typeof groupService.getMembers>;
  getSettlements(groupId: string): ReturnType<typeof settlementService.getByGroup>;
  getScopeTransfers?(groupId: string): ReturnType<typeof scopeTransferService.getByGroup>;
  getUserFriends(userId: string): ReturnType<typeof userService.getUserFriends>;
  getFriendships(userId: string): ReturnType<typeof friendshipService.getAllFriendships>;
  getUsers(userIds: string[]): ReturnType<typeof userService.getByIds>;
  getSplits(expenseIds: string[]): ReturnType<typeof expenseService.getSplitsForExpenses>;
};

const defaultDataSource: GroupDetailDataSource = {
  getGroup: groupService.getById,
  getExpenses: expenseService.getByGroup,
  getMembers: groupService.getMembers,
  getSettlements: settlementService.getByGroup,
  getScopeTransfers: scopeTransferService.getByGroup,
  getUserFriends: userService.getUserFriends,
  getFriendships: friendshipService.getAllFriendships,
  getUsers: userService.getByIds,
  getSplits: expenseService.getSplitsForExpenses,
};

export function createGroupDetailService(dataSource: GroupDetailDataSource = defaultDataSource) {
  return {
    async getDetail(currentUserId: string, groupId: string): Promise<GroupDetailReadModel | null> {
      const group = await dataSource.getGroup(groupId);
      if (!group) return null;

      const [expenses, members, settlements, scopeTransfers, userFriends, friendships] = await Promise.all([
        dataSource.getExpenses(groupId),
        dataSource.getMembers(groupId),
        dataSource.getSettlements(groupId),
        dataSource.getScopeTransfers?.(groupId) ?? Promise.resolve([]),
        dataSource.getUserFriends(currentUserId),
        dataSource.getFriendships(currentUserId),
      ]);

    const userIds = [
      ...members.map(member => member.userId),
      ...expenses.map(expense => expense.paidBy),
    ];
    const [users, splits] = await Promise.all([
      dataSource.getUsers(userIds),
      dataSource.getSplits(expenses.map(expense => expense.id)),
    ]);

    return buildGroupDetailReadModel({
      currentUserId,
      group,
      expenses,
      members,
      users,
      userFriends,
      friendships,
      splits,
      settlements,
      scopeTransfers,
    });
    },
  };
}

export const groupDetailService = createGroupDetailService();
