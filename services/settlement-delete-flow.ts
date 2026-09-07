import { friendDetailModule } from './friend-detail-module';
import type { FriendDetailData } from './friend-detail-service';
import { getFriendRelationshipInvalidationKeys } from './friend-relationship-invalidation';
import {
  buildFriendSettlementOperationActivity,
  getFriendOperationCashAmount,
  getFriendOperationDisplayKind,
} from './friend-settlement-operation-view';
import { queryKeys } from './query-keys';
import {
  CombinedSettlementError,
  settlementModule,
  type SettlementOperationReversal,
} from './settlement-service';
import { formatCurrency } from '@/utils/currency';

// ADR-0001 presentation clarification, ticket 04: one shared whole-operation
// Delete confirmation/results flow for Friend, Group payment, group adjustment
// summary, and zero-payment entries. Copy here is the single source of truth
// so both routes cannot drift; the mutation boundary stays
// settlementModule.reverse (reverse_settlement_operation) with the operation ID
// plus the current expected relationship balance.

export type SettlementDeleteKind = 'payment' | 'clearing';

export type SettlementDeleteCopy = {
  title: string;
  body: string;
};

const NEUTRAL_FRIEND_NAME = 'your friend';

function resolveFriendName(friendName?: string): string {
  const trimmed = friendName?.trim();
  return trimmed ? trimmed : NEUTRAL_FRIEND_NAME;
}

export function getSettlementDeleteConfirmationCopy(params: {
  kind: SettlementDeleteKind;
  paymentAmountText?: string;
  friendName?: string;
  /**
   * Cleared balances undone by this Delete (dedicated cancellation surface).
   * When present, the confirmation names every affected balance so neither
   * entry point surprises the confirmer with out-of-scope changes.
   */
  clearedBalances?: { groupName: string; amountText: string }[];
}): SettlementDeleteCopy {
  const friend = resolveFriendName(params.friendName);
  const cleared = (params.clearedBalances ?? []).filter(entry => entry.groupName.trim() && entry.amountText.trim());
  const clearedSentence = cleared.length === 0
    ? ''
    : ` Cleared balances will be restored: ${cleared.map(entry => `${entry.groupName} (${entry.amountText})`).join(', ')}.`;
  if (params.kind === 'clearing') {
    return {
      title: 'Delete balance clearing?',
      body: `Undo the balance clearing with ${friend}? No payment was made. `
        + 'This also undoes linked balance adjustments, including in other groups. '
        + `Only the changes from this settlement will be undone. History will remain visible.${clearedSentence}`,
    };
  }
  return {
    title: 'Delete settlement?',
    body: `Delete the ${params.paymentAmountText} payment between you and ${friend}? `
      + 'This also undoes any linked balance adjustments, including in other groups. '
      + `Only the changes from this settlement will be undone. History will remain visible.${clearedSentence}`,
  };
}

export function getSettlementDeleteSuccessCopy(kind: SettlementDeleteKind): SettlementDeleteCopy {
  return {
    title: kind === 'clearing' ? 'Balance clearing deleted' : 'Settlement deleted',
    body: 'The changes from this settlement were undone.',
  };
}

export const SETTLEMENT_ALREADY_DELETED_COPY: SettlementDeleteCopy = {
  title: 'Already deleted',
  body: 'This settlement was already deleted.',
};

export const SETTLEMENT_DELETE_LOAD_ERROR_COPY: SettlementDeleteCopy = {
  title: 'Unable to load settlement',
  body: 'The settlement details could not be loaded. Check your connection and try again.',
};

export const SETTLEMENT_DELETE_STALE_COPY: SettlementDeleteCopy = {
  title: 'Balance changed',
  body: 'Refresh and try again.',
};

export const SETTLEMENT_DELETE_STALE_FINAL_COPY: SettlementDeleteCopy = {
  title: 'Unable to delete',
  body: 'This settlement cannot be deleted with the current balances.',
};

export const SETTLEMENT_DELETE_PERMISSION_COPY: SettlementDeleteCopy = {
  title: 'Unable to delete',
  body: 'Only the people in this settlement can delete it.',
};

export const SETTLEMENT_DELETE_OFFLINE_COPY: SettlementDeleteCopy = {
  title: 'Unable to delete',
  body: "You're offline. Check your connection and try again.",
};

export const SETTLEMENT_DELETE_UNEXPECTED_COPY: SettlementDeleteCopy = {
  title: 'Unable to delete',
  body: 'The settlement could not be deleted. Please try again.',
};

export const SETTLEMENT_DELETE_CONFLICT_COPY: SettlementDeleteCopy = {
  title: 'Unable to delete',
  body: 'This settlement can no longer be deleted.',
};

export function getPostDeleteRefreshFailureCopy(kind: SettlementDeleteKind): SettlementDeleteCopy {
  const success = getSettlementDeleteSuccessCopy(kind);
  return {
    title: success.title,
    body: kind === 'clearing'
      ? 'The balance clearing was deleted, but the activity could not be refreshed. Pull to refresh to see the update.'
      : 'The settlement was deleted, but the activity could not be refreshed. Pull to refresh to see the update.',
  };
}

export type SettlementDeleteErrorKind =
  | 'stale_refresh'
  | 'stale_final'
  | 'permission'
  | 'offline'
  | 'unexpected'
  | 'conflict'
  | 'already_deleted';

export type SettlementDeleteErrorOutcome = SettlementDeleteCopy & {
  kind: SettlementDeleteErrorKind;
  retryable: boolean;
};

const OFFLINE_PATTERN = /\boffline\b|network request failed|failed to fetch|fetch failed|network error|timed out|timeout|econnrefused|enotfound|eai_again/i;

function isOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return OFFLINE_PATTERN.test(message);
}

/**
 * Map a reverse failure to user-facing Delete wording. Never passes through
 * internal reversal/ledger terminology. `staleAttempt` counts completed
 * refresh-then-retry cycles for this operation: the first stale rejection
 * offers refresh with a required new confirmation, a second rejection ends
 * the loop without auto-retry.
 */
export function classifySettlementDeleteError(error: unknown, staleAttempt = 0): SettlementDeleteErrorOutcome {
  if (error instanceof CombinedSettlementError) {
    if (error.code === 'stale_balance') {
      if (staleAttempt >= 1) {
        return { kind: 'stale_final', ...SETTLEMENT_DELETE_STALE_FINAL_COPY, retryable: false };
      }
      return { kind: 'stale_refresh', ...SETTLEMENT_DELETE_STALE_COPY, retryable: true };
    }
    if (error.code === 'unauthorized') {
      return { kind: 'permission', ...SETTLEMENT_DELETE_PERMISSION_COPY, retryable: false };
    }
    if (error.code === 'invalid_input' && error.message === 'This settlement operation no longer exists.') {
      return { kind: 'already_deleted', ...SETTLEMENT_ALREADY_DELETED_COPY, retryable: false };
    }
    if (error.code === 'conflict') {
      return { kind: 'conflict', ...SETTLEMENT_DELETE_CONFLICT_COPY, retryable: false };
    }
    if (isOfflineError(error)) {
      return { kind: 'offline', ...SETTLEMENT_DELETE_OFFLINE_COPY, retryable: true };
    }
    return { kind: 'unexpected', ...SETTLEMENT_DELETE_UNEXPECTED_COPY, retryable: true };
  }

  if (isOfflineError(error)) {
    return { kind: 'offline', ...SETTLEMENT_DELETE_OFFLINE_COPY, retryable: true };
  }
  return { kind: 'unexpected', ...SETTLEMENT_DELETE_UNEXPECTED_COPY, retryable: true };
}

export class SettlementDeleteLoadError extends Error {
  readonly retryable = true;
  constructor(message = SETTLEMENT_DELETE_LOAD_ERROR_COPY.body) {
    super(message);
    this.name = 'SettlementDeleteLoadError';
  }
}

export class SettlementAlreadyDeletedError extends Error {
  constructor(message = SETTLEMENT_ALREADY_DELETED_COPY.body) {
    super(message);
    this.name = 'SettlementAlreadyDeletedError';
  }
}

export type SettlementDeleteClearedBalance = {
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
  amountText: string;
};

export type SettlementDeleteConfirmationDetails = {
  operationId: string;
  kind: SettlementDeleteKind;
  /** Original operation cash only — never a clicked adjustment or current balance. */
  paymentAmount: number;
  currency: string;
  paymentAmountText: string;
  friendDisplayName: string;
  expectedBalance: number;
  friendId: string;
  /** Original (non-reversal) cancellations undone by this Delete, named for confirmation copy. */
  clearedBalances: SettlementDeleteClearedBalance[];
};

type SettlementDeleteDetailReader = {
  getDetail(currentUserId: string, friendId: string): Promise<FriendDetailData | null>;
};
export type { SettlementDeleteDetailReader };

const defaultDetailReader: SettlementDeleteDetailReader = {
  getDetail: (currentUserId, friendId) => friendDetailModule.getDetail(currentUserId, friendId),
};

/**
 * Load authorized operation details before enabling confirmation. Reads
 * through the existing participant-authorized Friend detail (never the
 * group-local view, which must not leak another scope's cash to
 * non-participants), derives the confirmation amount from the original
 * operation cash only, and throws a retryable error instead of guessing when
 * the read is unloadable or the operation is missing.
 */
export async function loadSettlementDeleteConfirmationDetails(params: {
  operationId: string;
  currency: string;
  friendId: string;
  currentUserId: string;
  friendName?: string;
  getDetail?: SettlementDeleteDetailReader['getDetail'];
}): Promise<SettlementDeleteConfirmationDetails> {
  const getDetail = params.getDetail ?? defaultDetailReader.getDetail;

  let detail: FriendDetailData | null;
  try {
    detail = await getDetail(params.currentUserId, params.friendId);
  } catch {
    throw new SettlementDeleteLoadError();
  }
  if (!detail) throw new SettlementDeleteLoadError();

  const activity = buildFriendSettlementOperationActivity({
    activity: detail.relationship.activity ?? detail.activity,
    scopeTransfers: detail.scopeTransfers,
    cancellations: detail.cancellations,
    operations: detail.settlementOperations,
    currentUserId: params.currentUserId,
    friendId: params.friendId,
  });
  const item = activity.find(candidate => candidate.type === 'settlement_operation' && candidate.operationId === params.operationId);
  if (!item || item.type !== 'settlement_operation') throw new SettlementDeleteLoadError();
  if (item.projection.isDeleted) throw new SettlementAlreadyDeletedError();

  const kind: SettlementDeleteKind = getFriendOperationDisplayKind(item.projection) === 'clearing'
    ? 'clearing'
    : 'payment';
  const currency = item.projection.currency ?? params.currency;
  const paymentAmount = kind === 'clearing' ? 0 : getFriendOperationCashAmount(item.projection);
  if (kind === 'payment' && !(paymentAmount > 0)) throw new SettlementDeleteLoadError();

  // Cleared scopes undone by this Delete, named for the confirmation copy.
  // Names resolve through the operation item first, then the relationship
  // group balances; unknown scopes keep the shared-group fallback so the
  // confirmation never drops an affected balance silently.
  const groupNames = new Map(
    [...(detail.groupBalances ?? []), ...detail.relationship.groupBalances].map(summary => [summary.groupId, summary.groupName] as const),
  );
  const clearedBalances: SettlementDeleteClearedBalance[] = item.projection.cancellations.map(cancellation => {
    const groupName = item.groupNames?.[cancellation.groupId]
      ?? groupNames.get(cancellation.groupId)
      ?? 'Shared group';
    return {
      groupId: cancellation.groupId,
      groupName,
      amount: cancellation.amount,
      currency: cancellation.currency,
      amountText: formatCurrency(cancellation.amount, cancellation.currency),
    };
  });

  const expectedBalance = detail.relationship.totalsByCurrency
    .find(total => total.currency === currency)?.amount ?? 0;

  return {
    operationId: params.operationId,
    kind,
    paymentAmount,
    currency,
    paymentAmountText: formatCurrency(paymentAmount, currency),
    friendDisplayName: resolveFriendName(params.friendName),
    expectedBalance,
    friendId: params.friendId,
    clearedBalances,
  };
}

export function buildSettlementDeleteInvalidationKeys(params: {
  currentUserId: string;
  friendId: string;
  groupId?: string;
}): readonly (readonly unknown[])[] {
  return [
    ...getFriendRelationshipInvalidationKeys(params.currentUserId, params.friendId),
    queryKeys.groups.list(params.currentUserId),
    queryKeys.activity.list(params.currentUserId),
    ...(params.groupId
      ? [
        queryKeys.groups.detail(params.currentUserId, params.groupId),
        queryKeys.groups.pairTotals(params.currentUserId, params.groupId),
      ]
      : []),
    // Prefix keys keep every Group detail and pair-total surface in agreement
    // after a whole-operation delete, including groups affected outside the
    // entry screen. Inactive queries are only marked stale and refetch on
    // next visit, alongside the existing realtime and focus refetch seams.
    ['groups', 'detail', params.currentUserId],
    ['groups', 'pair-totals', params.currentUserId],
  ];
}

type SettlementDeleteQueryClient = Parameters<typeof settlementModule.reverse>[0]['queryClient'];
export type { SettlementDeleteQueryClient };
type SettlementDeleteReverse = (params: {
  operationId: string;
  expectedBalance: number;
  currentUserId: string;
  friendId: string;
  queryClient: SettlementDeleteQueryClient;
}) => Promise<SettlementOperationReversal>;
export type { SettlementDeleteReverse };

/**
 * Delete one settlement operation through the existing mutation boundary:
 * settlementModule.reverse (reverse_settlement_operation) with the operation
 * ID plus the current expected relationship balance. No new RPC and no
 * contract change. Reused receipts pass through for Already deleted handling;
 * failures propagate without cache invalidation so the entry stays and the
 * caller can classify retryable outcomes.
 */
export async function executeSettlementDelete(params: {
  operationId: string;
  expectedBalance: number;
  currentUserId: string;
  friendId: string;
  groupId?: string;
  reverse?: SettlementDeleteReverse;
  queryClient: SettlementDeleteQueryClient;
}): Promise<SettlementOperationReversal> {
  const reverse = params.reverse ?? settlementModule.reverse;
  const receipt = await reverse({
    operationId: params.operationId,
    expectedBalance: params.expectedBalance,
    currentUserId: params.currentUserId,
    friendId: params.friendId,
    queryClient: params.queryClient,
  });

  try {
    const keys = buildSettlementDeleteInvalidationKeys({
      currentUserId: params.currentUserId,
      friendId: params.friendId,
      ...(params.groupId ? { groupId: params.groupId } : {}),
    });
    await Promise.all(keys.map(queryKey => params.queryClient.invalidateQueries({ queryKey })));
  } catch (error) {
    // A successful deletion followed by a refresh failure remains successful.
    console.warn('Settlement delete cache invalidation failed after reversal:', error);
  }

  return receipt;
}
