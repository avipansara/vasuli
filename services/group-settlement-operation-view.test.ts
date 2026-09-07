import { describe, expect, it } from 'vitest';
import {
  buildGroupSettlementOperationActivity,
  canDeleteGroupOperation,
  getGroupOperationCashAmount,
  getGroupOperationDisplayKind,
  getGroupOperationParticipants,
  getGroupSettlementDeleteRequest,
} from '@/services/group-settlement-operation-view';
import { getGroupLocalCancellations } from '@/services/settlement-operation-projection';
import type { Settlement, SettlementScopeTransfer } from '@/types/database';
import type { SettlementOperationStatusRecord } from '@/services/settlement-operation-projection';

const currentUserId = 'user-you';
const friendId = 'user-avee';
const outsiderId = 'user-outsider';
const groupId = 'group-1';
const otherGroupId = 'group-2';

const t0 = Date.parse('2026-08-20T12:00:00.000Z');
const DAY = 86_400_000;

function settlement(overrides: Partial<Settlement> & { id: string }): Settlement {
  return {
    groupId,
    fromUserId: friendId,
    toUserId: currentUserId,
    amount: 0,
    currency: 'USD',
    date: t0,
    createdAt: t0,
    ...overrides,
  };
}

function transfer(overrides: Partial<SettlementScopeTransfer> & { id: string }): SettlementScopeTransfer {
  return {
    operationId: 'op-1',
    groupId,
    fromUserId: friendId,
    toUserId: currentUserId,
    currency: 'USD',
    signedGroupBalanceDelta: -8,
    isReversal: false,
    createdAt: t0,
    ...overrides,
  };
}

function operation(overrides: Partial<SettlementOperationStatusRecord> & { operationId: string }): SettlementOperationStatusRecord {
  return {
    status: 'committed',
    createdAt: t0,
    ...overrides,
  };
}

describe('buildGroupSettlementOperationActivity', () => {
  it('merges a group payment and its adjustment into one activity with group-local cash', () => {
    const result = buildGroupSettlementOperationActivity({
      settlements: [settlement({ id: 's-pay', operationId: 'op-1', amount: 10 })],
      scopeTransfers: [transfer({ id: 't-1', operationId: 'op-1' })],
      operations: [operation({ operationId: 'op-1', requestedPaymentAmount: 10, currency: 'USD' })],
      groupId,
      currentUserId,
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].operationId).toBe('op-1');
    expect(getGroupOperationDisplayKind(result.operations[0], groupId)).toBe('payment');
    expect(result.legacySettlements).toHaveLength(0);
  });

  it('shows adjustment-only operations as a clearing and never as paid', () => {
    const result = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [transfer({ id: 't-1', operationId: 'op-clear' })],
      operations: [operation({ operationId: 'op-clear', requestedPaymentAmount: 0, currency: 'USD' })],
      groupId,
      currentUserId,
    });

    expect(result.operations).toHaveLength(1);
    expect(getGroupOperationDisplayKind(result.operations[0], groupId)).toBe('clearing');
  });

  it('keeps a backfill-marked local row cash-neutral in Group activity', () => {
    const result = buildGroupSettlementOperationActivity({
      settlements: [settlement({ id: 's-backfill', operationId: 'op-backfill', amount: 12, backfilledTransferId: 't-source' })],
      scopeTransfers: [],
      operations: [operation({ operationId: 'op-backfill', requestedPaymentAmount: 0, currency: 'USD' })],
      groupId,
      currentUserId,
    });

    expect(result.operations).toHaveLength(1);
    expect(getGroupOperationDisplayKind(result.operations[0], groupId)).toBe('clearing');
    expect(getGroupOperationCashAmount(result.operations[0], groupId)).toBe(0);
  });

  it('hides private cross-scope cash from the group-local view', () => {
    // $7 net payment lives outside this group (direct); this group only has the $8 adjustment.
    const result = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [transfer({ id: 't-1', operationId: 'op-net' })],
      operations: [operation({ operationId: 'op-net', requestedPaymentAmount: 7, currency: 'USD' })],
      groupId,
      currentUserId,
    });

    expect(result.operations).toHaveLength(1);
    // Group-local view is a clearing even though the operation has cash elsewhere.
    expect(getGroupOperationDisplayKind(result.operations[0], groupId)).toBe('clearing');
    const participants = getGroupOperationParticipants(result.operations[0], groupId);
    expect([participants?.fromUserId, participants?.toUserId].sort()).toEqual(
      [currentUserId, friendId].sort(),
    );
  });

  it('ignores operations that do not affect this group', () => {
    const result = buildGroupSettlementOperationActivity({
      settlements: [settlement({ id: 's-other', operationId: 'op-other', amount: 5, groupId: otherGroupId })],
      scopeTransfers: [transfer({ id: 't-other', operationId: 'op-other', groupId: otherGroupId })],
      operations: [operation({ operationId: 'op-other', requestedPaymentAmount: 5, currency: 'USD' })],
      groupId,
      currentUserId,
    });

    expect(result.operations).toHaveLength(0);
  });

  it('maps receipt cancellations into group-local cleared-balance details', () => {
    const result = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [],
      cancellations: [
        {
          id: 'c-local',
          operationId: 'op-full',
          groupId,
          amount: 8,
          currency: 'USD',
          createdAt: t0,
        },
        {
          id: 'c-other',
          operationId: 'op-full',
          groupId: otherGroupId,
          amount: 3,
          currency: 'USD',
          createdAt: t0,
        },
      ],
      operations: [operation({ operationId: 'op-full', requestedPaymentAmount: 12, currency: 'USD' })],
      groupId,
      currentUserId,
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].operationId).toBe('op-full');
    // Cash counted once: no cash recorded in this group, so this group reads
    // as a clearing even though the operation paid cash elsewhere.
    expect(getGroupOperationDisplayKind(result.operations[0], groupId)).toBe('clearing');
    expect(getGroupOperationCashAmount(result.operations[0], groupId)).toBe(0);
    // Only this group's cleared scope is exposed here.
    expect(result.operations[0].cancellations.map(row => row.id)).toEqual(['c-local', 'c-other']);
    expect(getGroupLocalCancellations(result.operations[0], groupId).map(row => row.id)).toEqual(['c-local']);
  });

  it('marks a cancellation-only operation deleted from paired local cancellation rows', () => {
    const reversedAt = t0 + DAY;
    const deleted = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [],
      cancellations: [
        {
          id: 'c-orig',
          operationId: 'op-gone',
          groupId,
          amount: 8,
          currency: 'USD',
          createdAt: t0,
        },
        {
          id: 'c-comp',
          operationId: 'op-gone',
          groupId,
          amount: 8,
          currency: 'USD',
          isReversal: true,
          createdAt: reversedAt,
        },
      ],
      groupId,
      currentUserId,
    });
    expect(deleted.operations).toHaveLength(1);
    expect(deleted.operations[0].isDeleted).toBe(true);
    expect(deleted.operations[0].reversalCancellations.map(row => row.id)).toEqual(['c-comp']);
  });

  it('keeps legacy payments without an operation ID readable with no operation activity', () => {
    const legacy = settlement({ id: 's-legacy', amount: 12, operationId: undefined });
    const result = buildGroupSettlementOperationActivity({
      settlements: [legacy],
      scopeTransfers: [],
      groupId,
      currentUserId,
    });

    expect(result.operations).toHaveLength(0);
    expect(result.legacySettlements).toEqual([legacy]);
  });

  it('marks an operation deleted only from paired local reversal rows', () => {
    const reversedAt = t0 + DAY;
    const deleted = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [
        transfer({ id: 't-orig', operationId: 'op-gone', createdAt: t0 }),
        transfer({ id: 't-comp', operationId: 'op-gone', isReversal: true, createdAt: reversedAt }),
      ],
      groupId,
      currentUserId,
    });
    expect(deleted.operations).toHaveLength(1);
    expect(deleted.operations[0].isDeleted).toBe(true);
    expect(deleted.operations[0].reversedAt).toBe(reversedAt);

    const lone = buildGroupSettlementOperationActivity({
      settlements: [settlement({ id: 's-1', operationId: 'op-lone', amount: 9 })],
      scopeTransfers: [
        transfer({ id: 't-stray', operationId: 'op-lone', isReversal: true, createdAt: reversedAt }),
      ],
      groupId,
      currentUserId,
    });
    expect(lone.operations[0].isDeleted).toBe(false);
  });

  it('preserves distinct equal-amount operations newest first', () => {
    const result = buildGroupSettlementOperationActivity({
      settlements: [
        settlement({ id: 's-a', operationId: 'op-a', amount: 10, date: t0, createdAt: t0 }),
        settlement({ id: 's-b', operationId: 'op-b', amount: 10, date: t0 + DAY, createdAt: t0 + DAY }),
      ],
      scopeTransfers: [],
      operations: [
        operation({ operationId: 'op-a', requestedPaymentAmount: 10 }),
        operation({ operationId: 'op-b', requestedPaymentAmount: 10 }),
      ],
      groupId,
      currentUserId,
    });

    expect(result.operations.map(op => op.operationId)).toEqual(['op-b', 'op-a']);
  });
});

describe('canDeleteGroupOperation', () => {
  it('allows either participant on a live operation and nobody else', () => {
    const result = buildGroupSettlementOperationActivity({
      settlements: [settlement({ id: 's-pay', operationId: 'op-1', amount: 10 })],
      scopeTransfers: [],
      operations: [operation({ operationId: 'op-1', requestedPaymentAmount: 10 })],
      groupId,
      currentUserId,
    });
    const projection = result.operations[0];

    expect(canDeleteGroupOperation(projection, groupId, currentUserId)).toBe(true);
    expect(canDeleteGroupOperation(projection, groupId, friendId)).toBe(true);
    expect(canDeleteGroupOperation(projection, groupId, outsiderId)).toBe(false);
  });

  it('hides Delete on deleted operations even for participants', () => {
    const reversedAt = t0 + DAY;
    const result = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [
        transfer({ id: 't-orig', operationId: 'op-gone', createdAt: t0 }),
        transfer({ id: 't-comp', operationId: 'op-gone', isReversal: true, createdAt: reversedAt }),
      ],
      operations: [
        operation({ operationId: 'op-gone', status: 'reversed', requestedPaymentAmount: 0, reversedAt }),
      ],
      groupId,
      currentUserId,
    });

    expect(canDeleteGroupOperation(result.operations[0], groupId, currentUserId)).toBe(false);
  });

  it('uses group-local metadata for an off-page cash payment and transfer-only clearing', () => {
    const payment = buildGroupSettlementOperationActivity({
      settlements: [], scopeTransfers: [], groupId, currentUserId,
      operations: [operation({ operationId: 'op-cash-off-page', groupId, localCashAmount: 8, localDate: t0, localFromUserId: friendId, localToUserId: currentUserId })],
    }).operations[0];
    expect(getGroupOperationDisplayKind(payment, groupId)).toBe('payment');
    expect(getGroupOperationParticipants(payment, groupId)).toEqual({ fromUserId: friendId, toUserId: currentUserId });

    const clearing = buildGroupSettlementOperationActivity({
      settlements: [], scopeTransfers: [transfer({ id: 't-clear', operationId: 'op-clear' })], groupId, currentUserId,
      operations: [operation({ operationId: 'op-clear', groupId })],
    }).operations[0];
    expect(getGroupOperationDisplayKind(clearing, groupId)).toBe('clearing');
    expect(getGroupOperationParticipants(clearing, groupId)).toEqual({ fromUserId: friendId, toUserId: currentUserId });
  });

  it('reaches Delete for a cancellation-only operation through the row-carried operation pair', () => {
    // Critical-1: full settlement with direct-scope cash (invisible to the
    // group view) plus a group-scope cancellation. No local cash, transfer,
    // or participant metadata — only the cancellation row's settling pair.
    const result = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [],
      cancellations: [
        {
          id: 'c-local',
          operationId: 'op-full',
          groupId,
          amount: 8,
          currency: 'USD',
          createdAt: t0,
          actorUserId: friendId,
          friendUserId: currentUserId,
        },
      ],
      operations: [operation({ operationId: 'op-full', requestedPaymentAmount: 12, currency: 'USD' })],
      groupId,
      currentUserId,
    });

    expect(result.operations).toHaveLength(1);
    expect(getGroupOperationDisplayKind(result.operations[0], groupId)).toBe('clearing');
    expect(getGroupOperationCashAmount(result.operations[0], groupId)).toBe(0);
    expect(getGroupOperationParticipants(result.operations[0], groupId)).toEqual({
      fromUserId: friendId,
      toUserId: currentUserId,
    });
    expect(canDeleteGroupOperation(result.operations[0], groupId, currentUserId)).toBe(true);
    expect(canDeleteGroupOperation(result.operations[0], groupId, friendId)).toBe(true);
    expect(canDeleteGroupOperation(result.operations[0], groupId, outsiderId)).toBe(false);
  });

  it('falls back to the operation-level pair only when the group holds a cancellation row', () => {
    const withCancellation = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [],
      cancellations: [
        {
          id: 'c-nopair',
          operationId: 'op-member',
          groupId,
          amount: 8,
          currency: 'USD',
          createdAt: t0,
        },
      ],
      operations: [operation({ operationId: 'op-member', fromUserId: friendId, toUserId: currentUserId })],
      groupId,
      currentUserId,
    }).operations[0];
    expect(getGroupOperationParticipants(withCancellation, groupId)).toEqual({
      fromUserId: friendId,
      toUserId: currentUserId,
    });
    expect(canDeleteGroupOperation(withCancellation, groupId, currentUserId)).toBe(true);

    // Same operation-level pair but no group-local cancellation row: no
    // participants, so an unrelated group never gains a Delete.
    const gated = getGroupOperationParticipants(
      { ...withCancellation, cancellations: [], reversalCancellations: [] },
      groupId,
    );
    expect(gated).toBeUndefined();
  });
});

describe('getGroupSettlementDeleteRequest', () => {
  it('resolves the authorized participant, currency, and friend name', () => {
    expect(getGroupSettlementDeleteRequest({
      operationId: 'op-1',
      settlements: [settlement({ id: 's-1', operationId: 'op-1', amount: 10, currency: 'EUR' })],
      scopeTransfers: [],
      operations: [operation({ operationId: 'op-1', currency: 'EUR' })],
      groupId,
      currentUserId,
      namesById: new Map([[friendId, 'Avee']]),
    })).toEqual({ operationId: 'op-1', currency: 'EUR', friendId, friendName: 'Avee' });
  });

  it('rejects deleted, unknown, and unauthorized operations', () => {
    const input = {
      operationId: 'op-1',
      settlements: [settlement({ id: 's-1', operationId: 'op-1', amount: 10 })],
      scopeTransfers: [] as SettlementScopeTransfer[],
      operations: [operation({ operationId: 'op-1', status: 'reversed', currency: 'USD' })],
      groupId,
      currentUserId,
    };
    expect(getGroupSettlementDeleteRequest(input)).toBeUndefined();
    expect(getGroupSettlementDeleteRequest({ ...input, operationId: 'missing' })).toBeUndefined();
    expect(getGroupSettlementDeleteRequest({
      ...input,
      operations: [operation({ operationId: 'op-1', currency: 'USD' })],
      currentUserId: outsiderId,
    })).toBeUndefined();
  });
});
