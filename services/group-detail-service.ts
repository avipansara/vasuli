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
import { logGroupDetailDiagnostic } from '@/lib/group-detail-diagnostics';

export type { GroupDetailReadModel } from './group-detail-read-model';

export type GroupDetailDataSource = {
  getGroup(groupId: string, traceId?: string): ReturnType<typeof groupService.getById>;
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
    async getDetail(currentUserId: string, groupId: string, traceId?: string): Promise<GroupDetailReadModel | null> {
      const startedAt = Date.now();
      logGroupDetailDiagnostic('fetch-start', { traceId, currentUserId, groupId });

      const getGroup = () => traceId === undefined
        ? dataSource.getGroup(groupId)
        : dataSource.getGroup(groupId, traceId);
      let group = await getGroup();
      if (!group) {
        logGroupDetailDiagnostic('confirm-missing', {
          traceId,
          currentUserId,
          groupId,
          attempt: 1,
          durationMs: Date.now() - startedAt,
        }, 'warn');
        group = await getGroup();
      }
      if (!group) {
        logGroupDetailDiagnostic('missing-confirmed', {
          traceId,
          currentUserId,
          groupId,
          attempts: 2,
          durationMs: Date.now() - startedAt,
        }, 'warn');
        return null;
      }

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

      const readModel = buildGroupDetailReadModel({
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

      if (__DEV__) {
        console.log('[GroupDetail] read model loaded', {
          traceId,
          currentUserId,
          groupId,
          durationMs: Date.now() - startedAt,
          expenseCount: expenses.length,
          expenseAmounts: expenses.map(expense => ({
            id: expense.id,
            amount: expense.amount,
            paidBy: expense.paidBy,
          })),
          splitCount: splits.length,
          splits: splits.map(split => ({ expenseId: split.expenseId, userId: split.userId, amount: split.amount })),
          settlementCount: settlements.length,
          settlements: settlements.map(settlement => ({
            id: settlement.id,
            amount: settlement.amount,
            fromUserId: settlement.fromUserId,
            toUserId: settlement.toUserId,
          })),
          scopeTransferCount: scopeTransfers.length,
          scopeTransfers: scopeTransfers.map(transfer => ({
            id: transfer.id,
            signedGroupBalanceDelta: transfer.signedGroupBalanceDelta,
            fromUserId: transfer.fromUserId,
            toUserId: transfer.toUserId,
            isReversal: transfer.isReversal,
          })),
          balances: [...readModel.balances.entries()],
        });
      }

      return readModel;
    },
  };
}

export const groupDetailService = createGroupDetailService();
