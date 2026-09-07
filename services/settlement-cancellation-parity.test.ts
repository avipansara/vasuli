import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateGroupBalances } from '@/services/group-balance';
import { projectFriendRelationship } from '@/services/friend-detail-service';
import { applyCancellationToGroupReadModel, buildGroupDetailReadModel } from '@/services/group-detail-read-model';
import { createFriendGroupBalanceService } from '@/services/friend-group-balance-service';
import {
  getGroupLocalCancellations,
  operationAffectsGroup,
  projectSettlementOperations,
} from '@/services/settlement-operation-projection';
import type {
  Expense,
  ExpenseSplit,
  Group,
  GroupMember,
  Settlement,
  SettlementCancellation,
  User,
} from '@/types/database';

// Task 7 parity: the decoy fixture (reviewer paid $31 + $10 with even splits,
// one $36 group cash payment friend -> reviewer) plus one
// `{group: decoy, amount: 15.5}` cancellation and NO transfer row must read
// 0/0 for both parties in every balance function. Reversal rows negate.

const currentUserId = 'current-user';
const friendId = 'friend-a';
const otherId = 'other-user';
const groupId = 'group-decoy';

const decoyExpenses: Expense[] = [
  { id: 'dinner', groupId, description: 'Dinner', amount: 31, currency: 'USD', paidBy: currentUserId, date: 1, createdAt: 1, updatedAt: 1 },
  { id: 'taxi', groupId, description: 'Taxi', amount: 10, currency: 'USD', paidBy: currentUserId, date: 2, createdAt: 2, updatedAt: 2 },
];

const decoySplits: ExpenseSplit[] = [
  { id: 'split-dinner-current', expenseId: 'dinner', userId: currentUserId, amount: 15.5, splitType: 'equal' },
  { id: 'split-dinner-friend', expenseId: 'dinner', userId: friendId, amount: 15.5, splitType: 'equal' },
  { id: 'split-taxi-current', expenseId: 'taxi', userId: currentUserId, amount: 5, splitType: 'equal' },
  { id: 'split-taxi-friend', expenseId: 'taxi', userId: friendId, amount: 5, splitType: 'equal' },
];

const decoyCash: Settlement[] = [
  {
    id: 'group-cash',
    groupId,
    fromUserId: friendId,
    toUserId: currentUserId,
    amount: 36,
    currency: 'USD',
    date: 4,
    createdAt: 4,
  },
];

function cancellation(overrides: Partial<SettlementCancellation> & { id: string }): SettlementCancellation {
  return {
    operationId: 'operation-cancellation',
    groupId,
    amount: 15.5,
    currency: 'USD',
    createdAt: 5,
    ...overrides,
  };
}

const decoyCancellation = cancellation({ id: 'cancellation-1' });

const decoyGroup: Group = { id: groupId, name: 'Decoy', createdAt: 1, updatedAt: 1 };
const currentUser: User = { id: currentUserId, name: 'Current', isActive: true, createdAt: 1 };
const friendUser: User = { id: friendId, name: 'Friend', isActive: true, createdAt: 1 };
const otherUser: User = { id: otherId, name: 'Other', isActive: true, createdAt: 1 };
const decoyMembers: GroupMember[] = [
  { id: 'member-current', groupId, userId: currentUserId, role: 'admin', joinedAt: 1 },
  { id: 'member-friend', groupId, userId: friendId, role: 'member', joinedAt: 1 },
];

describe('cancellation parity (decoy fixture, no transfer row)', () => {
  it('reads the decoy plus cancellation as settled in calculateGroupBalances', () => {
    const balances = calculateGroupBalances(decoyExpenses, decoySplits, decoyCash, [], [decoyCancellation]);

    expect(balances.get(currentUserId)).toBe(0);
    expect(balances.get(friendId)).toBe(0);
  });

  it('scopes the cancellation to the operation pair so other members never change', () => {
    const otherExpense: Expense = {
      id: 'other-expense', groupId, description: 'Other', amount: 60, currency: 'USD',
      paidBy: otherId, date: 3, createdAt: 3, updatedAt: 3,
    };
    const balances = calculateGroupBalances(
      [...decoyExpenses, otherExpense],
      [
        ...decoySplits,
        { id: 'split-other-other', expenseId: 'other-expense', userId: otherId, amount: 30, splitType: 'equal' },
        { id: 'split-other-friend', expenseId: 'other-expense', userId: friendId, amount: 30, splitType: 'equal' },
      ],
      decoyCash,
      [],
      [decoyCancellation],
      () => [currentUserId, friendId],
    );

    expect(balances.get(currentUserId)).toBe(0);
    expect(balances.get(otherId)).toBe(30);
  });

  it('reads the decoy plus cancellation as settled in friend-detail projection', () => {
    const relationship = projectFriendRelationship({
      friend: { ...friendUser, balance: 0 },
      expenses: [],
      activity: [{
        id: 'direct-settlement-context',
        type: 'settlement',
        date: 1,
        settlementId: 'settlement-context',
        amount: 0,
        currency: 'USD',
        direction: 'you_paid_friend',
      }],
      groupBalances: [{
        groupId,
        groupName: 'Decoy',
        currency: 'USD',
        amount: -15.5,
        direction: 'you_owe',
      }],
      cancellations: [decoyCancellation],
    });

    // The group scope clears to 0/settled; the signed amount removed moves to
    // the direct leg (transfer-convention inverse leg, matching the server
    // helper), so the relationship total is conserved at -15.5.
    expect(relationship.groupBalances).toMatchObject([{ groupId, amount: 0, direction: 'settled' }]);
    expect(relationship.directBalance).toBe(-15.5);
    expect(relationship.totalsByCurrency).toEqual([
      { currency: 'USD', amount: -15.5, direction: 'you_owe' },
    ]);
  });

  it('clears every direct and group balance on the full-settlement pin (0/0/0)', () => {
    const relationship = projectFriendRelationship({
      friend: { ...friendUser, balance: -7 },
      expenses: [],
      activity: [{
        id: 'direct-settlement-context',
        type: 'settlement',
        date: 1,
        settlementId: 'settlement-context',
        amount: 0,
        currency: 'USD',
        direction: 'you_paid_friend',
      }],
      groupBalances: [
        { groupId: 'group-one', groupName: 'One', currency: 'USD', amount: 10, direction: 'you_are_owed' },
        { groupId: 'group-two', groupName: 'Two', currency: 'USD', amount: -3, direction: 'you_owe' },
      ],
      cancellations: [
        cancellation({ id: 'cancellation-g1', operationId: 'operation-full', groupId: 'group-one', amount: 10 }),
        cancellation({ id: 'cancellation-g2', operationId: 'operation-full', groupId: 'group-two', amount: 3 }),
      ],
    });

    expect(relationship.directBalance).toBe(0);
    expect(relationship.groupBalances).toMatchObject([
      { groupId: 'group-one', amount: 0, direction: 'settled' },
      { groupId: 'group-two', amount: 0, direction: 'settled' },
    ]);
    expect(relationship.totalsByCurrency).toEqual([
      { currency: 'USD', amount: 0, direction: 'settled' },
    ]);
    expect(relationship.zeroNetCurrency).toBe('USD');
  });

  it('reads the decoy plus cancellation as settled in the group-detail read model', () => {
    const model = buildGroupDetailReadModel({
      currentUserId,
      group: decoyGroup,
      expenses: decoyExpenses,
      members: decoyMembers,
      users: [currentUser, friendUser],
      userFriends: [],
      friendships: [],
      splits: decoySplits,
      settlements: decoyCash,
      cancellations: [decoyCancellation],
      settlementOperations: [{
        operationId: 'operation-cancellation',
        status: 'committed',
        createdAt: 5,
        fromUserId: friendId,
        toUserId: currentUserId,
      }],
    });

    expect(model.balances.get(currentUserId)).toBe(0);
    expect(model.balances.get(friendId)).toBe(0);
  });

  it('reads the decoy plus cancellation as settled in shared group balances', async () => {    const service = createFriendGroupBalanceService({
      getUserGroups: async () => [decoyGroup],
      getExpenses: async () => decoyExpenses,
      getSplits: async () => decoySplits,
      getSettlements: async () => decoyCash,
      getCancellations: async () => [decoyCancellation],
      getSettlementOperations: async () => [{
        operationId: 'operation-cancellation',
        status: 'committed',
        createdAt: 5,
        fromUserId: friendId,
        toUserId: currentUserId,
      }],
    });

    await expect(service.getSharedGroupBalances(currentUserId, friendId)).resolves.toMatchObject([
      { groupId, amount: 0, direction: 'settled' },
    ]);
  });
});

const balanceUtilsMocks = vi.hoisted(() => ({
  getByGroups: vi.fn(),
  getByGroupsSettlements: vi.fn(),
  getSplitsForExpenses: vi.fn(),
  getByGroupScopeTransfers: vi.fn(),
  getByGroupCancellations: vi.fn(),
  getByGroupOperations: vi.fn(),
}));

vi.mock('@/services/expense-service', () => ({
  expenseService: {
    getByGroups: balanceUtilsMocks.getByGroups,
    getSplitsForExpenses: balanceUtilsMocks.getSplitsForExpenses,
  },
}));

vi.mock('@/services/settlement-service', () => ({
  settlementService: {
    getByGroups: balanceUtilsMocks.getByGroupsSettlements,
  },
}));

vi.mock('@/services/scope-transfer-service', () => ({
  scopeTransferService: {
    getByGroup: balanceUtilsMocks.getByGroupScopeTransfers,
  },
}));

vi.mock('@/services/settlement-cancellation-service', () => ({
  settlementCancellationService: {
    getByGroup: balanceUtilsMocks.getByGroupCancellations,
  },
}));

vi.mock('@/services/settlement-operation-metadata-service', () => ({
  settlementOperationMetadataService: {
    getByGroup: balanceUtilsMocks.getByGroupOperations,
  },
}));

describe('cancellation parity in balance-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    balanceUtilsMocks.getByGroups.mockResolvedValue(decoyExpenses);
    balanceUtilsMocks.getByGroupsSettlements.mockResolvedValue(decoyCash);
    balanceUtilsMocks.getSplitsForExpenses.mockResolvedValue(decoySplits);
    balanceUtilsMocks.getByGroupScopeTransfers.mockResolvedValue([]);
    balanceUtilsMocks.getByGroupCancellations.mockResolvedValue([decoyCancellation]);
    balanceUtilsMocks.getByGroupOperations.mockResolvedValue([{
      operationId: 'operation-cancellation',
      status: 'committed',
      createdAt: 5,
      fromUserId: friendId,
      toUserId: currentUserId,
    }]);
  });

  it('reads the decoy plus cancellation as settled through calculateBalances', async () => {
    const { calculateBalances } = await import('@/services/balance-utils');
    const balances = await calculateBalances(groupId);

    expect(balances.get(currentUserId)).toBe(0);
    expect(balances.get(friendId)).toBe(0);
  });
});

describe('cancellation reversal netting', () => {
  it('negates when a reversal mirrors the original in calculateGroupBalances', () => {
    const balances = calculateGroupBalances(
      [
        { id: 'dinner', groupId, description: 'Dinner', amount: 31, currency: 'USD', paidBy: currentUserId, date: 1, createdAt: 1, updatedAt: 1 },
        { id: 'taxi', groupId, description: 'Taxi', amount: 10, currency: 'USD', paidBy: currentUserId, date: 2, createdAt: 2, updatedAt: 2 },
      ],
      [
        { id: 'split-dinner-current', expenseId: 'dinner', userId: currentUserId, amount: 15.5, splitType: 'equal' },
        { id: 'split-dinner-friend', expenseId: 'dinner', userId: friendId, amount: 15.5, splitType: 'equal' },
        { id: 'split-taxi-current', expenseId: 'taxi', userId: currentUserId, amount: 5, splitType: 'equal' },
        { id: 'split-taxi-friend', expenseId: 'taxi', userId: friendId, amount: 5, splitType: 'equal' },
      ],
      [
        {
          id: 'group-cash', groupId, fromUserId: friendId, toUserId: currentUserId,
          amount: 36, currency: 'USD', date: 4, createdAt: 4,
        },
      ],
      [],
      [
        cancellation({ id: 'cancellation-orig' }),
        cancellation({ id: 'cancellation-rev', isReversal: true, createdAt: 6 }),
      ],
    );

    expect(balances.get(currentUserId)).toBe(-15.5);
    expect(balances.get(friendId)).toBe(15.5);
  });

  it('negates reversals in the friend-detail netting', () => {
    const relationship = projectFriendRelationship({
      friend: { id: friendId, name: 'Friend', isActive: true, createdAt: 1, balance: 0 },
      expenses: [],
      activity: [],
      groupBalances: [{
        groupId, groupName: 'Decoy', currency: 'USD', amount: -15.5, direction: 'you_owe',
      }],
      cancellations: [
        cancellation({ id: 'cancellation-orig' }),
        cancellation({ id: 'cancellation-rev', isReversal: true, createdAt: 6 }),
      ],
    });

    expect(relationship.groupBalances).toMatchObject([{ groupId, amount: -15.5, direction: 'you_owe' }]);
  });
});

describe('cancellation operation projection', () => {
  it('groups a cancellation-only operation and marks the group affected', () => {
    const result = projectSettlementOperations({
      settlements: [],
      transfers: [],
      cancellations: [cancellation({ id: 'cancellation-1' })],
      operations: [{
        operationId: 'operation-cancellation',
        status: 'committed',
        createdAt: 5,
        requestedPaymentAmount: 9,
        currency: 'USD',
      }],
    });

    expect(result.operations).toHaveLength(1);
    const [projection] = result.operations;
    expect(projection.cancellations.map(row => row.id)).toEqual(['cancellation-1']);
    expect(projection.reversalCancellations).toEqual([]);
    expect(getGroupLocalCancellations(projection, groupId).map(row => row.id)).toEqual(['cancellation-1']);
    expect(getGroupLocalCancellations(projection, 'other-group')).toEqual([]);
    expect(operationAffectsGroup(projection, groupId)).toBe(true);
    expect(operationAffectsGroup(projection, 'other-group')).toBe(false);
    expect(projection.currency).toBe('USD');
  });

  it('folds compensating cancellation rows into deletion history', () => {
    const result = projectSettlementOperations({
      settlements: [],
      transfers: [],
      cancellations: [
        cancellation({ id: 'cancellation-orig' }),
        cancellation({ id: 'cancellation-rev', isReversal: true, createdAt: 6 }),
      ],
      operations: [{
        operationId: 'operation-cancellation',
        status: 'reversed',
        createdAt: 5,
        reversedAt: 6,
        currency: 'USD',
      }],
    });

    const [projection] = result.operations;
    expect(projection.cancellations.map(row => row.id)).toEqual(['cancellation-orig']);
    expect(projection.reversalCancellations.map(row => row.id)).toEqual(['cancellation-rev']);
    expect(projection.isDeleted).toBe(true);
  });
});

describe('cancellation row-carried operation pair (fix round 1)', () => {
  const otherExpense: Expense = {
    id: 'other-expense', groupId, description: 'Other', amount: 60, currency: 'USD',
    paidBy: otherId, date: 3, createdAt: 3, updatedAt: 3,
  };
  const otherSplits: ExpenseSplit[] = [
    ...decoySplits,
    { id: 'split-other-other', expenseId: 'other-expense', userId: otherId, amount: 30, splitType: 'equal' },
    { id: 'split-other-friend', expenseId: 'other-expense', userId: friendId, amount: 30, splitType: 'equal' },
  ];
  // Pre-cancellation ledger: current 20.5 - 36 = -15.5, friend -50.5 + 36 =
  // -14.5, other 30.
  const pairedCancellation = cancellation({
    id: 'cancellation-paired',
    actorUserId: currentUserId,
    friendUserId: friendId,
  });

  it('scopes a row-carried pair with no resolver so other members never change', () => {
    const balances = calculateGroupBalances(
      [...decoyExpenses, otherExpense],
      otherSplits,
      decoyCash,
      [],
      [pairedCancellation],
    );

    expect(balances.get(currentUserId)).toBe(0);
    expect(balances.get(friendId)).toBe(0);
    expect(balances.get(otherId)).toBe(30);
  });

  it('keeps the unscoped fallback for legacy rows without pair attribution', () => {
    const balances = calculateGroupBalances(
      [...decoyExpenses, otherExpense],
      otherSplits,
      decoyCash,
      [],
      [
        cancellation({ id: 'cancellation-paired-10', amount: 10, actorUserId: currentUserId, friendUserId: friendId }),
        cancellation({ id: 'cancellation-legacy', amount: 2 }),
      ],
    );

    // Paired 10 moves only current/friend (-15.5 -> -5.5, -14.5 -> -4.5);
    // the unattributed 2 still applies to every balance (documented
    // single-pair fallback).
    expect(balances.get(currentUserId)).toBe(-3.5);
    expect(balances.get(friendId)).toBe(-2.5);
    expect(balances.get(otherId)).toBe(28);
  });

  it('scopes through the group-detail read model with participant-less metadata and no siblings', () => {
    const model = buildGroupDetailReadModel({
      currentUserId,
      group: decoyGroup,
      expenses: [...decoyExpenses, otherExpense],
      members: [
        ...decoyMembers,
        { id: 'member-other', groupId, userId: otherId, role: 'member', joinedAt: 1 },
      ],
      users: [currentUser, friendUser, otherUser],
      userFriends: [],
      friendships: [],
      splits: otherSplits,
      settlements: [],
      scopeTransfers: [],
      cancellations: [pairedCancellation],
      // Group-reader-shaped metadata: lifecycle only, no participants — plus
      // no sibling cash/transfer rows, so only the row-carried pair resolves.
      settlementOperations: [{
        operationId: 'operation-cancellation',
        status: 'committed',
        createdAt: 5,
        groupId,
      }],
    });

    // Pre-cancellation ledger without the decoy cash: current 20.5,
    // friend -50.5, other 30; the 15.5 net moves only the pair.
    expect(model.balances.get(currentUserId)).toBe(5);
    expect(model.balances.get(friendId)).toBe(-35);
    expect(model.balances.get(otherId)).toBe(30);
  });
});

describe('cancellation group cache projection', () => {
  it('applies a receipt cancellation to the committing pair only', () => {
    const model = buildGroupDetailReadModel({
      currentUserId,
      group: decoyGroup,
      expenses: decoyExpenses,
      members: [
        ...decoyMembers,
        { id: 'member-other', groupId, userId: otherId, role: 'member', joinedAt: 1 },
      ],
      users: [currentUser, friendUser, otherUser],
      userFriends: [],
      friendships: [],
      splits: [
        ...decoySplits,
        { id: 'split-other', expenseId: 'taxi', userId: otherId, amount: 0, splitType: 'equal' },
      ],
      settlements: decoyCash,
    });

    const next = applyCancellationToGroupReadModel(
      model,
      decoyCancellation,
      () => [currentUserId, friendId],
    );

    expect(next.cancellations).toHaveLength(1);
    expect(next.balances.get(currentUserId)).toBe(0);
    expect(next.balances.get(friendId)).toBe(0);
    expect(applyCancellationToGroupReadModel(next, decoyCancellation)).toBe(next);
  });
});
