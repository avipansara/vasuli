import {
  getGroupLocalCashAmount,
  getGroupLocalTransfers,
  operationAffectsGroup,
  projectSettlementOperations,
  synthesizeReversedOperations,
  type SettlementOperationProjection,
  type SettlementOperationStatusRecord,
} from './settlement-operation-projection';
import type { Settlement, SettlementCancellation, SettlementScopeTransfer } from '@/types/database';
import { cancellationPairFromRow } from './group-balance';

// ADR-0001: one settlement operation renders as one Group activity. The Group
// view merges the operation's group-local cash with its group-local balance
// adjustments and never presents another scope's cash as this group's payment.

export type GroupOperationDisplayKind = 'payment' | 'clearing';

export type GroupSettlementOperationViewInput = {
  settlements: Settlement[];
  scopeTransfers: SettlementScopeTransfer[];
  /** Committed balance cancellations affecting this group (dedicated surface, Task 8). */
  cancellations?: SettlementCancellation[];
  operations?: SettlementOperationStatusRecord[];
  groupId: string;
  currentUserId: string;
};

export type GroupSettlementOperationActivityResult = {
  /** One projection per operation affecting this group, newest original date first. */
  operations: SettlementOperationProjection[];
  /** Legacy cash rows without an operation ID; readable, never operation-deleted. */
  legacySettlements: Settlement[];
};

/**
 * Group-local display kind. A payment requires cash recorded in THIS group;
 * anything else affecting the group reads as a clearing. Global operation
 * cash from other scopes is never substituted, so non-participants learn no
 * private payment amount from this entry.
 */
export function getGroupOperationDisplayKind(
  projection: SettlementOperationProjection,
  groupId: string,
): GroupOperationDisplayKind {
  return getGroupLocalCashAmount(projection, groupId) > 0 ? 'payment' : 'clearing';
}

/** Group-local cash recorded in this group (original rows only). */
export function getGroupOperationCashAmount(
  projection: SettlementOperationProjection,
  groupId: string,
): number {
  return getGroupLocalCashAmount(projection, groupId);
}

/**
 * Participants derived from this group's rows first: first local
 * cash, else first local adjustment, else group-local metadata. A
 * cancellation-only operation (the common full-settlement case: direct-scope
 * cash plus a group-scope cancellation) carries no local cash, transfer, or
 * participant metadata by spec design, so the group then resolves through
 * operation membership: the settling pair carried on the group-local
 * cancellation row itself, else the projection's operation-level pair. Both
 * fallbacks require a group-local cancellation row for the operation, so an
 * unrelated group never gains a Delete. Never falls back to another scope's
 * cash rows.
 */
export function getGroupOperationParticipants(
  projection: SettlementOperationProjection,
  groupId: string,
): { fromUserId: string; toUserId: string } | undefined {
  const localCash = projection.allocations
    .filter(row => row.groupId === groupId)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))[0];
  if (localCash) return { fromUserId: localCash.fromUserId, toUserId: localCash.toUserId };
  const localTransfer = getGroupLocalTransfers(projection, groupId)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))[0];
  if (localTransfer) return { fromUserId: localTransfer.fromUserId, toUserId: localTransfer.toUserId };
  if (projection.groupId === groupId && projection.localFromUserId && projection.localToUserId) {
    return { fromUserId: projection.localFromUserId, toUserId: projection.localToUserId };
  }
  // Cancellation rows store no participant pair by spec design; the
  // cancellation read RPCs carry the parent operation's settling pair on
  // each row for exactly this attribution.
  const localCancellations = [...projection.cancellations, ...projection.reversalCancellations]
    .filter(cancellation => cancellation.groupId === groupId)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  for (const cancellation of localCancellations) {
    const pair = cancellationPairFromRow(cancellation);
    if (pair) return { fromUserId: pair[0], toUserId: pair[1] };
  }
  // Last resort, still gated on a group-local cancellation row: operation
  // membership from metadata or sibling rows of the same operation.
  if (localCancellations.length > 0 && projection.fromUserId && projection.toUserId) {
    return { fromUserId: projection.fromUserId, toUserId: projection.toUserId };
  }
  return undefined;
}

/**
 * Either settlement participant may delete the whole operation while it is
 * live. Non-participants see history and deleted status with no destructive
 * action. `isReversal` on a child row alone never deletes; the projection's
 * authoritative status (or paired local reversal rows) decides.
 */
export function canDeleteGroupOperation(
  projection: SettlementOperationProjection,
  groupId: string,
  currentUserId: string,
): boolean {
  if (projection.isDeleted) return false;
  const participants = getGroupOperationParticipants(projection, groupId);
  if (!participants) return false;
  return participants.fromUserId === currentUserId || participants.toUserId === currentUserId;
}

export type GroupSettlementDeleteRequest = {
  operationId: string;
  currency: string;
  friendId: string;
  friendName?: string;
};

/** Resolve an authorized group activity into the shared delete-flow request. */
export function getGroupSettlementDeleteRequest(input: GroupSettlementOperationViewInput & {
  operationId: string;
  namesById?: ReadonlyMap<string, string>;
}): GroupSettlementDeleteRequest | undefined {
  const { operations } = buildGroupSettlementOperationActivity(input);
  const projection = operations.find(item => item.operationId === input.operationId);
  if (!projection || !canDeleteGroupOperation(projection, input.groupId, input.currentUserId)) return undefined;
  const participants = getGroupOperationParticipants(projection, input.groupId);
  if (!participants) return undefined;

  const friendId = participants.fromUserId === input.currentUserId
    ? participants.toUserId
    : participants.fromUserId;
  const memberName = input.namesById?.get(friendId);
  const friendName = memberName && memberName !== 'Unknown' ? memberName : undefined;
  return {
    operationId: input.operationId,
    currency: projection.currency ?? 'USD',
    friendId,
    ...(friendName ? { friendName } : {}),
  };
}



/**
 * Group one settlement activity per operation affecting this group (ADR-0001).
 * Consumes the shared ticket-01 projection; balance math keeps consuming the
 * original plus compensating rows exactly as today. Only group-scoped rows are
 * accepted, so the result exposes group-visible facts only. Receipt
 * cancellations arrive as cleared-balance details: cash is still counted
 * once (group-local cash only) and the cleared scope is named in details.
 *
 * ADR-0004 ticket 05: backfill converts transfer history into plain
 * per-scope payments, so each entry reads as one plain group payment (or a
 * clearing where this group recorded none). Every operation deletes through
 * the single shared Delete flow; legacy rows without an operation ID stay
 * readable with no destructive action.
 */
export function buildGroupSettlementOperationActivity(
  input: GroupSettlementOperationViewInput,
): GroupSettlementOperationActivityResult {
  const explicit = new Map<string, SettlementOperationStatusRecord>();
  for (const record of input.operations ?? []) {
    explicit.set(record.operationId, record);
  }

  const { operations, legacySettlements } = projectSettlementOperations({
    settlements: input.settlements,
    transfers: input.scopeTransfers,
    cancellations: input.cancellations ?? [],
    operations: [...explicit.values(), ...synthesizeReversedOperations(input.settlements, input.scopeTransfers, input.cancellations ?? [], explicit)],
  });

  const groupOperations = operations.filter(projection => operationAffectsGroup(projection, input.groupId));
  const groupLegacy = legacySettlements.filter(row => (row.groupId ?? '') === input.groupId);

  return { operations: groupOperations, legacySettlements: groupLegacy };
}
