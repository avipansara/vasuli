import { supabase } from '@/lib/supabase';
import type { Settlement, User } from '@/types/database';
import type { FriendGroupBalanceSummary } from './friend-detail-service';
import { expenseService } from './expense-service';
import { activityService } from './activity-service';
import {
  applyScopeTransferToGroupReadModel,
  applySettlementToGroupReadModel,
  type GroupDetailReadModel,
} from './group-detail-read-model';
import { queryKeys } from './query-keys';
import { getFriendRelationshipInvalidationKeys } from './friend-relationship-invalidation';

export type CombinedSettlementErrorCode =
  | 'invalid_input'
  | 'stale_balance'
  | 'unauthorized'
  | 'conflict'
  | 'transient';

export class CombinedSettlementError extends Error {
  constructor(
    public readonly code: CombinedSettlementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CombinedSettlementError';
  }
}

function mapCombinedSettlementError(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return new CombinedSettlementError('transient', 'The payment could not be confirmed. Please retry.');
  }

  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const code = message.match(/SETTLEMENT_[A-Z_]+/)?.[0];
  if (!code) return new CombinedSettlementError('transient', 'The payment could not be confirmed. Please retry.');

  const mappings: Record<string, [CombinedSettlementErrorCode, string]> = {
    SETTLEMENT_STALE_BALANCE: ['stale_balance', 'This balance changed. Refresh and try again.'],
    SETTLEMENT_FRIENDSHIP_REQUIRED: ['unauthorized', 'You can only settle with an accepted friend.'],
    SETTLEMENT_GROUP_SCOPE_INVALID: ['unauthorized', 'This Group is no longer shared by both people.'],
    SETTLEMENT_ALLOCATION_DIRECTION_INVALID: ['invalid_input', 'The payment direction is no longer valid.'],
    SETTLEMENT_ALLOCATION_OVER_BALANCE: ['invalid_input', 'The payment exceeds the current outstanding balance.'],
    SETTLEMENT_ALLOCATION_TOTAL_MISMATCH: ['invalid_input', 'The settlement allocation is invalid.'],
    SETTLEMENT_AMOUNT_INVALID: ['invalid_input', 'Enter an amount with at most two decimal places.'],
    SETTLEMENT_CURRENCY_REQUIRED: ['invalid_input', 'A settlement currency is required.'],
    SETTLEMENT_ALLOCATIONS_REQUIRED: ['invalid_input', 'Choose a settlement scope.'],
    SETTLEMENT_ALLOCATION_INVALID: ['invalid_input', 'The settlement allocation is invalid.'],
    SETTLEMENT_CURRENCY_UNSUPPORTED: ['invalid_input', 'This settlement currency is not supported.'],
    SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT: ['conflict', 'This payment was already submitted with different details.'],
    SETTLEMENT_MODE_INVALID: ['invalid_input', 'This settlement mode is not supported.'],
    SETTLEMENT_GROUP_REQUIRED: ['invalid_input', 'Choose a group to settle.'],
    SETTLEMENT_TRANSFERS_INVALID: ['invalid_input', 'The settlement transfer plan is invalid.'],
    SETTLEMENT_TRANSFERS_REQUIRED: ['invalid_input', 'Choose the balances to clear.'],
    SETTLEMENT_TRANSFER_INVALID: ['invalid_input', 'The settlement transfer is invalid.'],
    SETTLEMENT_TRANSFER_BALANCE_MISMATCH: ['invalid_input', 'The settlement transfer no longer matches the Group balance.'],
    SETTLEMENT_OPERATION_INVALID: ['transient', 'The settlement operation could not be confirmed. Please retry.'],
    SETTLEMENT_OPERATION_NOT_FOUND: ['invalid_input', 'This settlement operation no longer exists.'],
    SETTLEMENT_REVERSAL_UNAUTHORIZED: ['unauthorized', 'Only the people in this settlement can reverse it.'],
    SETTLEMENT_OPERATION_INVALID_STATUS: ['conflict', 'This settlement operation cannot be reversed.'],
  };
  const mapping = mappings[code];
  return mapping ? new CombinedSettlementError(mapping[0], mapping[1]) : error;
}

export type SettlementOperationReversal = {
  operationId: string;
  status: 'reversed';
  reversedAt: number;
  reused: boolean;
};

export const SUPPORTED_SETTLEMENT_CURRENCIES = ['USD'] as const;

export type CombinedSettlementDirection = 'you_paid_friend' | 'friend_paid_you';

export type CombinedSettlementAllocation = {
  groupId?: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
};

export type CombinedSettlementScopeTransfer = {
  id: string;
  operationId: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  currency: string;
  /** Change to the current user's Group balance; direct balance applies -delta. */
  signedGroupBalanceDelta: number;
  note?: string;
  isReversal?: boolean;
  createdAt: number;
};

export type CombinedSettlementPlan = {
  allocations: CombinedSettlementAllocation[];
  transfers: CombinedSettlementScopeTransfer[];
};

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
  transfers?: CombinedSettlementScopeTransfer[];
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

type CombinedSettlementParams = {
  currentUserId: string;
  friendId: string;
  currency: string;
  amount: number;
  directBalance: number;
  groupBalances: FriendGroupBalanceSummary[];
};

type SettlementModuleCommitParams = CombinedSettlementParams & {
  paymentIntentId: string;
  date: number;
  expectedBalance: number;
  mode?: 'all_balances' | 'group';
  groupId?: string;
  friend: User;
  currentUser: User;
  queryClient: ReceiptEffectsQueryClient;
};

type ReceiptEffectsQueryClient = {
  invalidateQueries(options: { queryKey: readonly unknown[] }): Promise<unknown>;
  setQueryData<T>(queryKey: readonly unknown[], updater: (current: T | undefined) => T): void;
};

export const settlementModule = {
  preview(params: CombinedSettlementParams): CombinedSettlementPlan {
    return buildCombinedSettlementPlan(params);
  },

  async reverse(params: {
    operationId: string;
    expectedBalance: number;
    currentUserId: string;
    friendId?: string;
    queryClient: ReceiptEffectsQueryClient;
  }): Promise<SettlementOperationReversal> {
    const receipt = await settlementService.reverse(params.operationId, params.expectedBalance);

    await invalidateSafely(params.queryClient, [
      ...getFriendRelationshipInvalidationKeys(params.currentUserId, params.friendId),
      queryKeys.groups.list(params.currentUserId),
    ]);

    return receipt;
  },

  async commit(params: SettlementModuleCommitParams): Promise<CombinedSettlementReceipt> {
    const plan = buildCombinedSettlementPlan(params);
    if (__DEV__) {
      console.log('[Settlement][plan]', {
        friendId: params.friendId,
        currency: params.currency,
        amount: params.amount,
        expectedBalance: params.expectedBalance,
        directBalance: params.directBalance,
        groupBalances: params.groupBalances.map(group => ({
          groupId: group.groupId,
          amount: group.amount,
          currency: group.currency,
          direction: group.direction,
        })),
        allocations: plan.allocations.map(allocation => ({
          groupId: allocation.groupId ?? null,
          fromUserId: allocation.fromUserId,
          toUserId: allocation.toUserId,
          amount: allocation.amount,
        })),
        transfers: plan.transfers.map(transfer => ({
          groupId: transfer.groupId,
          fromUserId: transfer.fromUserId,
          toUserId: transfer.toUserId,
          amount: transfer.amount,
          signedGroupBalanceDelta: transfer.signedGroupBalanceDelta,
        })),
      });
    }

    const receipt = await settlementService.commit({
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

    await applyReceiptEffects({
      receipt,
      currentUserId: params.currentUser.id,
      friend: params.friend,
      currentUser: params.currentUser,
      queryClient: params.queryClient,
    });

    return receipt;
  },
};

export function buildCombinedSettlementPlan({
  currentUserId,
  friendId,
  currency,
  amount,
  directBalance,
  groupBalances,
}: CombinedSettlementParams): CombinedSettlementPlan {
  if (!Number.isFinite(amount) || amount < 0 || !isWholeCent(amount)) {
    throw new Error('Settlement amount must be zero or greater and use at most two decimal places.');
  }
  if (!Number.isFinite(directBalance) || groupBalances.some(group => !Number.isFinite(group.amount))) {
    throw new Error('Settlement balance is invalid.');
  }
  if (!SUPPORTED_SETTLEMENT_CURRENCIES.includes(currency as typeof SUPPORTED_SETTLEMENT_CURRENCIES[number])) {
    throw new Error('Settlement currency is not supported.');
  }
  if (groupBalances.some(group => group.currency !== currency && group.direction !== 'settled')) {
    throw new Error('Settlement currencies must be handled separately.');
  }

  const groups = groupBalances
    .filter(group => group.currency === currency && group.direction !== 'settled')
    .map(group => ({
      groupId: group.groupId,
      amount: normalizeAmount(group.amount),
      lastActivityAt: group.lastActivityAt ?? 0,
    }))
    .filter(scope => scope.amount !== 0);
  const totalBalanceCents = toCents(directBalance) + groups.reduce(
    (total, scope) => total + toCents(scope.amount),
    0,
  );
  const totalBalance = totalBalanceCents / 100;

  if (totalBalance === 0 && amount !== 0) {
    throw new Error('Settlement amount cannot exceed the combined outstanding balance.');
  }
  if (totalBalance !== 0 && toCents(amount) > Math.abs(totalBalanceCents)) {
    throw new Error('Settlement amount cannot exceed the combined outstanding balance.');
  }

  const paymentDirection = Math.sign(totalBalance);
  const isFullNetSettlement = toCents(amount) === Math.abs(totalBalanceCents);
  if (!isFullNetSettlement) {
    const paymentScopes = [
      { groupId: undefined, amount: normalizeAmount(directBalance), lastActivityAt: Number.MIN_SAFE_INTEGER },
      ...groups,
    ]
      .filter(scope => scope.amount !== 0 && Math.sign(scope.amount) === paymentDirection)
      .sort((a, b) => a.groupId ? a.lastActivityAt - b.lastActivityAt : -Infinity);

    return {
      ...buildPaymentAllocations({
        paymentScopes,
        amount,
        currentUserId,
        friendId,
        currency,
        paymentDirection,
      }),
      transfers: [],
    };
  }

  const directSign = Math.sign(directBalance);
  const transferAllGroups = directBalance === 0 || totalBalance === 0;
  const transferGroups = transferAllGroups || directSign !== paymentDirection
    ? groups.filter(scope => transferAllGroups || Math.sign(scope.amount) !== directSign)
    : groups.filter(scope => Math.sign(scope.amount) !== paymentDirection);
  const transferredGroupIds = new Set(transferGroups.map(scope => scope.groupId));
  const transfers = transferGroups.map(scope => ({
    groupId: scope.groupId,
    fromUserId: scope.amount > 0 ? friendId : currentUserId,
    toUserId: scope.amount > 0 ? currentUserId : friendId,
    amount: Math.abs(scope.amount),
    currency,
    signedGroupBalanceDelta: -scope.amount,
  }));

  const paymentScopes = directSign !== paymentDirection && directBalance !== 0
    ? [
        {
          groupId: undefined,
          amount: normalizeAmount(
            directBalance - transfers.reduce((total, transfer) => total + transfer.signedGroupBalanceDelta, 0),
          ),
          lastActivityAt: Number.MIN_SAFE_INTEGER,
        },
        ...groups.filter(scope => !transferredGroupIds.has(scope.groupId)),
      ]
    : directBalance === 0
      ? [
          {
            groupId: undefined,
            amount: normalizeAmount(
              directBalance - transfers.reduce((total, transfer) => total + transfer.signedGroupBalanceDelta, 0),
            ),
            lastActivityAt: Number.MIN_SAFE_INTEGER,
          },
          ...groups.filter(scope => !transferredGroupIds.has(scope.groupId)),
        ]
    : [
        { groupId: undefined, amount: normalizeAmount(directBalance), lastActivityAt: Number.MIN_SAFE_INTEGER },
        ...groups.filter(scope => !transferredGroupIds.has(scope.groupId)),
      ];

  if (paymentScopes.some(scope => Math.sign(scope.amount) !== paymentDirection)) {
    throw new Error('Settlement transfer plan did not normalize the payment direction.');
  }

  return {
    ...buildPaymentAllocations({
      paymentScopes: [...paymentScopes].sort((a, b) => a.groupId ? a.lastActivityAt - b.lastActivityAt : -Infinity),
      amount,
      currentUserId,
      friendId,
      currency,
      paymentDirection,
    }),
    transfers,
  };
}

function buildPaymentAllocations({
  paymentScopes,
  amount,
  currentUserId,
  friendId,
  currency,
  paymentDirection,
}: {
  paymentScopes: { groupId?: string; amount: number; lastActivityAt: number }[];
  amount: number;
  currentUserId: string;
  friendId: string;
  currency: string;
  paymentDirection: number;
}): { allocations: CombinedSettlementAllocation[] } {
  let remainingCents = toCents(amount);
  const fromUserId = paymentDirection < 0 ? currentUserId : friendId;
  const toUserId = paymentDirection < 0 ? friendId : currentUserId;
  const allocations = paymentScopes.flatMap(scope => {
    if (remainingCents <= 0) return [];
    const allocationCents = Math.min(toCents(Math.abs(scope.amount)), remainingCents);
    remainingCents -= allocationCents;
    if (allocationCents === 0) return [];
    return [{
      groupId: scope.groupId,
      fromUserId,
      toUserId,
      amount: allocationCents / 100,
      currency,
    }];
  });

  if (remainingCents !== 0) {
    throw new Error('Settlement transfer plan could not allocate the requested amount.');
  }

  return { allocations };
}

function normalizeAmount(amount: number): number {
  return Math.abs(amount) < 0.01 ? 0 : Number(amount.toFixed(2));
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function isWholeCent(amount: number): boolean {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < Number.EPSILON * 100;
}

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

async function applyReceiptEffects({
  receipt,
  currentUserId,
  friend,
  currentUser,
  queryClient,
}: {
  receipt: CombinedSettlementReceipt;
  currentUserId: string;
  friend: User;
  currentUser: User;
  queryClient: ReceiptEffectsQueryClient;
}): Promise<void> {
  const settledGroupIds = [...new Set(
    receipt.settlements.flatMap(settlement => settlement.groupId ? [settlement.groupId] : [])
  )];
  const affectedGroupIds = [...new Set([
    ...settledGroupIds,
    ...(receipt.affectedGroupIds ?? []),
    ...(receipt.transfers ?? []).map(transfer => transfer.groupId),
  ])];

  await invalidateSafely(queryClient, [
    ...getFriendRelationshipInvalidationKeys(currentUserId, friend.id),
    queryKeys.groups.list(currentUserId),
  ]);

  if (shouldLogSettlementActivity(receipt)) {
    try {
      for (const settlement of receipt.settlements) {
        const currentUserPaid = settlement.fromUserId === currentUserId;
        await activityService.logSettlementCreated({
          settlementId: settlement.id,
          fromUserId: settlement.fromUserId,
          fromUserName: currentUserPaid ? currentUser.name : friend.name,
          toUserName: currentUserPaid ? friend.name : currentUser.name,
          amount: settlement.amount,
          groupId: settlement.groupId,
        });
      }
    } catch (error) {
      console.warn('Settlement activity logging failed after commit:', error);
    }
  }

  for (const groupId of affectedGroupIds) {
    const groupSettlements = receipt.settlements.filter(settlement => settlement.groupId === groupId);
    try {
      queryClient.setQueryData<GroupDetailReadModel | null>(
        queryKeys.groups.detail(currentUserId, groupId),
        current => {
          const withSettlements = groupSettlements.reduce(
            (model, settlement) => model ? applySettlementToGroupReadModel(model, settlement) : model,
            current ?? null,
          );
          return (receipt.transfers ?? [])
            .filter(transfer => transfer.groupId === groupId)
            .reduce(
              (model, transfer) => model ? applyScopeTransferToGroupReadModel(model, transfer) : model,
              withSettlements,
            );
        }
      );
    } catch (error) {
      console.warn(`Group ${groupId} cache update failed after settlement commit:`, error);
    }
  }

  await invalidateSafely(queryClient, [
    ...affectedGroupIds.map(groupId => queryKeys.groups.detail(currentUserId, groupId)),
    queryKeys.activity.list(currentUserId),
  ]);
}

async function invalidateSafely(
  queryClient: ReceiptEffectsQueryClient,
  queryKeysToInvalidate: readonly (readonly unknown[])[],
): Promise<void> {
  try {
    await Promise.all(queryKeysToInvalidate.map(queryKey => queryClient.invalidateQueries({ queryKey })));
  } catch (error) {
    console.warn('Settlement cache invalidation failed after commit:', error);
  }
}

export const settlementService = {
  async commit(request: CombinedSettlementCommitRequest): Promise<CombinedSettlementReceipt> {
    const { data, error } = request.amount === 0
      ? await supabase.rpc('commit_zero_net_settlement_operation', {
        p_payment_intent_id: request.paymentIntentId,
        p_friend_id: request.friendId,
        p_currency: request.currency,
        p_date: new Date(request.date).toISOString(),
        p_expected_balance: request.expectedBalance,
        p_transfers: request.transfers ?? [],
      })
      : await supabase.rpc('commit_settlement_operation', {
        p_payment_intent_id: request.paymentIntentId,
        p_friend_id: request.friendId,
        p_group_id: request.groupId ?? null,
        p_mode: request.mode ?? 'all_balances',
        p_amount: request.amount,
        p_currency: request.currency,
        p_date: new Date(request.date).toISOString(),
        p_expected_balance: request.expectedBalance,
        p_allocations: request.allocations,
        p_transfers: request.transfers ?? [],
      });

    if (error) {
      console.error('[Settlement][commit] RPC failed', {
        rpc: request.amount === 0 ? 'commit_zero_net_settlement_operation' : 'commit_settlement_operation',
        paymentIntentSuffix: request.paymentIntentId.slice(-8),
        friendId: request.friendId,
        amount: request.amount,
        currency: request.currency,
        mode: request.mode ?? 'all_balances',
        groupId: request.groupId ?? null,
        expectedBalance: request.expectedBalance,
        allocationCount: request.allocations.length,
        transferCount: request.transfers?.length ?? 0,
        error: {
          code: 'code' in error ? error.code : undefined,
          message: 'message' in error ? error.message : String(error),
          details: 'details' in error ? error.details : undefined,
          hint: 'hint' in error ? error.hint : undefined,
        },
      });
      throw mapCombinedSettlementError(error);
    }

    return mapCombinedSettlementReceipt(data);
  },

  async reverse(operationId: string, expectedBalance: number): Promise<SettlementOperationReversal> {
    const { data, error } = await supabase.rpc('reverse_settlement_operation', {
      p_operation_id: operationId,
      p_expected_balance: expectedBalance,
    });

    if (error) {
      console.error('[Settlement][reverse] RPC failed', {
        operationId,
        expectedBalance,
        error: {
          code: 'code' in error ? error.code : undefined,
          message: 'message' in error ? error.message : String(error),
          details: 'details' in error ? error.details : undefined,
          hint: 'hint' in error ? error.hint : undefined,
        },
      });
      throw mapCombinedSettlementError(error);
    }
    return mapSettlementOperationReversal(data);
  },

  async create(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement> {
    const createdAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('settlements')
      .insert({
        group_id: settlement.groupId,
        from_user_id: settlement.fromUserId,
        to_user_id: settlement.toUserId,
        amount: settlement.amount,
        currency: settlement.currency,
        date: new Date(settlement.date).toISOString(),
        notes: settlement.notes || null,
        created_at: createdAt,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      operationId: data.operation_id || undefined,
      groupId: data.group_id,
      fromUserId: data.from_user_id,
      toUserId: data.to_user_id,
      amount: data.amount,
      currency: data.currency,
      date: new Date(data.date).getTime(),
      notes: data.notes || undefined,
      createdAt: new Date(data.created_at).getTime(),
    };
  },

  async getUserSettlements(userId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      operationId: r.operation_id || undefined,
      groupId: r.group_id || undefined,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amount: r.amount,
      currency: r.currency,
      date: new Date(r.date).getTime(),
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async getByGroup(groupId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('date', { ascending: false });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      operationId: r.operation_id || undefined,
      groupId: r.group_id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amount: r.amount,
      currency: r.currency,
      date: new Date(r.date).getTime(),
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async getByGroups(groupIds: string[]): Promise<Settlement[]> {
    const uniqueGroupIds = [...new Set(groupIds)].filter(Boolean);
    if (uniqueGroupIds.length === 0) return [];

    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .in('group_id', uniqueGroupIds)
      .order('date', { ascending: false });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      operationId: r.operation_id || undefined,
      groupId: r.group_id || undefined,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amount: r.amount,
      currency: r.currency,
      date: new Date(r.date).getTime(),
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('settlements')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

};

function mapCombinedSettlementReceipt(data: unknown): CombinedSettlementReceipt {
  if (!data || typeof data !== 'object') {
    throw new Error('Combined settlement commit returned an invalid receipt.');
  }

  const receipt = data as {
    paymentIntentId?: unknown;
    reused?: unknown;
    committedAt?: unknown;
    totalAmount?: unknown;
    currency?: unknown;
    direction?: unknown;
    settlements?: unknown;
    operationId?: unknown;
    mode?: unknown;
    affectedGroupIds?: unknown;
    transfers?: unknown;
  };

  if (
    typeof receipt.paymentIntentId !== 'string'
    || typeof receipt.reused !== 'boolean'
    || typeof receipt.committedAt !== 'string'
    || typeof receipt.totalAmount !== 'number'
    || typeof receipt.currency !== 'string'
    || (receipt.direction !== 'you_paid_friend' && receipt.direction !== 'friend_paid_you')
    || !Array.isArray(receipt.settlements)
  ) {
    throw new Error('Combined settlement commit returned an invalid receipt.');
  }

  return {
    paymentIntentId: receipt.paymentIntentId,
    reused: receipt.reused,
    committedAt: new Date(receipt.committedAt).getTime(),
    totalAmount: receipt.totalAmount,
    currency: receipt.currency,
    direction: receipt.direction,
    settlements: receipt.settlements.map(mapSettlementReceipt),
    operationId: typeof receipt.operationId === 'string' ? receipt.operationId : undefined,
    mode: receipt.mode === 'group' ? 'group' : 'all_balances',
    affectedGroupIds: Array.isArray(receipt.affectedGroupIds)
      ? receipt.affectedGroupIds.filter((value): value is string => typeof value === 'string')
      : [...new Set(receipt.settlements.flatMap(settlement => settlement.groupId ? [settlement.groupId] : []))],
    transfers: Array.isArray(receipt.transfers)
      ? receipt.transfers.map(mapSettlementScopeTransfer)
      : [],
  };
}

function mapSettlementOperationReversal(data: unknown): SettlementOperationReversal {
  if (!data || typeof data !== 'object') {
    throw new Error('Settlement reversal returned an invalid receipt.');
  }

  const receipt = data as Record<string, unknown>;
  const reversedAt = typeof receipt.reversedAt === 'string'
    ? new Date(receipt.reversedAt).getTime()
    : Number.NaN;
  if (
    typeof receipt.operationId !== 'string'
    || receipt.status !== 'reversed'
    || typeof receipt.reversedAt !== 'string'
    || !Number.isFinite(reversedAt)
    || typeof receipt.reused !== 'boolean'
  ) {
    throw new Error('Settlement reversal returned an invalid receipt.');
  }

  return {
    operationId: receipt.operationId,
    status: 'reversed',
    reversedAt,
    reused: receipt.reused,
  };
}

function mapSettlementScopeTransfer(value: unknown): CombinedSettlementScopeTransfer {
  if (!value || typeof value !== 'object') {
    throw new Error('Settlement operation returned an invalid scope transfer.');
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || typeof row.operationId !== 'string'
    || typeof row.groupId !== 'string'
    || typeof row.fromUserId !== 'string'
    || typeof row.toUserId !== 'string'
    || typeof row.currency !== 'string'
    || typeof row.signedGroupBalanceDelta !== 'number'
    || typeof row.createdAt !== 'string'
  ) {
    throw new Error('Settlement operation returned an invalid scope transfer.');
  }

  return {
    id: row.id,
    operationId: row.operationId,
    groupId: row.groupId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    currency: row.currency,
    signedGroupBalanceDelta: row.signedGroupBalanceDelta,
    note: typeof row.note === 'string' ? row.note : undefined,
    isReversal: row.isReversal === true,
    createdAt: new Date(row.createdAt).getTime(),
  };
}

function mapSettlementReceipt(value: unknown): Settlement {
  if (!value || typeof value !== 'object') {
    throw new Error('Combined settlement commit returned an invalid settlement.');
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || (row.groupId !== null && row.groupId !== undefined && typeof row.groupId !== 'string')
    || typeof row.fromUserId !== 'string'
    || typeof row.toUserId !== 'string'
    || typeof row.amount !== 'number'
    || typeof row.currency !== 'string'
    || typeof row.date !== 'string'
    || typeof row.createdAt !== 'string'
  ) {
    throw new Error('Combined settlement commit returned an invalid settlement.');
  }

  return {
    id: row.id,
    operationId: typeof row.operationId === 'string' ? row.operationId : undefined,
    groupId: typeof row.groupId === 'string' ? row.groupId : undefined,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    amount: row.amount,
    currency: row.currency,
    date: new Date(row.date).getTime(),
    notes: typeof row.notes === 'string' ? row.notes : undefined,
    createdAt: new Date(row.createdAt).getTime(),
  };
}
