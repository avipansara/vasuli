import type {
  FriendActivityItem,
  FriendSettlementDirection,
  FriendSettlementOperationItem,
} from './friend-detail-service';
import {
  projectSettlementOperations,
  type SettlementOperationProjection,
  type SettlementOperationStatusRecord,
} from './settlement-operation-projection';
import type { Settlement, SettlementCancellation, SettlementScopeTransfer } from '@/types/database';

export type { FriendSettlementOperationItem };

export type FriendOperationDisplayKind = 'payment' | 'clearing';

export type FriendSettlementOperationViewInput = {
  activity: FriendActivityItem[];
  scopeTransfers?: SettlementScopeTransfer[];
  /** Committed balance cancellations for these operations (dedicated surface, Task 8). */
  cancellations?: SettlementCancellation[];
  operations?: SettlementOperationStatusRecord[];
  currentUserId: string;
  friendId: string;
  /**
   * Scope display names keyed by group ID. Cancellation rows carry no
   * activity item, so cleared scopes are named through this map (built from
   * the relationship group balances by the caller) merged under
   * activity-derived names.
   */
  groupNames?: Record<string, string>;
};

/**
 * Whether the operation reads as a payment or as a balance clearing.
 *
 * Authoritative zero-payment operations are clearings; anything with known
 * cash (visible allocations or operation metadata) is a payment. A
 * transfers-only operation without metadata is also a clearing: the Friend
 * detail read returns every pair-relevant settlement with no pagination, so
 * absent cash rows mean no payment was made rather than an off-page payment.
 * Paginated consumers must consult `cashUnknown` on the projection instead of
 * this helper. Cash amounts are never invented by adding adjustments.
 */
export function getFriendOperationDisplayKind(projection: SettlementOperationProjection): FriendOperationDisplayKind {
  if (projection.isZeroPayment) return 'clearing';
  if (
    projection.hasKnownPayment
    || (projection.authoritativeCashTotal ?? 0) > 0
    || projection.originalCashAmount > 0
  ) {
    return 'payment';
  }
  return 'clearing';
}

/** Displayable cash total: visible allocations first, authoritative metadata when rows are off-page. Never $0 for payments. */
export function getFriendOperationCashAmount(projection: SettlementOperationProjection): number {
  return projection.authoritativeCashTotal ?? projection.originalCashAmount;
}

function directionForCashPayment(
  fromUserId: string | undefined,
  currentUserId: string,
): FriendSettlementDirection | undefined {
  if (!fromUserId) return undefined;
  return fromUserId === currentUserId ? 'you_paid_friend' : 'friend_paid_you';
}

function settlementRowForActivityItem(
  item: Extract<FriendActivityItem, { type: 'settlement' }>,
  currentUserId: string,
  friendId: string,
): Settlement {
  return {
    id: item.settlementId,
    ...(item.operationId ? { operationId: item.operationId } : {}),
    ...(item.backfilledTransferId ? { backfilledTransferId: item.backfilledTransferId } : {}),
    ...(item.groupId ? { groupId: item.groupId } : {}),
    fromUserId: item.direction === 'you_paid_friend' ? currentUserId : friendId,
    toUserId: item.direction === 'you_paid_friend' ? friendId : currentUserId,
    amount: item.amount,
    currency: item.currency,
    date: item.date,
    ...(item.notes ? { notes: item.notes } : {}),
    createdAt: item.createdAt ?? item.date,
  };
}

function transferRowForActivityItem(
  item: Extract<FriendActivityItem, { type: 'scope_transfer' }>,
): SettlementScopeTransfer {
  return {
    id: item.transferId,
    operationId: item.operationId,
    groupId: item.groupId,
    fromUserId: item.fromUserId,
    toUserId: item.toUserId,
    currency: item.currency,
    signedGroupBalanceDelta: item.direction === 'you_paid_friend' ? item.amount : -item.amount,
    ...(item.notes ? { note: item.notes } : {}),
    ...(item.isReversal !== undefined ? { isReversal: item.isReversal } : {}),
    createdAt: item.date,
  };
}

/**
 * Synthesize `reversed` operation records from explicit reversal links only.
 *
 * The Friend reads expose compensating rows (paired original + `is_reversal`
 * transfers, mirrored cash pairs) but no authoritative operation status yet.
 * A lone `is_reversal` row is never enough; deletion requires a paired
 * original plus its compensating row for the same operation. Explicit caller
 * metadata always wins. Rendered text and notes are never inspected.
 * Cancellation rows split the same way: a paired original plus compensating
 * cancellation marks the operation deleted.
 */
function synthesizeReversedOperations(
  settlements: Settlement[],
  transfers: SettlementScopeTransfer[],
  cancellations: SettlementCancellation[],
  explicit: Map<string, SettlementOperationStatusRecord>,
): SettlementOperationStatusRecord[] {
  const operationIds = new Set<string>([
    ...settlements.map(row => row.operationId).filter((value): value is string => Boolean(value)),
    ...transfers.map(row => row.operationId),
    ...cancellations.map(row => row.operationId),
  ]);
  const synthesized: SettlementOperationStatusRecord[] = [];

  for (const operationId of operationIds) {
    if (explicit.has(operationId)) continue;
    const operationTransfers = transfers.filter(row => row.operationId === operationId);
    const originalTransfers = operationTransfers.filter(row => row.isReversal !== true);
    const reversalTransfers = operationTransfers.filter(row => row.isReversal === true);
    if (originalTransfers.length > 0 && reversalTransfers.length > 0) {
      const reversedAt = Math.max(...reversalTransfers.map(row => row.createdAt));
      const first = [...originalTransfers].sort((a, b) => a.createdAt - b.createdAt)[0];
      synthesized.push({
        operationId,
        status: 'reversed',
        createdAt: Math.min(
          ...originalTransfers.map(row => row.createdAt),
          ...settlements.filter(row => row.operationId === operationId).map(row => row.createdAt),
        ),
        reversedAt,
        currency: first.currency,
      });
      continue;
    }

    const operationCancellations = cancellations.filter(row => row.operationId === operationId);
    const originalCancellations = operationCancellations.filter(row => row.isReversal !== true);
    const reversalCancellations = operationCancellations.filter(row => row.isReversal === true);
    if (originalCancellations.length > 0 && reversalCancellations.length > 0) {
      const reversedAt = Math.max(...reversalCancellations.map(row => row.createdAt));
      const first = [...originalCancellations].sort((a, b) => a.createdAt - b.createdAt)[0];
      synthesized.push({
        operationId,
        status: 'reversed',
        createdAt: Math.min(
          ...originalCancellations.map(row => row.createdAt),
          ...settlements.filter(row => row.operationId === operationId).map(row => row.createdAt),
        ),
        reversedAt,
        currency: first.currency,
      });
      continue;
    }

    const operationSettlements = settlements.filter(row => row.operationId === operationId);
    if (operationTransfers.length === 0 && hasMirroredCashPair(operationSettlements)) {
      const timestamps = operationSettlements.map(row => row.createdAt);
      synthesized.push({
        operationId,
        status: 'reversed',
        createdAt: Math.min(...timestamps),
        reversedAt: Math.max(...timestamps),
        currency: operationSettlements[0].currency,
      });
    }
  }

  return synthesized;
}

/** Two cash rows for one operation with swapped participants and equal group/amount/currency imply compensation. */
function hasMirroredCashPair(rows: Settlement[]): boolean {
  for (let index = 0; index < rows.length; index += 1) {
    for (let other = index + 1; other < rows.length; other += 1) {
      const left = rows[index];
      const right = rows[other];
      if (
        (left.groupId ?? '') === (right.groupId ?? '')
        && left.currency === right.currency
        && left.amount === right.amount
        && left.fromUserId === right.toUserId
        && left.toUserId === right.fromUserId
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Replace per-record settlement/scope-transfer rows with one
 * `settlement_operation` activity per operation (ADR-0001). Legacy cash rows
 * without an operation ID and every non-settlement item pass through
 * untouched with their existing presentation and keys.
 *
 * ADR-0004 ticket 05: backfill converts transfer history into plain
 * per-scope payments, so grouping stays a plain-payment fold — one activity
 * per operation with original cash leading. Transfer rows that remain are
 * never rendered alone; every operation deletes through the single shared
 * Delete flow.
 */
export function buildFriendSettlementOperationActivity(input: FriendSettlementOperationViewInput): FriendActivityItem[] {
  const { activity, currentUserId, friendId } = input;

  const settlements: Settlement[] = [];
  const transfersById = new Map<string, SettlementScopeTransfer>();
  const groupNames: Record<string, string> = {};
  const passthrough: FriendActivityItem[] = [];

  for (const item of activity) {
    if (item.type === 'settlement') {
      if (!item.operationId) {
        passthrough.push(item);
        continue;
      }
      settlements.push(settlementRowForActivityItem(item, currentUserId, friendId));
      if (item.groupId && item.groupName) groupNames[item.groupId] = item.groupName;
      continue;
    }
    if (item.type === 'scope_transfer') {
      const row = transferRowForActivityItem(item);
      if (!transfersById.has(row.id)) transfersById.set(row.id, row);
      if (item.groupName) groupNames[item.groupId] = item.groupName;
      continue;
    }
    passthrough.push(item);
  }

  for (const row of input.scopeTransfers ?? []) {
    if (!transfersById.has(row.id)) transfersById.set(row.id, row);
  }
  const transfers = [...transfersById.values()];
  const cancellations = [...(input.cancellations ?? [])];

  const explicit = new Map<string, SettlementOperationStatusRecord>();
  for (const record of input.operations ?? []) {
    explicit.set(record.operationId, record);
  }

  const { operations, legacySettlements } = projectSettlementOperations({
    settlements,
    transfers,
    cancellations,
    operations: [...explicit.values(), ...synthesizeReversedOperations(settlements, transfers, cancellations, explicit)],
  });

  // The projection only sees rows with an operation ID, so legacy output
  // should always be empty; keep the guard for contract safety.
  void legacySettlements;

  const operationItems: FriendActivityItem[] = operations.map((projection): FriendSettlementOperationItem => {
    const names: Record<string, string> = {};
    for (const row of [...projection.allocations, ...projection.adjustments]) {
      const name = groupNames[row.groupId ?? ''];
      if (row.groupId && name) names[row.groupId] = name;
    }
    // Cleared scopes carry no activity row, so they resolve through the
    // caller-supplied map; activity-derived names win on conflict.
    for (const row of [...projection.cancellations, ...projection.reversalCancellations]) {
      if (row.groupId && !names[row.groupId]) {
        const name = input.groupNames?.[row.groupId] ?? groupNames[row.groupId];
        if (name) names[row.groupId] = name;
      }
    }
    return {
      id: `operation:${projection.operationId}`,
      type: 'settlement_operation',
      date: projection.originalDate,
      operationId: projection.operationId,
      direction: directionForCashPayment(projection.fromUserId, currentUserId),
      projection,
      ...(Object.keys(names).length > 0 ? { groupNames: names } : {}),
    };
  });

  return [...passthrough, ...operationItems].sort((a, b) => b.date - a.date);
}
