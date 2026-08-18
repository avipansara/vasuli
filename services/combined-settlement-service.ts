import type { Settlement } from '@/types/database';
import {
  buildCombinedSettlementAllocations,
  type CombinedSettlementAllocation,
} from './friend-settlement-allocation';
import { settlementService } from './settlement-service';
import type { FriendGroupBalanceSummary } from './friend-detail-service';

export type CombinedSettlementReceipt = {
  totalAmount: number;
  currency: string;
  settlements: Settlement[];
};

export type CombinedSettlementCommitParams = {
  currentUserId: string;
  friendId: string;
  amount: number;
  currency: string;
  date: number;
  directBalance: number;
  groupBalances: FriendGroupBalanceSummary[];
};

export type CombinedSettlementPersistenceAdapter = {
  create(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement>;
};

export type CombinedSettlementService = {
  commit(params: CombinedSettlementCommitParams): Promise<CombinedSettlementReceipt>;
};

export function createCombinedSettlementService(
  persistence: CombinedSettlementPersistenceAdapter = settlementService,
): CombinedSettlementService {
  return {
    async commit(params) {
      const allocations = buildCombinedSettlementAllocations(params);
      const settlements: Settlement[] = [];

      for (const allocation of allocations) {
        settlements.push(await persistence.create(toSettlementInput(allocation, params.date)));
      }

      return {
        totalAmount: params.amount,
        currency: params.currency,
        settlements,
      };
    },
  };
}

function toSettlementInput(
  allocation: CombinedSettlementAllocation,
  date: number,
): Omit<Settlement, 'id' | 'createdAt'> {
  return {
    groupId: allocation.groupId,
    fromUserId: allocation.fromUserId,
    toUserId: allocation.toUserId,
    amount: allocation.amount,
    currency: allocation.currency,
    date,
  };
}

export const combinedSettlementService = createCombinedSettlementService();
