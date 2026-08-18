import type { Settlement } from '@/types/database';
import {
  buildCombinedSettlementPlan,
  type CombinedSettlementScopeTransfer,
  type CombinedSettlementAllocation,
} from './friend-settlement-allocation';
import { settlementService } from './settlement-service';
import type { FriendGroupBalanceSummary } from './friend-detail-service';

export type CombinedSettlementDirection = 'you_paid_friend' | 'friend_paid_you';

export type CombinedSettlementReceipt = {
  paymentIntentId: string;
  reused: boolean;
  committedAt: number;
  totalAmount: number;
  currency: string;
  direction: CombinedSettlementDirection;
  settlements: Settlement[];
  operationId?: string;
  mode?: 'all_balances' | 'group';
  affectedGroupIds?: string[];
  transfers?: SettlementScopeTransfer[];
};

export type SettlementScopeTransfer = {
  id: string;
  operationId: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  currency: string;
  signedGroupBalanceDelta: number;
  note?: string;
  isReversal?: boolean;
  createdAt: number;
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
  mode?: 'all_balances' | 'group';
  groupId?: string;
};

export type CombinedSettlementCommitRequest = {
  paymentIntentId: string;
  friendId: string;
  amount: number;
  currency: string;
  date: number;
  expectedBalance: number;
  allocations: CombinedSettlementAllocation[];
  transfers?: CombinedSettlementScopeTransfer[];
  mode?: 'all_balances' | 'group';
  groupId?: string;
};

export type CombinedSettlementPersistenceAdapter = {
  commit(request: CombinedSettlementCommitRequest): Promise<CombinedSettlementReceipt>;
};

export type CombinedSettlementService = {
  commit(params: CombinedSettlementCommitParams): Promise<CombinedSettlementReceipt>;
};

export function shouldLogSettlementActivity(receipt: CombinedSettlementReceipt): boolean {
  return !receipt.reused;
}

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
      const plan = buildCombinedSettlementPlan(params);
      return persistence.commit({
        paymentIntentId: params.paymentIntentId,
        friendId: params.friendId,
        amount: params.amount,
        currency: params.currency,
        date: params.date,
        expectedBalance: params.expectedBalance,
        allocations: plan.allocations,
        ...(plan.transfers.length > 0 ? { transfers: plan.transfers } : {}),
        mode: params.mode,
        groupId: params.groupId,
      });
    },
  };
}

export const combinedSettlementService = createCombinedSettlementService();
