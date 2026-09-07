import type { Settlement, SettlementCancellation, SettlementScopeTransfer } from '@/types/database';

// ADR-0001: one settlement operation (an all-balances or group commit) may
// create zero or more non-cash scope transfers plus zero or one actual cash
// payment. Presentation groups those records into one activity per operation;
// the records themselves remain the accounting source of truth and balance
// projections must keep consuming original plus compensating rows exactly as
// today. This module only projects activities — it never changes balances and
// never calls the settlementModule.reverse mutation boundary.

export type SettlementOperationLifecycleStatus = 'committed' | 'reversed';

/**
 * Authoritative per-operation metadata mirroring the `settlement_operations`
 * row (`status`, `reversed_at`, `requested_payment_amount`). Deleted state
 * comes from this record plus explicit row links (`operation_id`,
 * `is_reversal`, timestamps) — never from rendered text or notes content.
 */
export type SettlementOperationStatusRecord = {
  operationId: string;
  status: SettlementOperationLifecycleStatus;
  createdAt: number;
  reversedAt?: number;
  requestedPaymentAmount?: number;
  currency?: string;
  /** Original cash direction supplied by the authorized operation read. */
  fromUserId?: string;
  toUserId?: string;
  /** Original operation/payment date when the child row is absent or paged out. */
  originalDate?: number;
  /** Group-local cash metadata returned by an authorized Group read. */
  groupId?: string;
  localCashAmount?: number;
  localDate?: number;
  localFromUserId?: string;
  localToUserId?: string;
};

export type SettlementOperationProjection = {
  operationId: string;
  status: SettlementOperationLifecycleStatus;
  /** True when the authoritative operation status is `reversed`. */
  isDeleted: boolean;
  /** Earliest original-record date; retained after deletion. */
  originalDate: number;
  /** Authoritative deletion date, when the operation is reversed. */
  reversedAt?: number;
  currency?: string;
  /** Original cash payer/payee, retained after deletion. */
  fromUserId?: string;
  toUserId?: string;
  /** Sum of original cash allocations only. Reversal and adjustment rows excluded. */
  originalCashAmount: number;
  /** Authoritative cash total from operation metadata, for off-page rows. */
  authoritativeCashTotal?: number;
  groupId?: string;
  localCashAmount?: number;
  localFromUserId?: string;
  localToUserId?: string;
  /** True when original cash rows were seen or metadata records a payment. */
  hasKnownPayment: boolean;
  /** True only when the operation is known to have no payment. Never guessed. */
  isZeroPayment: boolean;
  /** True when no cash rows are visible but a payment cannot be ruled out. */
  cashUnknown: boolean;
  /** Original (non-reversal) cash settlement rows. */
  allocations: Settlement[];
  /** Original (non-reversal) scope transfers. */
  adjustments: SettlementScopeTransfer[];
  /** Original (non-reversal) balance cancellations. */
  cancellations: SettlementCancellation[];
  /** Compensating cash rows folded into deletion history, never new payments. */
  reversalSettlements: Settlement[];
  /** Compensating transfers folded into deletion history. */
  reversalTransfers: SettlementScopeTransfer[];
  /** Compensating cancellations folded into deletion history. */
  reversalCancellations: SettlementCancellation[];
};

export type SettlementOperationProjectionInput = {
  settlements: Settlement[];
  transfers: SettlementScopeTransfer[];
  cancellations?: SettlementCancellation[];
  operations?: SettlementOperationStatusRecord[];
};

export type SettlementOperationProjectionResult = {
  /** One entry per operation ID, newest original date first. */
  operations: SettlementOperationProjection[];
  /** Legacy cash rows without an operation ID; readable, never operation-deleted. */
  legacySettlements: Settlement[];
};

function toFiniteTimestamp(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function rowTimestamp(row: Settlement): number {
  const createdAt = toFiniteTimestamp(row.createdAt, Number.NaN);
  if (Number.isFinite(createdAt)) return createdAt;
  return toFiniteTimestamp(row.date, 0);
}

/**
 * Split cash rows of a reversed operation into original vs compensating
 * records. The `settlements` table carries no `is_reversal` flag, so the
 * split uses explicit links only: row timestamps against the authoritative
 * `reversed_at`, falling back to mirrored-pair matching (same
 * group/currency/amount with swapped participants — exactly what
 * `reverse_settlement_operation` inserts). Notes text is never inspected.
 */
function splitOriginalVsReversalSettlements(
  rows: Settlement[],
  status: SettlementOperationLifecycleStatus,
  reversedAt?: number,
): { original: Settlement[]; reversal: Settlement[] } {
  if (status !== 'reversed' || rows.length === 0) {
    return { original: rows, reversal: [] };
  }

  if (reversedAt !== undefined && Number.isFinite(reversedAt)) {
    const original = rows.filter(row => rowTimestamp(row) < reversedAt);
    const reversal = rows.filter(row => rowTimestamp(row) >= reversedAt);
    if (original.length > 0 && reversal.length > 0) {
      return { original, reversal };
    }
  }

  return splitMirroredPairs(rows);
}

function settlementKey(row: Settlement): string {
  return `${row.groupId ?? ''}|${row.currency}|${row.amount}`;
}

function splitMirroredPairs(rows: Settlement[]): { original: Settlement[]; reversal: Settlement[] } {
  const ordered = [...rows].sort((a, b) => rowTimestamp(a) - rowTimestamp(b) || (a.id < b.id ? -1 : 1));
  const unmatched = new Map<string, Settlement[]>();
  const reversalIds = new Set<string>();

  for (const row of ordered) {
    const key = settlementKey(row);
    const candidates = unmatched.get(key) ?? [];
    // A compensating row swaps payer/payee while keeping group, amount, currency.
    const mirrorIndex = candidates.findIndex(
      candidate => candidate.fromUserId === row.toUserId && candidate.toUserId === row.fromUserId,
    );
    if (mirrorIndex >= 0) {
      candidates.splice(mirrorIndex, 1);
      reversalIds.add(row.id);
    } else {
      candidates.push(row);
      unmatched.set(key, candidates);
    }
  }

  return {
    original: rows.filter(row => !reversalIds.has(row.id)),
    reversal: rows.filter(row => reversalIds.has(row.id)),
  };
}

function sumCash(rows: Settlement[]): number {
  const totalCents = rows.reduce((total, row) => total + Math.round(row.amount * 100), 0);
  return totalCents / 100;
}

function buildProjection(
  operationId: string,
  settlements: Settlement[],
  transfers: SettlementScopeTransfer[],
  cancellations: SettlementCancellation[],
  record: SettlementOperationStatusRecord | undefined,
): SettlementOperationProjection {
  const status = record?.status ?? 'committed';
  const isDeleted = status === 'reversed';
  const reversedAt = record?.reversedAt;

  // Once the authorized operation read supplies lifecycle metadata, its
  // reversal timestamp is the only authoritative boundary. Mirrored-pair
  // inference is retained solely for legacy payloads with no metadata.
  const { original: allocations, reversal: reversalSettlements } = record
    ? (status === 'reversed' && reversedAt !== undefined
      ? {
          original: settlements.filter(row => rowTimestamp(row) < reversedAt),
          reversal: settlements.filter(row => rowTimestamp(row) >= reversedAt),
        }
      : { original: settlements, reversal: [] })
    : splitOriginalVsReversalSettlements(settlements, status, reversedAt);
  // Scope transfers carry an explicit `is_reversal` link. A stray flagged row
  // alone never deletes the operation; status above remains authoritative.
  // Balance cancellations split the same way: originals clear, reversals
  // negate through the balance netting.
  const adjustments = transfers.filter(transfer => transfer.isReversal !== true);
  const reversalTransfers = transfers.filter(transfer => transfer.isReversal === true);
  const operationCancellations = cancellations.filter(cancellation => cancellation.isReversal !== true);
  const reversalCancellations = cancellations.filter(cancellation => cancellation.isReversal === true);

  // Backfill rows mirror historical scope transfers for balance compatibility;
  // they are never new cash and must not create a second payment activity.
  const cashAllocations = allocations.filter(row => !row.backfilledTransferId);
  const originalCashAmount = sumCash(cashAllocations);
  const requestedPaymentAmount = record?.requestedPaymentAmount;
  const authoritativeCashTotal = typeof requestedPaymentAmount === 'number' && Number.isFinite(requestedPaymentAmount)
    ? requestedPaymentAmount
    : undefined;
  const hasKnownPayment = cashAllocations.length > 0 || (authoritativeCashTotal ?? 0) > 0;
  // Never derive zero-payment from missing/off-page rows: only an explicit
  // zero in operation metadata (with no visible cash) proves a clearing.
  const isZeroPayment = cashAllocations.length === 0 && authoritativeCashTotal === 0;
  const cashUnknown = cashAllocations.length === 0
    && !isZeroPayment
    && (record
      ? (authoritativeCashTotal === undefined ? transfers.length > 0 || cancellations.length > 0 : authoritativeCashTotal > 0)
      : transfers.length > 0 || cancellations.length > 0);

  const firstCash = [...cashAllocations].sort((a, b) => rowTimestamp(a) - rowTimestamp(b))[0];
  const firstTransfer = [...adjustments].sort((a, b) => a.createdAt - b.createdAt)[0];
  const firstCancellation = [...operationCancellations].sort((a, b) => a.createdAt - b.createdAt)[0];
  const currency = firstCash?.currency ?? firstTransfer?.currency ?? firstCancellation?.currency ?? record?.currency;
  const originalDates = [
    ...allocations.map(row => row.date),
    ...adjustments.map(transfer => transfer.createdAt),
    ...operationCancellations.map(cancellation => cancellation.createdAt),
  ].filter(value => Number.isFinite(value));
  const originalDate = record?.originalDate !== undefined
    ? record.originalDate
    : originalDates.length > 0
      ? Math.min(...originalDates)
      : toFiniteTimestamp(record?.localDate ?? record?.createdAt, 0);

  return {
    operationId,
    status,
    isDeleted,
    originalDate,
    ...(reversedAt !== undefined ? { reversedAt } : {}),
    ...(currency !== undefined ? { currency } : {}),
    ...(record?.groupId ? { groupId: record.groupId } : {}),
    ...(record?.localCashAmount !== undefined ? { localCashAmount: record.localCashAmount } : {}),
    ...(record?.localFromUserId ? { localFromUserId: record.localFromUserId } : {}),
    ...(record?.localToUserId ? { localToUserId: record.localToUserId } : {}),
    ...(firstCash
      ? { fromUserId: firstCash.fromUserId, toUserId: firstCash.toUserId }
      : record?.localFromUserId && record.localToUserId
        ? { fromUserId: record.localFromUserId, toUserId: record.localToUserId }
        : record?.fromUserId && record.toUserId
          ? { fromUserId: record.fromUserId, toUserId: record.toUserId }
        : {}),
    originalCashAmount,
    ...(authoritativeCashTotal !== undefined ? { authoritativeCashTotal } : {}),
    hasKnownPayment,
    isZeroPayment,
    cashUnknown,
    // Retain marked rows for scope identity and legacy reversal compatibility;
    // all cash calculations use cashAllocations above.
    allocations,
    adjustments,
    cancellations: operationCancellations,
    reversalSettlements,
    reversalTransfers,
    reversalCancellations,
  };
}

/**
 * Group settlement and scope-transfer rows by stable operation identity.
 * Grouping keys on `operation_id` only — never names, dates, or amounts — so
 * distinct equal-amount operations stay distinct. Operations whose payment
 * rows are missing (off-page) keep `cashUnknown` instead of reading as
 * zero-payment. Legacy rows without an operation ID pass through untouched.
 */
export function projectSettlementOperations(input: SettlementOperationProjectionInput): SettlementOperationProjectionResult {
  const recordsByOperationId = new Map<string, SettlementOperationStatusRecord>();
  for (const record of input.operations ?? []) {
    recordsByOperationId.set(record.operationId, record);
  }

  const settlementsByOperation = new Map<string, Settlement[]>();
  const legacySettlements: Settlement[] = [];
  for (const row of input.settlements) {
    if (!row.operationId) {
      legacySettlements.push(row);
      continue;
    }
    const group = settlementsByOperation.get(row.operationId) ?? [];
    group.push(row);
    settlementsByOperation.set(row.operationId, group);
  }

  const transfersByOperation = new Map<string, SettlementScopeTransfer[]>();
  for (const row of input.transfers) {
    const group = transfersByOperation.get(row.operationId) ?? [];
    group.push(row);
    transfersByOperation.set(row.operationId, group);
  }

  const cancellationsByOperation = new Map<string, SettlementCancellation[]>();
  for (const row of input.cancellations ?? []) {
    const group = cancellationsByOperation.get(row.operationId) ?? [];
    group.push(row);
    cancellationsByOperation.set(row.operationId, group);
  }

  const operationIds = new Set<string>([
    ...settlementsByOperation.keys(),
    ...transfersByOperation.keys(),
    ...cancellationsByOperation.keys(),
    ...recordsByOperationId.keys(),
  ]);

  const operations = [...operationIds]
    .map(operationId => buildProjection(
      operationId,
      settlementsByOperation.get(operationId) ?? [],
      transfersByOperation.get(operationId) ?? [],
      cancellationsByOperation.get(operationId) ?? [],
      recordsByOperationId.get(operationId),
    ))
    .sort((a, b) => b.originalDate - a.originalDate);

  return { operations, legacySettlements };
}

/** Cash from this operation recorded in the given group (original rows only). */
export function getGroupLocalCashAmount(projection: SettlementOperationProjection, groupId: string): number {
  const visible = sumCash(projection.allocations.filter(row => row.groupId === groupId && !row.backfilledTransferId));
  return visible > 0 || projection.groupId !== groupId ? visible : projection.localCashAmount ?? 0;
}

/** Original adjustments affecting the given group. */
export function getGroupLocalTransfers(
  projection: SettlementOperationProjection,
  groupId: string,
): SettlementScopeTransfer[] {
  return projection.adjustments.filter(transfer => transfer.groupId === groupId);
}

/** Original cancellations clearing the given group. */
export function getGroupLocalCancellations(
  projection: SettlementOperationProjection,
  groupId: string,
): SettlementCancellation[] {
  return projection.cancellations.filter(cancellation => cancellation.groupId === groupId);
}

/** Whether any original cash, adjustment, or cancellation row of the operation touches the group. */
export function operationAffectsGroup(projection: SettlementOperationProjection, groupId: string): boolean {
  return (
    projection.allocations.some(row => row.groupId === groupId)
    || projection.adjustments.some(transfer => transfer.groupId === groupId)
    || projection.cancellations.some(cancellation => cancellation.groupId === groupId)
    || projection.groupId === groupId
  );
}

/**
 * Resolve the settling pair for an operation from the best available client
 * evidence: authoritative operation metadata participants first, then sibling
 * cash rows of the same operation, then sibling scope transfers. Cash
 * payer/payee and transfer participants are always the settling pair, so any
 * hit attributes the operation exactly. Returns `undefined` when nothing
 * identifies the pair (notably cancellation-only operations seen through the
 * group metadata reader, which deliberately strips participants).
 */
export function resolveOperationPair(
  operationId: string,
  sources: {
    operations?: SettlementOperationStatusRecord[];
    settlements?: Settlement[];
    transfers?: SettlementScopeTransfer[];
  },
): readonly [string, string] | undefined {
  const record = sources.operations?.find(entry => entry.operationId === operationId);
  if (record?.fromUserId && record?.toUserId) return [record.fromUserId, record.toUserId];
  const settlement = sources.settlements?.find(row => row.operationId === operationId);
  if (settlement) return [settlement.fromUserId, settlement.toUserId];
  const transfer = sources.transfers?.find(row => row.operationId === operationId);
  if (transfer) return [transfer.fromUserId, transfer.toUserId];
  return undefined;
}
