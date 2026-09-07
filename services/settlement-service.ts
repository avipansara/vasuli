import { supabase } from '@/lib/supabase';
import type { Settlement, SettlementCancellation, User } from '@/types/database';
import type { FriendGroupBalanceSummary } from './friend-detail-service';
import { activityService } from './activity-service';
import {
  applyCancellationToGroupReadModel,
  applyScopeTransferToGroupReadModel,
  applySettlementToGroupReadModel,
  type GroupDetailReadModel,
} from './group-detail-read-model';
import { queryKeys } from './query-keys';
import { getFriendRelationshipInvalidationKeys } from './friend-relationship-invalidation';
import { mapSettlementRow } from './database-row-mappers';

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
    // Stale or hand-built payloads that still send the frozen transfer table
    // surface here; the plan needs a fresh confirmation, not a raw RPC error.
    SETTLEMENT_TRANSFERS_FROZEN: ['invalid_input', 'This settlement needs a fresh confirmation. Refresh and try again.'],
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
  /** signedGroupBalanceDelta is the change to the transfer from-user's Group balance (ticket 09 shared orientation); the direct-ledger projection applies the inverse (-delta). */
  signedGroupBalanceDelta: number;
  note?: string;
  isReversal?: boolean;
  createdAt: number;
};

/**
 * A planned balance cancellation names the cleared scope and amount. The
 * commit RPC captures the immutable signed effect from its settled snapshot.
 * Sent as `p_cancellations`; never as `p_transfers`.
 */
export type PlannedSettlementCancellation = {
  groupId: string;
  amount: number;
  currency: string;
};

export type CombinedSettlementPlan = {
  allocations: CombinedSettlementAllocation[];
  cancellations: PlannedSettlementCancellation[];
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
  cancellations?: SettlementCancellation[];
};

export type CombinedSettlementCommitRequest = {
  paymentIntentId: string;
  friendId: string;
  amount: number;
  currency: string;
  date: number;
  expectedBalance: number;
  allocations: CombinedSettlementAllocation[];
  cancellations?: PlannedSettlementCancellation[];
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
    if (plan.allocations.length === 0 && plan.cancellations.length === 0) {
      throw new CombinedSettlementError('invalid_input', 'There is no outstanding balance to settle.');
    }
    const receipt = await settlementService.commit({
      paymentIntentId: params.paymentIntentId,
      friendId: params.friendId,
      amount: params.amount,
      currency: params.currency,
      date: params.date,
      expectedBalance: params.expectedBalance,
      allocations: plan.allocations,
      ...(plan.cancellations.length > 0 ? { cancellations: plan.cancellations } : {}),
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
    }))
    .filter(scope => scope.amount !== 0);
  const orderedGroups = [...groups].sort(
    (a, b) => toCents(Math.abs(a.amount)) - toCents(Math.abs(b.amount))
      || a.groupId.localeCompare(b.groupId),
  );
  const totalBalanceCents = toCents(directBalance) + groups.reduce(
    (total, scope) => total + toCents(scope.amount),
    0,
  );
  const totalBalance = totalBalanceCents / 100;

  if (totalBalance === 0) {
    if (amount !== 0) {
      throw new Error('Settlement amount cannot exceed the combined outstanding balance.');
    }
    return { allocations: [], cancellations: [] };
  }
  if (totalBalance !== 0 && toCents(amount) > Math.abs(totalBalanceCents)) {
    throw new Error('Settlement amount cannot exceed the combined outstanding balance.');
  }

  const paymentDirection = Math.sign(totalBalance);
  const isFullNetSettlement = toCents(amount) === Math.abs(totalBalanceCents);
  if (!isFullNetSettlement) {
    const paymentScopes = [
      { groupId: undefined, amount: normalizeAmount(directBalance) },
      ...groups,
    ]
      .filter(scope => scope.amount !== 0 && Math.sign(scope.amount) === paymentDirection)
      .sort((a, b) => a.groupId === undefined ? -1 : b.groupId === undefined ? 1 : toCents(Math.abs(a.amount)) - toCents(Math.abs(b.amount)) || a.groupId.localeCompare(b.groupId));

    return {
      ...buildPaymentAllocations({
        paymentScopes,
        amount,
        currentUserId,
        friendId,
        currency,
        paymentDirection,
      }),
      cancellations: [],
    };
  }

  const paymentScopes = [
    { groupId: undefined, amount: normalizeAmount(directBalance) },
    ...groups,
  ].filter(scope => scope.amount !== 0 && Math.sign(scope.amount) === paymentDirection)
    .sort((a, b) => a.groupId === undefined ? -1 : b.groupId === undefined ? 1 : toCents(Math.abs(a.amount)) - toCents(Math.abs(b.amount)) || a.groupId.localeCompare(b.groupId));
  const allocations = buildPaymentAllocations({
      paymentScopes,
      amount,
      currentUserId,
      friendId,
      currency,
      paymentDirection,
    });
  const paidByGroup = new Map(allocations.allocations.map(item => [item.groupId, item.amount]));
  // Dedicated cancellation surface: one entry per nonzero group residual,
  // reusing the residual math above but emitting only the cleared scope and
  // amount. The signed effect is captured by the commit RPC from the settled
  // snapshot. Full-payment plans only; the
  // partial branch returns above with `cancellations: []`.
  const cancellations = orderedGroups.map(scope => {
    const paid = paidByGroup.get(scope.groupId) ?? 0;
    const residual = scope.amount + (scope.amount < 0 ? paid : -paid);
    if (residual === 0) return null;
    return {
      groupId: scope.groupId,
      amount: Math.abs(residual),
      currency,
    };
  }).filter((cancellation): cancellation is NonNullable<typeof cancellation> => cancellation !== null);
  return { ...allocations, cancellations };
}

function buildPaymentAllocations({
  paymentScopes,
  amount,
  currentUserId,
  friendId,
  currency,
  paymentDirection,
}: {
  paymentScopes: { groupId?: string; amount: number }[];
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
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
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
  // Cancellation-only scopes record no cash and no legacy transfers, so their
  // groups must join the invalidation/projection set explicitly — otherwise a
  // full settlement would leave cleared group, pair-total, and home caches
  // stale while friend caches refresh.
  const affectedGroupIds = [...new Set([
    ...settledGroupIds,
    ...(receipt.affectedGroupIds ?? []),
    ...(receipt.transfers ?? []).map(transfer => transfer.groupId),
    ...(receipt.cancellations ?? []).map(cancellation => cancellation.groupId),
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
    // Receipt cancellations always belong to this commit's operation between
    // the committing pair, so the cache projection scopes them to that pair
    // explicitly rather than resolving through possibly-stale metadata.
    const receiptPair: [string, string] = [currentUserId, friend.id];
    try {
      queryClient.setQueryData<GroupDetailReadModel | null>(
        queryKeys.groups.detail(currentUserId, groupId),
        current => {
          const withSettlements = groupSettlements.reduce(
            (model, settlement) => model ? applySettlementToGroupReadModel(model, settlement) : model,
            current,
          );
          const withTransfers = (receipt.transfers ?? [])
            .filter(transfer => transfer.groupId === groupId)
            .reduce(
              (model, transfer) => model ? applyScopeTransferToGroupReadModel(model, transfer) : model,
              withSettlements,
            ) as GroupDetailReadModel | null;
          return (receipt.cancellations ?? [])
            .filter(cancellation => cancellation.groupId === groupId)
            .reduce(
              (model, cancellation) => model ? applyCancellationToGroupReadModel(model, cancellation, () => receiptPair) : model,
              withTransfers,
            ) as GroupDetailReadModel | null;
        }
      );
    } catch (error) {
      console.warn(`Group ${groupId} cache update failed after settlement commit:`, error);
    }
  }

  await invalidateSafely(queryClient, [
    ...affectedGroupIds.map(groupId => queryKeys.groups.detail(currentUserId, groupId)),
    ...affectedGroupIds.map(groupId => queryKeys.groups.pairTotals(currentUserId, groupId)),
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
    if (!Number.isFinite(request.amount) || request.amount <= 0) {
      throw new CombinedSettlementError('invalid_input', 'Enter an amount greater than zero.');
    }

    const { data, error } = await supabase.rpc('commit_settlement_operation', {
        p_payment_intent_id: request.paymentIntentId,
        p_friend_id: request.friendId,
        p_group_id: request.groupId ?? null,
        p_mode: request.mode ?? 'all_balances',
        p_amount: request.amount,
        p_currency: request.currency,
        p_date: new Date(request.date).toISOString(),
        p_expected_balance: request.expectedBalance,
        p_allocations: request.allocations,
        p_cancellations: request.cancellations ?? [],
      });

    if (error) {
      console.error('[Settlement][commit] RPC failed', {
        rpc: 'commit_settlement_operation',
        paymentIntentSuffix: request.paymentIntentId.slice(-8),
        friendId: request.friendId,
        amount: request.amount,
        currency: request.currency,
        mode: request.mode ?? 'all_balances',
        groupId: request.groupId ?? null,
        expectedBalance: request.expectedBalance,
        allocationCount: request.allocations.length,
        cancellationCount: request.cancellations?.length ?? 0,
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

  async getById(id: string): Promise<Settlement | null> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return mapSettlementRow(data, { preserveNullGroupId: true });
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

    return mapSettlementRow(data, { preserveNullGroupId: true });
  },

  async getUserSettlements(userId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => mapSettlementRow(row));
  },

  async getByGroup(groupId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('date', { ascending: false });

    if (error) throw error;

    return (data || []).map(r => mapSettlementRow(r, { preserveNullGroupId: true }));
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

    return (data || []).map(row => mapSettlementRow(row));
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
    cancellations?: unknown;
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
    cancellations: Array.isArray(receipt.cancellations)
      ? receipt.cancellations.map(mapSettlementCancellation)
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

function mapSettlementCancellation(value: unknown): SettlementCancellation {
  if (!value || typeof value !== 'object') {
    throw new Error('Settlement operation returned an invalid cancellation.');
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || typeof row.operationId !== 'string'
    || typeof row.groupId !== 'string'
    || typeof row.amount !== 'number'
    || typeof row.currency !== 'string'
    || typeof row.createdAt !== 'string'
  ) {
    throw new Error('Settlement operation returned an invalid cancellation.');
  }

  return {
    id: row.id,
    operationId: row.operationId,
    groupId: row.groupId,
    amount: row.amount,
    signedGroupBalanceDelta: typeof row.signedGroupBalanceDelta === 'number'
      ? row.signedGroupBalanceDelta
      : (row.isReversal === true ? -row.amount : row.amount),
    currency: row.currency,
    note: typeof row.note === 'string' ? row.note : undefined,
    // Optional semantics: only a literal `true` on the wire sets the flag;
    // absent/false collapses to `undefined` (matches SettlementCancellation).
    isReversal: row.isReversal === true ? true : undefined,
    // Wire `createdAt` arrives as a timestamptz string; the domain type uses epoch millis.
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
