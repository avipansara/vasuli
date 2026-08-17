import type { FriendDetailData } from '@/services/friend-detail-service';
import { friendDetailReadModel } from '@/services/friend-detail-read-model';
import { activityService } from '@/services/activity-service';
import { settlementService } from '@/services/settlement-service';
import type { Settlement } from '@/types/database';

export type FriendDetailReadAdapter = {
  getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null>;
};

export type FriendDetailSettlementAdapter = {
  createPairSettlements(params: {
    currentUserId: string;
    friendId: string;
    amount: number;
    currency: string;
    date: number;
  }): Promise<Settlement[]>;
};

export type FriendDetailActivityAdapter = {
  logSettlementCreated(params: {
    settlementId: string;
    fromUserId: string;
    fromUserName: string;
    toUserName: string;
    amount: number;
    groupId?: string;
  }): Promise<unknown>;
};

export type FriendDetailModuleDependencies = {
  readAdapter?: FriendDetailReadAdapter;
  settlementAdapter?: FriendDetailSettlementAdapter;
  activityAdapter?: FriendDetailActivityAdapter;
};

export type FriendDetailModule = {
  getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null>;
  settleUp(params: {
    currentUserId: string;
    friendId: string;
    amount: number;
    balance: number;
    currency: string;
    date: number;
    currentUserName?: string;
    friendName?: string;
  }): Promise<Settlement[]>;
};

export function createFriendDetailModule(
  dependencies: FriendDetailModuleDependencies = {}
): FriendDetailModule {
  const readAdapter = dependencies.readAdapter ?? friendDetailReadModel;
  const settlementAdapter = dependencies.settlementAdapter ?? settlementService;
  const activityAdapter = dependencies.activityAdapter ?? activityService;

  return {
    getDetail: (currentUserId, friendId) => readAdapter.getDetail(currentUserId, friendId),
    async settleUp({
      currentUserId,
      friendId,
      amount,
      balance,
      currency,
      date,
      currentUserName = 'You',
      friendName = 'Friend',
    }) {
      if (amount <= 0 || amount > Math.abs(balance)) {
        throw new Error('Settlement amount cannot exceed the outstanding balance.');
      }

      const settlements = await settlementAdapter.createPairSettlements({
        currentUserId,
        friendId,
        amount: Math.abs(amount),
        currency,
        date,
      });

      for (const settlement of settlements) {
        try {
          await activityAdapter.logSettlementCreated({
            settlementId: settlement.id,
            fromUserId: settlement.fromUserId,
            fromUserName: settlement.fromUserId === currentUserId ? currentUserName : friendName,
            toUserName: settlement.fromUserId === currentUserId ? friendName : currentUserName,
            amount: settlement.amount,
            groupId: settlement.groupId,
          });
        } catch {
          // Activity logging must not turn a completed settlement into a failure.
        }
      }

      return settlements;
    },
  };
}

export const friendDetailModule = createFriendDetailModule();
