import { describe, expect, it } from 'vitest';
import {
  getGroupLocalCashAmount,
  getGroupLocalTransfers,
  projectSettlementOperations,
  type SettlementOperationStatusRecord,
} from '@/services/settlement-operation-projection';
import type { Settlement, SettlementScopeTransfer } from '@/types/database';

const currentUserId = 'user-a';
const friendId = 'user-b';

const DAY = 86_400_000;
const t0 = Date.parse('2026-08-20T12:00:00.000Z');

function settlement(overrides: Partial<Settlement> & { id: string }): Settlement {
  return {
    operationId: undefined,
    groupId: undefined,
    fromUserId: friendId,
    toUserId: currentUserId,
    amount: 0,
    currency: 'USD',
    date: t0,
    createdAt: t0,
    ...overrides,
  };
}

function transfer(overrides: Partial<SettlementScopeTransfer> & { id: string; operationId: string }): SettlementScopeTransfer {
  return {
    groupId: 'group-1',
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

describe('projectSettlementOperations', () => {
  it('projects a direct-only payment as one committed operation', () => {
    const result = projectSettlementOperations({
      settlements: [
        settlement({ id: 's-1', operationId: 'op-direct', amount: 15 }),
      ],
      transfers: [],
      operations: [operation({ operationId: 'op-direct', requestedPaymentAmount: 15, currency: 'USD' })],
    });

    expect(result.legacySettlements).toEqual([]);
    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.operationId).toBe('op-direct');
    expect(projection.status).toBe('committed');
    expect(projection.isDeleted).toBe(false);
    expect(projection.originalCashAmount).toBe(15);
    expect(projection.fromUserId).toBe(friendId);
    expect(projection.toUserId).toBe(currentUserId);
    expect(projection.isZeroPayment).toBe(false);
    expect(projection.cashUnknown).toBe(false);
    expect(projection.allocations.map(row => row.id)).toEqual(['s-1']);
    expect(projection.adjustments).toEqual([]);
    expect(projection.reversalSettlements).toEqual([]);
    expect(projection.originalDate).toBe(t0);
  });

  it('projects a group-only payment as one committed operation', () => {
    const result = projectSettlementOperations({
      settlements: [
        settlement({ id: 's-g1', operationId: 'op-group', groupId: 'group-1', amount: 20 }),
      ],
      transfers: [],
      operations: [operation({ operationId: 'op-group', requestedPaymentAmount: 20, currency: 'USD' })],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.originalCashAmount).toBe(20);
    expect(projection.allocations.map(row => row.id)).toEqual(['s-g1']);
    expect(getGroupLocalCashAmount(projection, 'group-1')).toBe(20);
    expect(getGroupLocalCashAmount(projection, 'group-2')).toBe(0);
    expect(projection.isDeleted).toBe(false);
  });

  it('projects full-net +15/-8 as one $7 payment with an $8 adjustment in details', () => {
    const result = projectSettlementOperations({
      settlements: [
        settlement({ id: 's-net', operationId: 'op-net', amount: 7 }),
      ],
      transfers: [
        transfer({ id: 't-net', operationId: 'op-net', groupId: 'group-1', signedGroupBalanceDelta: 8 }),
      ],
      operations: [operation({ operationId: 'op-net', requestedPaymentAmount: 7, currency: 'USD' })],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    // Adjustment rows are never counted as cash.
    expect(projection.originalCashAmount).toBe(7);
    expect(projection.allocations.map(row => row.id)).toEqual(['s-net']);
    expect(projection.adjustments.map(row => row.id)).toEqual(['t-net']);
    expect(getGroupLocalCashAmount(projection, 'group-1')).toBe(0);
    expect(getGroupLocalTransfers(projection, 'group-1').map(row => row.id)).toEqual(['t-net']);
  });

  it('keeps multi-group settlements as one operation with group-local views', () => {
    const result = projectSettlementOperations({
      settlements: [
        settlement({ id: 's-direct', operationId: 'op-multi', amount: 10 }),
        settlement({ id: 's-g1', operationId: 'op-multi', groupId: 'group-1', amount: 5 }),
      ],
      transfers: [
        transfer({ id: 't-g2', operationId: 'op-multi', groupId: 'group-2', signedGroupBalanceDelta: 4 }),
        transfer({ id: 't-g3', operationId: 'op-multi', groupId: 'group-3', signedGroupBalanceDelta: -6 }),
      ],
      operations: [operation({ operationId: 'op-multi', requestedPaymentAmount: 15, currency: 'USD' })],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.originalCashAmount).toBe(15);
    expect(projection.adjustments).toHaveLength(2);
    expect(getGroupLocalCashAmount(projection, 'group-1')).toBe(5);
    expect(getGroupLocalTransfers(projection, 'group-2').map(row => row.id)).toEqual(['t-g2']);
    expect(getGroupLocalTransfers(projection, 'group-3').map(row => row.id)).toEqual(['t-g3']);
  });

  it('projects a zero-net operation as a balance clearing with no payment wording basis', () => {
    const result = projectSettlementOperations({
      settlements: [],
      transfers: [
        transfer({ id: 't-z1', operationId: 'op-zero', groupId: 'group-1', signedGroupBalanceDelta: 8 }),
        transfer({ id: 't-z2', operationId: 'op-zero', groupId: 'group-2', signedGroupBalanceDelta: -8 }),
      ],
      operations: [operation({ operationId: 'op-zero', requestedPaymentAmount: 0, currency: 'USD' })],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.isZeroPayment).toBe(true);
    expect(projection.originalCashAmount).toBe(0);
    expect(projection.hasKnownPayment).toBe(false);
    expect(projection.cashUnknown).toBe(false);
    expect(projection.adjustments).toHaveLength(2);
  });

  it('does not mistake a missing off-page payment for a zero-payment operation', () => {
    const result = projectSettlementOperations({
      settlements: [],
      transfers: [
        transfer({ id: 't-off', operationId: 'op-offpage', groupId: 'group-1', signedGroupBalanceDelta: 8 }),
      ],
      operations: [operation({ operationId: 'op-offpage', requestedPaymentAmount: 7, currency: 'USD' })],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.isZeroPayment).toBe(false);
    expect(projection.cashUnknown).toBe(true);
    expect(projection.hasKnownPayment).toBe(true);
    expect(projection.authoritativeCashTotal).toBe(7);
    expect(projection.originalCashAmount).toBe(0);
  });

  it('treats operation transfers without metadata or cash rows as unknown cash, not zero-payment', () => {
    const result = projectSettlementOperations({
      settlements: [],
      transfers: [
        transfer({ id: 't-nometa', operationId: 'op-nometa', groupId: 'group-1' }),
      ],
      operations: [],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.isZeroPayment).toBe(false);
    expect(projection.cashUnknown).toBe(true);
  });

  it('excludes backfill-marked rows from operation cash and payer attribution', () => {
    const result = projectSettlementOperations({
      settlements: [settlement({ id: 's-backfill', operationId: 'op-backfill', amount: 12, backfilledTransferId: 't-source' })],
      transfers: [],
      operations: [operation({ operationId: 'op-backfill', requestedPaymentAmount: 0, currency: 'USD' })],
    });
    const [projection] = result.operations;
    expect(projection.originalCashAmount).toBe(0);
    expect(projection.allocations).toHaveLength(1);
    expect(projection.allocations[0].backfilledTransferId).toBe('t-source');
    expect(projection.fromUserId).toBeUndefined();
    expect(projection.toUserId).toBeUndefined();
    expect(projection.isZeroPayment).toBe(true);
    expect(projection.cashUnknown).toBe(false);
  });

  it('keeps a marked row without operation metadata cash-neutral by operation identity', () => {
    const result = projectSettlementOperations({
      settlements: [settlement({ id: 's-backfill-unknown', operationId: 'op-backfill-unknown', amount: 12, backfilledTransferId: 't-source' })],
      transfers: [],
      operations: [],
    });
    const [projection] = result.operations;
    expect(projection.originalCashAmount).toBe(0);
    expect(projection.allocations).toHaveLength(1);
    expect(projection.allocations[0].backfilledTransferId).toBe('t-source');
    expect(projection.isZeroPayment).toBe(false);
    expect(projection.cashUnknown).toBe(false);
  });

  it('projects a partial payment with only its own allocations and no adjustments', () => {
    const result = projectSettlementOperations({
      settlements: [
        settlement({ id: 's-partial', operationId: 'op-partial', amount: 5 }),
      ],
      transfers: [],
      operations: [operation({ operationId: 'op-partial', requestedPaymentAmount: 5, currency: 'USD' })],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.originalCashAmount).toBe(5);
    expect(projection.adjustments).toEqual([]);
    expect(projection.isZeroPayment).toBe(false);
  });

  it('keeps legacy settlements without an operation ID readable without operation deletion', () => {
    const legacy = settlement({ id: 's-legacy', amount: 12 });
    const result = projectSettlementOperations({
      settlements: [legacy],
      transfers: [],
      operations: [],
    });

    expect(result.operations).toEqual([]);
    expect(result.legacySettlements).toEqual([legacy]);
  });

  it('folds compensating reversal rows into an already-reversed operation without counting them as cash', () => {
    const reversedAt = t0 + DAY;
    const result = projectSettlementOperations({
      settlements: [
        settlement({ id: 's-orig', operationId: 'op-reversed', amount: 7, date: t0, createdAt: t0 }),
        settlement({
          id: 's-comp',
          operationId: 'op-reversed',
          amount: 7,
          fromUserId: currentUserId,
          toUserId: friendId,
          date: reversedAt,
          createdAt: reversedAt,
        }),
      ],
      transfers: [
        transfer({ id: 't-orig', operationId: 'op-reversed', groupId: 'group-1', createdAt: t0 }),
        transfer({ id: 't-comp', operationId: 'op-reversed', groupId: 'group-1', isReversal: true, createdAt: reversedAt }),
      ],
      operations: [
        operation({
          operationId: 'op-reversed',
          status: 'reversed',
          requestedPaymentAmount: 7,
          currency: 'USD',
          reversedAt,
        }),
      ],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.status).toBe('reversed');
    expect(projection.isDeleted).toBe(true);
    expect(projection.reversedAt).toBe(reversedAt);
    // Original payer/payee, amount, and date are retained.
    expect(projection.originalCashAmount).toBe(7);
    expect(projection.fromUserId).toBe(friendId);
    expect(projection.toUserId).toBe(currentUserId);
    expect(projection.originalDate).toBe(t0);
    expect(projection.allocations.map(row => row.id)).toEqual(['s-orig']);
    expect(projection.reversalSettlements.map(row => row.id)).toEqual(['s-comp']);
    expect(projection.adjustments.map(row => row.id)).toEqual(['t-orig']);
    expect(projection.reversalTransfers.map(row => row.id)).toEqual(['t-comp']);
  });

  it('does not mark an operation deleted from a child isReversal flag alone', () => {
    const result = projectSettlementOperations({
      settlements: [
        settlement({ id: 's-1', operationId: 'op-child-flag', amount: 9 }),
      ],
      transfers: [
        transfer({ id: 't-flagged', operationId: 'op-child-flag', groupId: 'group-1', isReversal: true }),
      ],
      operations: [operation({ operationId: 'op-child-flag', status: 'committed' })],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.status).toBe('committed');
    expect(projection.isDeleted).toBe(false);
    expect(projection.reversedAt).toBeUndefined();
  });

  it('preserves distinct operations with identical amounts', () => {
    const result = projectSettlementOperations({
      settlements: [
        settlement({ id: 's-a', operationId: 'op-a', amount: 10 }),
        settlement({ id: 's-b', operationId: 'op-b', amount: 10 }),
      ],
      transfers: [],
      operations: [
        operation({ operationId: 'op-a', requestedPaymentAmount: 10 }),
        operation({ operationId: 'op-b', requestedPaymentAmount: 10 }),
      ],
    });

    expect(result.operations).toHaveLength(2);
    expect(result.operations.map(op => op.operationId).sort()).toEqual(['op-a', 'op-b']);
    expect(result.operations.map(op => op.originalCashAmount)).toEqual([10, 10]);
  });

  it('keeps a metadata-only payment as a payment when its cash row is off-page', () => {
    const result = projectSettlementOperations({
      settlements: [],
      transfers: [transfer({ id: 't-off-page', operationId: 'op-off-page', groupId: 'group-1' })],
      operations: [operation({ operationId: 'op-off-page', requestedPaymentAmount: 7.5, originalDate: 3 })],
    });

    expect(result.operations[0]).toMatchObject({
      originalCashAmount: 0,
      authoritativeCashTotal: 7.5,
      hasKnownPayment: true,
      isZeroPayment: false,
      originalDate: 3,
    });
  });

  it('does not classify a lone compensating row as the original payment with metadata', () => {
    const result = projectSettlementOperations({
      settlements: [settlement({ id: 's-comp', operationId: 'op-reversed', amount: 12, createdAt: 20 })],
      transfers: [],
      operations: [operation({ operationId: 'op-reversed', status: 'reversed', requestedPaymentAmount: 12, reversedAt: 15, originalDate: 4 })],
    });

    expect(result.operations[0]).toMatchObject({
      allocations: [],
      reversalSettlements: [{ id: 's-comp' }],
      originalDate: 4,
      isDeleted: true,
    });
  });
});
