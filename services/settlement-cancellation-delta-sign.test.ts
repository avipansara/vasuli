import { describe, expect, it } from 'vitest';
import { settlementModule } from '@/services/settlement-service';
import { calculateGroupBalances } from '@/services/group-balance';

// Dedicated cancellation surface: the full-settlement planner emits one
// `{groupId, amount, currency}` entry per nonzero group residual. The commit
// captures the signed effect from the settled snapshot. The read-model checks below pin the frozen legacy
// transfer rows only and are decoupled from the planner.

const currentUserId = 'current-user';
const friendId = 'friend-a';

describe('cancellation planner shape', () => {
  it('keeps a pair cancellation fixed when later expenses stay or flip direction', () => {
    const groupId = 'three-person-group';
    const otherId = 'other-member';
    const balances = calculateGroupBalances(
      [
        { id: 'before', groupId, description: 'Before', amount: 10, currency: 'USD', paidBy: currentUserId, date: 1, createdAt: 1, updatedAt: 1 },
        { id: 'same-direction', groupId, description: 'Same direction', amount: 6, currency: 'USD', paidBy: currentUserId, date: 3, createdAt: 3, updatedAt: 3 },
        { id: 'opposite-direction', groupId, description: 'Opposite direction', amount: 20, currency: 'USD', paidBy: friendId, date: 4, createdAt: 4, updatedAt: 4 },
        { id: 'other-expense', groupId, description: 'Other member', amount: 9, currency: 'USD', paidBy: otherId, date: 5, createdAt: 5, updatedAt: 5 },
      ],
      [
        { id: 'before-a', expenseId: 'before', userId: currentUserId, amount: 0, splitType: 'exact' },
        { id: 'before-b', expenseId: 'before', userId: friendId, amount: 10, splitType: 'exact' },
        { id: 'before-other', expenseId: 'before', userId: otherId, amount: 0, splitType: 'exact' },
        { id: 'same-a', expenseId: 'same-direction', userId: currentUserId, amount: 3, splitType: 'exact' },
        { id: 'same-b', expenseId: 'same-direction', userId: friendId, amount: 3, splitType: 'exact' },
        { id: 'opposite-a', expenseId: 'opposite-direction', userId: currentUserId, amount: 10, splitType: 'exact' },
        { id: 'opposite-b', expenseId: 'opposite-direction', userId: friendId, amount: 10, splitType: 'exact' },
        { id: 'other-a', expenseId: 'other-expense', userId: currentUserId, amount: 3, splitType: 'exact' },
        { id: 'other-b', expenseId: 'other-expense', userId: friendId, amount: 3, splitType: 'exact' },
        { id: 'other-c', expenseId: 'other-expense', userId: otherId, amount: 3, splitType: 'exact' },
      ],
      [],
      [],
      [{ id: 'cancel-before', operationId: 'op-cancel', groupId, amount: 10, currency: 'USD', signedGroupBalanceDelta: -10, actorUserId: currentUserId, friendUserId: friendId, createdAt: 2 }],
      cancellation => [cancellation.actorUserId!, cancellation.friendUserId!],
    );

    expect(balances.get(currentUserId)).toBe(-10);
    expect(balances.get(friendId)).toBe(4);
    expect(balances.get(otherId)).toBe(6);
  });

  it('normalizes signed effects when cancellation operations have opposite actors', () => {
    const balances = calculateGroupBalances(
      [
        { id: 'seed-a', groupId: 'group-decoy', description: 'seed', amount: 0, currency: 'USD', paidBy: currentUserId, date: 0, createdAt: 0, updatedAt: 0 },
        { id: 'seed-b', groupId: 'group-decoy', description: 'seed', amount: 0, currency: 'USD', paidBy: friendId, date: 0, createdAt: 0, updatedAt: 0 },
      ], [], [], [], [
        { id: 'cancel-a', operationId: 'op-a', groupId: 'group-decoy', amount: 10, currency: 'USD', signedGroupBalanceDelta: -10, actorUserId: currentUserId, friendUserId: friendId, createdAt: 1 },
        { id: 'cancel-b', operationId: 'op-b', groupId: 'group-decoy', amount: 4, currency: 'USD', signedGroupBalanceDelta: 4, actorUserId: friendId, friendUserId: currentUserId, createdAt: 2 },
      ],
      cancellation => [cancellation.actorUserId!, cancellation.friendUserId!],
    );

    expect(balances.get(currentUserId)).toBe(-14);
    expect(balances.get(friendId)).toBe(14);
  });

  it('uses row actor attribution when the resolver pair starts with the cash payer', () => {
    const balances = calculateGroupBalances(
      [
        { id: 'seed-a', groupId: 'group-decoy', description: 'seed', amount: 0, currency: 'USD', paidBy: currentUserId, date: 0, createdAt: 0, updatedAt: 0 },
        { id: 'seed-b', groupId: 'group-decoy', description: 'seed', amount: 0, currency: 'USD', paidBy: friendId, date: 0, createdAt: 0, updatedAt: 0 },
      ], [], [], [], [
        { id: 'cancel', operationId: 'op', groupId: 'group-decoy', amount: 5, currency: 'USD', signedGroupBalanceDelta: -5, actorUserId: currentUserId, friendUserId: friendId, createdAt: 1 },
      ],
      // Cash payer/payee order is the reverse of operation actor/friend.
      () => [friendId, currentUserId],
    );

    expect(balances.get(currentUserId)).toBe(-5);
    expect(balances.get(friendId)).toBe(5);
  });

  it('emits a participant-free cancellation for a receivable-like residual', () => {
    const plan = settlementModule.preview({
      currentUserId,
      friendId,
      currency: 'USD',
      amount: 12,
      directBalance: -22,
      groupBalances: [
        { groupId: 'trip', groupName: 'Trip', currency: 'USD', amount: 10, direction: 'you_are_owed' },
      ],
    });

    expect(plan.cancellations).toHaveLength(1);
    expect(plan.cancellations).toEqual([
      { groupId: 'trip', amount: 10, currency: 'USD' },
    ]);
  });

  it('emits a participant-free cancellation for a debt-like residual', () => {
    const plan = settlementModule.preview({
      currentUserId,
      friendId,
      currency: 'USD',
      amount: 10,
      directBalance: 25.5,
      groupBalances: [
        { groupId: 'group-decoy', groupName: 'Decoy', currency: 'USD', amount: -15.5, direction: 'you_owe' },
      ],
    });

    expect(plan.cancellations).toHaveLength(1);
    expect(plan.cancellations).toEqual([
      { groupId: 'group-decoy', amount: 15.5, currency: 'USD' },
    ]);
  });

  it('reads the decoy-shaped legacy transfer row as settled for both parties', () => {
    const balances = calculateGroupBalances(
      [
        { id: 'dinner', groupId: 'group-decoy', description: 'Dinner', amount: 31, currency: 'USD', paidBy: currentUserId, date: 1, createdAt: 1, updatedAt: 1 },
        { id: 'taxi', groupId: 'group-decoy', description: 'Taxi', amount: 10, currency: 'USD', paidBy: currentUserId, date: 2, createdAt: 2, updatedAt: 2 },
      ],
      [
        { id: 'split-dinner-current', expenseId: 'dinner', userId: currentUserId, amount: 15.5, splitType: 'equal' },
        { id: 'split-dinner-friend', expenseId: 'dinner', userId: friendId, amount: 15.5, splitType: 'equal' },
        { id: 'split-taxi-current', expenseId: 'taxi', userId: currentUserId, amount: 5, splitType: 'equal' },
        { id: 'split-taxi-friend', expenseId: 'taxi', userId: friendId, amount: 5, splitType: 'equal' },
      ],
      [
        {
          id: 'group-cash',
          groupId: 'group-decoy',
          fromUserId: friendId,
          toUserId: currentUserId,
          amount: 36,
          currency: 'USD',
          date: 4,
          createdAt: 4,
        },
      ],
      [
        {
          id: 'transfer-cancellation',
          operationId: 'operation-cancellation',
          groupId: 'group-decoy',
          fromUserId: friendId,
          toUserId: currentUserId,
          currency: 'USD',
          signedGroupBalanceDelta: -15.5,
          createdAt: 3,
        },
      ],
    );

    expect(balances.get(currentUserId)).toBe(0);
    expect(balances.get(friendId)).toBe(0);
  });

  it('inflates to the ticket-09 symptom when the decoy sign is flipped positive', () => {
    const balances = calculateGroupBalances(
      [
        { id: 'dinner', groupId: 'group-decoy', description: 'Dinner', amount: 31, currency: 'USD', paidBy: currentUserId, date: 1, createdAt: 1, updatedAt: 1 },
        { id: 'taxi', groupId: 'group-decoy', description: 'Taxi', amount: 10, currency: 'USD', paidBy: currentUserId, date: 2, createdAt: 2, updatedAt: 2 },
      ],
      [
        { id: 'split-dinner-current', expenseId: 'dinner', userId: currentUserId, amount: 15.5, splitType: 'equal' },
        { id: 'split-dinner-friend', expenseId: 'dinner', userId: friendId, amount: 15.5, splitType: 'equal' },
        { id: 'split-taxi-current', expenseId: 'taxi', userId: currentUserId, amount: 5, splitType: 'equal' },
        { id: 'split-taxi-friend', expenseId: 'taxi', userId: friendId, amount: 5, splitType: 'equal' },
      ],
      [
        {
          id: 'group-cash',
          groupId: 'group-decoy',
          fromUserId: friendId,
          toUserId: currentUserId,
          amount: 36,
          currency: 'USD',
          date: 4,
          createdAt: 4,
        },
      ],
      [
        {
          id: 'transfer-flipped',
          operationId: 'operation-flipped',
          groupId: 'group-decoy',
          fromUserId: friendId,
          toUserId: currentUserId,
          currency: 'USD',
          signedGroupBalanceDelta: 15.5,
          createdAt: 3,
        },
      ],
    );

    expect(balances.get(currentUserId)).toBeCloseTo(-31, 2);
    expect(balances.get(friendId)).toBeCloseTo(31, 2);
  });
});
