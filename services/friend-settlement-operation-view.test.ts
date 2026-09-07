import { describe, expect, it } from 'vitest';
import {
  getFriendOperationCashAmount,
  buildFriendSettlementOperationActivity,
  getFriendOperationDisplayKind,
  type FriendSettlementOperationItem,
} from '@/services/friend-settlement-operation-view';
import { createFriendDetailModule } from '@/services/friend-detail-module';
import type { FriendActivityItem, FriendDetailData } from '@/services/friend-detail-service';
import type { SettlementOperationStatusRecord } from '@/services/settlement-operation-projection';
import type { SettlementScopeTransfer } from '@/types/database';

const currentUserId = 'user-you';
const friendId = 'user-avee';

const DAY = 86_400_000;
const t0 = Date.parse('2026-08-20T12:00:00.000Z');

type SettlementItem = Extract<FriendActivityItem, { type: 'settlement' }>;
type ScopeTransferItem = Extract<FriendActivityItem, { type: 'scope_transfer' }>;

function settlementItem(overrides: Partial<SettlementItem> & { settlementId: string }): SettlementItem {
  return {
    id: `settlement:${overrides.settlementId}`,
    type: 'settlement',
    date: t0,
    amount: 0,
    currency: 'USD',
    direction: 'friend_paid_you',
    ...overrides,
  };
}

function scopeTransferItem(overrides: Partial<ScopeTransferItem> & { transferId: string }): ScopeTransferItem {
  const { transferId, ...rest } = overrides;
  return {
    id: `scope-transfer:${transferId}`,
    type: 'scope_transfer',
    date: t0,
    transferId,
    operationId: 'op-1',
    groupId: 'group-1',
    groupName: 'Trip',
    amount: 8,
    currency: 'USD',
    fromUserId: friendId,
    toUserId: currentUserId,
    direction: 'you_paid_friend',
    ...rest,
  };
}

function transfer(overrides: Partial<SettlementScopeTransfer> & { id: string }): SettlementScopeTransfer {
  return {
    operationId: 'op-1',
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

function operationItems(result: FriendActivityItem[]): FriendSettlementOperationItem[] {
  return result.filter((item): item is FriendSettlementOperationItem => item.type === 'settlement_operation');
}

describe('buildFriendSettlementOperationActivity', () => {
  it('combines cash allocations from the same operation into one payment activity', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [
        settlementItem({ settlementId: 's-direct', operationId: 'op-net', amount: 7, direction: 'friend_paid_you', date: t0 }),
        settlementItem({
          settlementId: 's-group',
          operationId: 'op-net',
          groupId: 'group-1',
          groupName: 'Trip',
          amount: 5,
          direction: 'friend_paid_you',
          date: t0,
        }),
      ],
      scopeTransfers: [],
      operations: [operation({ operationId: 'op-net', requestedPaymentAmount: 12, currency: 'USD' })],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].operationId).toBe('op-net');
    expect(operations[0].projection.originalCashAmount).toBe(12);
    expect(operations[0].direction).toBe('friend_paid_you');
    expect(operations[0].date).toBe(t0);
    // No per-allocation cash rows remain as separate activities.
    expect(result.filter(item => item.type === 'settlement')).toHaveLength(0);
    expect(result.filter(item => item.type === 'scope_transfer')).toHaveLength(0);
  });

  it('keeps a full-net $7 payment with its $8 adjustment in one activity without extra cash', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [
        settlementItem({ settlementId: 's-net', operationId: 'op-net', amount: 7, direction: 'friend_paid_you' }),
      ],
      scopeTransfers: [transfer({ id: 't-net', operationId: 'op-net' })],
      operations: [operation({ operationId: 'op-net', requestedPaymentAmount: 7, currency: 'USD' })],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.originalCashAmount).toBe(7);
    expect(operations[0].projection.adjustments.map(row => row.id)).toEqual(['t-net']);
    expect(getFriendOperationDisplayKind(operations[0].projection)).toBe('payment');
  });

  it('renders a zero-net operation as a balance clearing, never a $0 payment', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [],
      scopeTransfers: [
        transfer({ id: 't-z1', operationId: 'op-zero' }),
        transfer({ id: 't-z2', operationId: 'op-zero', groupId: 'group-2', signedGroupBalanceDelta: 8 }),
      ],
      operations: [operation({ operationId: 'op-zero', requestedPaymentAmount: 0, currency: 'USD' })],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.isZeroPayment).toBe(true);
    expect(getFriendOperationDisplayKind(operations[0].projection)).toBe('clearing');
  });

  it('treats transfers-only operations without metadata as clearings on the complete Friend read', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [scopeTransferItem({ transferId: 't-only', operationId: 'op-clear' })],
      scopeTransfers: [],
      operations: [],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    // Never invents a cash amount from adjustments.
    expect(operations[0].projection.originalCashAmount).toBe(0);
    expect(getFriendOperationDisplayKind(operations[0].projection)).toBe('clearing');
  });

  it('maps a full-settlement receipt with 2 cancellations to one payment with named cleared scopes', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [
        settlementItem({ settlementId: 's-cash', operationId: 'op-full', amount: 12, direction: 'friend_paid_you', date: t0 }),
      ],
      scopeTransfers: [],
      cancellations: [
        {
          id: 'c-1',
          operationId: 'op-full',
          groupId: 'group-1',
          amount: 10,
          currency: 'USD',
          createdAt: t0,
        },
        {
          id: 'c-2',
          operationId: 'op-full',
          groupId: 'group-2',
          amount: 3,
          currency: 'USD',
          createdAt: t0,
        },
      ],
      groupNames: { 'group-1': 'Trip', 'group-2': 'Roommates' },
      operations: [operation({ operationId: 'op-full', requestedPaymentAmount: 12, currency: 'USD' })],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    // One payment record only: the actual cash headline, no extra payment row.
    expect(result).toHaveLength(1);
    expect(operations).toHaveLength(1);
    expect(getFriendOperationDisplayKind(operations[0].projection)).toBe('payment');
    expect(getFriendOperationCashAmount(operations[0].projection)).toBe(12);
    // Details list naming each cleared scope.
    expect(operations[0].projection.cancellations.map(row => row.id).sort()).toEqual(['c-1', 'c-2']);
    expect(operations[0].groupNames).toMatchObject({ 'group-1': 'Trip', 'group-2': 'Roommates' });
  });

  it('marks a cancellation-only operation deleted from paired cancellation rows without metadata', () => {
    const reversedAt = t0 + DAY;
    const result = buildFriendSettlementOperationActivity({
      activity: [],
      scopeTransfers: [],
      cancellations: [
        {
          id: 'c-orig',
          operationId: 'op-cancel-gone',
          groupId: 'group-1',
          amount: 8,
          currency: 'USD',
          createdAt: t0,
        },
        {
          id: 'c-comp',
          operationId: 'op-cancel-gone',
          groupId: 'group-1',
          amount: 8,
          currency: 'USD',
          isReversal: true,
          createdAt: reversedAt,
        },
      ],
      operations: [],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.isDeleted).toBe(true);
    expect(operations[0].projection.cancellations.map(row => row.id)).toEqual(['c-orig']);
  });

  it('uses authoritative metadata for off-page payments instead of showing $0', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [scopeTransferItem({ transferId: 't-off', operationId: 'op-offpage' })],
      scopeTransfers: [],
      operations: [operation({ operationId: 'op-offpage', requestedPaymentAmount: 7, currency: 'USD' })],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.isZeroPayment).toBe(false);
    expect(operations[0].projection.cashUnknown).toBe(true);
    expect(getFriendOperationDisplayKind(operations[0].projection)).toBe('payment');
    expect(operations[0].projection.authoritativeCashTotal).toBe(7);
  });

  it('does not duplicate a backfill-marked settlement as Friend cash activity', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [settlementItem({ settlementId: 's-backfill', operationId: 'op-backfill', amount: 12, backfilledTransferId: 't-source' })],
      scopeTransfers: [],
      operations: [operation({ operationId: 'op-backfill', requestedPaymentAmount: 0 })],
      currentUserId,
      friendId,
    });
    const [item] = operationItems(result);
    expect(item.projection.originalCashAmount).toBe(0);
    expect(item.projection.allocations[0].backfilledTransferId).toBe('t-source');
    expect(getFriendOperationDisplayKind(item.projection)).toBe('clearing');
    expect(getFriendOperationCashAmount(item.projection)).toBe(0);
  });

  it('keeps legacy payments without an operation ID readable with no operation activity', () => {
    const legacy = settlementItem({ settlementId: 's-legacy', amount: 12 });
    const result = buildFriendSettlementOperationActivity({
      activity: [legacy],
      scopeTransfers: [],
      operations: [],
      currentUserId,
      friendId,
    });

    expect(operationItems(result)).toHaveLength(0);
    expect(result).toContain(legacy);
  });

  it('keeps a deleted operation in place with original payer, amount, and date', () => {
    const reversedAt = t0 + DAY;
    const result = buildFriendSettlementOperationActivity({
      activity: [
        settlementItem({ settlementId: 's-orig', operationId: 'op-gone', amount: 7, direction: 'friend_paid_you', date: t0 }),
        settlementItem({
          settlementId: 's-comp',
          operationId: 'op-gone',
          amount: 7,
          direction: 'you_paid_friend',
          date: reversedAt,
          notes: 'Reversal of settlement operation op-gone',
        }),
      ],
      scopeTransfers: [
        transfer({ id: 't-orig', operationId: 'op-gone', createdAt: t0 }),
        transfer({ id: 't-comp', operationId: 'op-gone', isReversal: true, signedGroupBalanceDelta: 8, createdAt: reversedAt }),
      ],
      operations: [
        operation({
          operationId: 'op-gone',
          status: 'reversed',
          requestedPaymentAmount: 7,
          currency: 'USD',
          reversedAt,
        }),
      ],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.isDeleted).toBe(true);
    expect(operations[0].projection.originalCashAmount).toBe(7);
    expect(operations[0].direction).toBe('friend_paid_you');
    expect(operations[0].date).toBe(t0);
    expect(operations[0].projection.reversedAt).toBe(reversedAt);
    // Compensating rows are folded into details, never a second activity.
    expect(result.filter(item => item.type === 'settlement')).toHaveLength(0);
  });

  it('keeps the earlier $3 operation committed when the later $9 operation is deleted', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [
        settlementItem({ settlementId: 's-three', operationId: 'op-three', amount: 3, date: t0 }),
        settlementItem({ settlementId: 's-nine', operationId: 'op-nine', amount: 9, date: t0 + DAY }),
      ],
      scopeTransfers: [],
      operations: [
        operation({ operationId: 'op-three', requestedPaymentAmount: 3, originalDate: t0 }),
        operation({ operationId: 'op-nine', status: 'reversed', requestedPaymentAmount: 9, reversedAt: t0 + (2 * DAY), originalDate: t0 + DAY }),
      ],
      currentUserId,
      friendId,
    });
    const operations = operationItems(result);
    expect(operations).toHaveLength(2);
    expect(operations.find(item => item.operationId === 'op-three')?.projection).toMatchObject({
      status: 'committed',
      isDeleted: false,
      originalCashAmount: 3,
    });
    expect(operations.find(item => item.operationId === 'op-nine')?.projection).toMatchObject({
      status: 'reversed',
      isDeleted: true,
      originalCashAmount: 9,
    });
  });

  it('marks an operation deleted from paired reversal rows without status metadata', () => {
    const reversedAt = t0 + DAY;
    const result = buildFriendSettlementOperationActivity({
      activity: [
        settlementItem({ settlementId: 's-orig', operationId: 'op-pair', amount: 7, direction: 'friend_paid_you', date: t0 }),
      ],
      scopeTransfers: [
        transfer({ id: 't-orig', operationId: 'op-pair', createdAt: t0 }),
        transfer({ id: 't-comp', operationId: 'op-pair', isReversal: true, signedGroupBalanceDelta: 8, createdAt: reversedAt }),
      ],
      operations: [],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.isDeleted).toBe(true);
    expect(operations[0].projection.originalCashAmount).toBe(7);
  });

  it('does not mark an operation deleted from a lone reversal flag', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [
        settlementItem({ settlementId: 's-1', operationId: 'op-lone', amount: 9, direction: 'friend_paid_you' }),
      ],
      scopeTransfers: [],
      operations: [],
      currentUserId,
      friendId,
    });

    const withStray = buildFriendSettlementOperationActivity({
      activity: [
        settlementItem({ settlementId: 's-1', operationId: 'op-lone', amount: 9, direction: 'friend_paid_you' }),
        scopeTransferItem({ transferId: 't-stray', operationId: 'op-lone', isReversal: true }),
      ],
      scopeTransfers: [],
      operations: [],
      currentUserId,
      friendId,
    });

    expect(operationItems(result)[0].projection.isDeleted).toBe(false);
    expect(operationItems(withStray)[0].projection.isDeleted).toBe(false);
  });

  it('preserves distinct operations with identical amounts and orders them chronologically', () => {
    const expense = {
      id: 'expense:later',
      type: 'expense' as const,
      date: t0 + 2 * DAY,
      expense: { id: 'later' },
    } as unknown as FriendActivityItem;
    const result = buildFriendSettlementOperationActivity({
      activity: [
        expense,
        settlementItem({ settlementId: 's-a', operationId: 'op-a', amount: 10, date: t0 }),
        settlementItem({ settlementId: 's-b', operationId: 'op-b', amount: 10, date: t0 + DAY }),
      ],
      scopeTransfers: [],
      operations: [
        operation({ operationId: 'op-a', requestedPaymentAmount: 10 }),
        operation({ operationId: 'op-b', requestedPaymentAmount: 10 }),
      ],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations.map(op => op.operationId).sort()).toEqual(['op-a', 'op-b']);
    // Newest first: expense, op-b, op-a.
    expect(result.map(item => item.id)).toEqual(['expense:later', 'operation:op-b', 'operation:op-a']);
    // Non-settlement items pass through untouched.
    expect(result).toContain(expense);
  });

  it('dedupes transfers already expanded into scope-transfer activity', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [scopeTransferItem({ transferId: 't-dup', operationId: 'op-dup' })],
      scopeTransfers: [transfer({ id: 't-dup', operationId: 'op-dup' })],
      operations: [operation({ operationId: 'op-dup', requestedPaymentAmount: 7, currency: 'USD' })],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.adjustments).toHaveLength(1);
  });

  it('retains group names for Balance details', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [scopeTransferItem({ transferId: 't-g', operationId: 'op-g', groupId: 'group-9', groupName: 'Goa' })],
      scopeTransfers: [],
      operations: [],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations[0].groupNames).toEqual({ 'group-9': 'Goa' });
  });

  it('keeps a deleted zero-payment operation as a balance clearing, never a payment', () => {
    const reversedAt = t0 + DAY;
    const result = buildFriendSettlementOperationActivity({
      activity: [],
      scopeTransfers: [
        transfer({ id: 't-orig', operationId: 'op-zero-gone', createdAt: t0 }),
        transfer({ id: 't-comp', operationId: 'op-zero-gone', isReversal: true, signedGroupBalanceDelta: 8, createdAt: reversedAt }),
      ],
      operations: [
        operation({
          operationId: 'op-zero-gone',
          status: 'reversed',
          requestedPaymentAmount: 0,
          currency: 'USD',
          reversedAt,
        }),
      ],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.isDeleted).toBe(true);
    expect(operations[0].projection.isZeroPayment).toBe(true);
    expect(getFriendOperationDisplayKind(operations[0].projection)).toBe('clearing');
    expect(operations[0].direction).toBeUndefined();
    expect(operations[0].projection.reversedAt).toBe(reversedAt);
  });

  it('retains authoritative amount, date, and direction when a deleted payment cash row is off-page', () => {
    const reversedAt = t0 + DAY;
    const result = buildFriendSettlementOperationActivity({
      activity: [],
      scopeTransfers: [transfer({ id: 't-off', operationId: 'op-gone-offpage', createdAt: t0 })],
      operations: [
        operation({
          operationId: 'op-gone-offpage',
          status: 'reversed',
          requestedPaymentAmount: 7,
          currency: 'USD',
          fromUserId: friendId,
          toUserId: currentUserId,
          originalDate: t0,
          createdAt: t0,
          reversedAt,
        }),
      ],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.isDeleted).toBe(true);
    expect(operations[0].projection.isZeroPayment).toBe(false);
    expect(getFriendOperationDisplayKind(operations[0].projection)).toBe('payment');
    expect(operations[0].projection.authoritativeCashTotal).toBe(7);
    expect(operations[0].direction).toBe('friend_paid_you');
    expect(operations[0].date).toBe(t0);
    expect(operations[0].projection.reversedAt).toBe(reversedAt);
  });

  it('leaves direction unknown instead of inventing an opposite payment when participants are missing', () => {
    const result = buildFriendSettlementOperationActivity({
      activity: [],
      scopeTransfers: [transfer({ id: 't-nodir', operationId: 'op-nodir', createdAt: t0 })],
      operations: [
        operation({
          operationId: 'op-nodir',
          requestedPaymentAmount: 7,
          currency: 'USD',
          originalDate: t0,
          createdAt: t0,
        }),
      ],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(getFriendOperationDisplayKind(operations[0].projection)).toBe('payment');
    expect(operations[0].direction).toBeUndefined();
    expect(operations[0].projection.authoritativeCashTotal).toBe(7);
  });
});

describe('friend detail controller flow', () => {
  const detail: FriendDetailData = {
    friend: { id: friendId, name: 'Avee', isActive: true, createdAt: 1, balance: 0 },
    expenses: [],
    activity: [
      {
        id: 'settlement:s-net',
        type: 'settlement',
        date: t0,
        settlementId: 's-net',
        operationId: 'op-net',
        amount: 7,
        currency: 'USD',
        direction: 'friend_paid_you',
      },
    ],
    relationship: {
      directBalance: 0,
      groupBalances: [],
      activity: [],
      totalsByCurrency: [],
    },
  };

  it('pipes module scope transfers and settlements into one operation activity', async () => {
    const module = createFriendDetailModule({
      readAdapter: { getDetail: async () => detail },
      scopeTransferAdapter: {
        getByFriend: async () => [transfer({ id: 't-net', operationId: 'op-net' })],
      },
    });

    const loaded = await module.getDetail(currentUserId, friendId);
    expect(loaded).not.toBeNull();
    const result = buildFriendSettlementOperationActivity({
      // The route renders relationship activity when present, falling back
      // to the raw detail activity (mirrors friends/[id].tsx).
      activity: loaded?.relationship.activity ?? loaded?.activity ?? [],
      scopeTransfers: loaded?.scopeTransfers ?? [],
      operations: loaded?.settlementOperations ?? [],
      currentUserId,
      friendId,
    });

    const operations = operationItems(result);
    expect(operations).toHaveLength(1);
    expect(operations[0].projection.originalCashAmount).toBe(7);
    expect(operations[0].projection.adjustments.map(row => row.id)).toEqual(['t-net']);
  });
});
