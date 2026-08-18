import type { Settlement } from '@/types/database';
import {
  buildCombinedSettlementAllocations,
  type CombinedSettlementAllocation,
} from './friend-settlement-allocation';
import { settlementService } from './settlement-service';
import type { FriendGroupBalanceSummary } from './friend-detail-service';

export type CombinedSettlementReceipt = {
  paymentIntentId: string;
  reused: boolean;
  totalAmount: number;
  currency: string;
  settlements: Settlement[];
};

export type CombinedSettlementCommitParams = {
  currentUserId: string;
  friendId: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  date: number;
  expectedBalance: number;
  directBalance: number;
  groupBalances: FriendGroupBalanceSummary[];
};

export type CombinedSettlementCommitRequest = {
  paymentIntentId: string;
  friendId: string;
  amount: number;
  currency: string;
  date: number;
  expectedBalance: number;
  allocations: CombinedSettlementAllocation[];
};

export type CombinedSettlementPersistenceAdapter = {
  commit(request: CombinedSettlementCommitRequest): Promise<CombinedSettlementReceipt>;
};

export type CombinedSettlementService = {
  commit(params: CombinedSettlementCommitParams): Promise<CombinedSettlementReceipt>;
};

export function createPaymentIntentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const segment = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${segment()}-${segment().slice(0, 4)}-4${segment().slice(0, 3)}-${segment().slice(0, 4)}-${segment()}${segment().slice(0, 4)}`;
}

export function createCombinedSettlementService(
  persistence: CombinedSettlementPersistenceAdapter = settlementService,
): CombinedSettlementService {
  return {
    async commit(params) {
      const allocations = buildCombinedSettlementAllocations(params);
      return persistence.commit({
        paymentIntentId: params.paymentIntentId,
        friendId: params.friendId,
        amount: params.amount,
        currency: params.currency,
        date: params.date,
        expectedBalance: params.expectedBalance,
        allocations,
      });
    },
  };
}

export const combinedSettlementService = createCombinedSettlementService();
