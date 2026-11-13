import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GroupDetailReadModel } from './group-detail-read-model';

const { commit } = vi.hoisted(() => ({ commit: vi.fn() }));
vi.mock('./settlement-service', async importOriginal => {
  const actual = await importOriginal<typeof import('./settlement-service')>();
  return { ...actual, settlementService: { ...actual.settlementService, commit } };
});

import { buildGroupSettlementCommitRequest, commitGroupSettlement } from './group-settlement-commit';
import { buildGroupSettlementOperationActivity, canDeleteGroupOperation } from './group-settlement-operation-view';

describe('buildGroupSettlementCommitRequest (ticket 03 corrective)', () => {
  beforeEach(() => {
    commit.mockReset();
  });

  it('builds a group-only operation commit (no transfers, single group allocation)', () => {
    const request = buildGroupSettlementCommitRequest({
      paymentIntentId: 'intent-group-1',
      friendId: 'user-avee',
      groupId: 'group-1',
      amount: 10,
      currency: 'USD',
      date: 1,
      expectedBalance: 25,
      fromUserId: 'user-avee',
      toUserId: 'user-you',
    });

    expect(request).toMatchObject({
      paymentIntentId: 'intent-group-1',
      friendId: 'user-avee',
      groupId: 'group-1',
      mode: 'group',
      amount: 10,
      currency: 'USD',
      expectedBalance: 25,
    });
    expect(request.allocations).toHaveLength(1);
    expect(request.allocations[0]).toMatchObject({
      groupId: 'group-1',
      fromUserId: 'user-avee',
      toUserId: 'user-you',
      amount: 10,
      currency: 'USD',
    });
  });

  it('keeps the idempotency key on the request (reused intents return the original receipt)', () => {
    const first = buildGroupSettlementCommitRequest({
      paymentIntentId: 'same-intent',
      friendId: 'user-avee',
      groupId: 'group-1',
      amount: 10,
      currency: 'USD',
      date: 1,
      expectedBalance: 25,
      fromUserId: 'user-avee',
      toUserId: 'user-you',
    });
    const second = buildGroupSettlementCommitRequest({
      paymentIntentId: 'same-intent',
      friendId: 'user-avee',
      groupId: 'group-1',
      amount: 10,
      currency: 'USD',
      date: 2,
      expectedBalance: 25,
      fromUserId: 'user-avee',
      toUserId: 'user-you',
    });
    expect(second.paymentIntentId).toBe(first.paymentIntentId);
  });

  it('rejects cross-scope or empty group commits (group creation stays group-only)', () => {
    expect(() =>
      buildGroupSettlementCommitRequest({
        paymentIntentId: 'intent-x',
        friendId: 'user-avee',
        groupId: '',
        amount: 10,
        currency: 'USD',
        date: 1,
        expectedBalance: 25,
        fromUserId: 'user-avee',
        toUserId: 'user-you',
      }),
    ).toThrow();
    expect(() =>
      buildGroupSettlementCommitRequest({
        paymentIntentId: 'intent-x',
        friendId: 'user-avee',
        groupId: 'group-1',
        amount: 0,
        currency: 'USD',
        date: 1,
        expectedBalance: 25,
        fromUserId: 'user-avee',
        toUserId: 'user-you',
      }),
    ).toThrow();
  });
});

describe('group create-to-read-to-delete (ticket 03 corrective)', () => {
  const t0 = Date.parse('2026-08-20T12:00:00.000Z');
  const groupId = 'group-1';
  const you = 'user-you';
  const avee = 'user-avee';
  const outsider = 'user-outsider';

  it('committed group cash reads as one deletable activity for both participants only', () => {
    const committed = {
      id: 's-new',
      operationId: 'op-new',
      groupId,
      fromUserId: avee,
      toUserId: you,
      amount: 10,
      currency: 'USD',
      date: t0,
      createdAt: t0,
    };
    const result = buildGroupSettlementOperationActivity({
      settlements: [committed],
      scopeTransfers: [],
      operations: [{ operationId: 'op-new', status: 'committed', createdAt: t0 } as const],
      groupId,
      currentUserId: you,
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].operationId).toBe('op-new');
    // Both settlement participants can Delete the whole operation.
    expect(canDeleteGroupOperation(result.operations[0], groupId, you)).toBe(true);
    expect(canDeleteGroupOperation(result.operations[0], groupId, avee)).toBe(true);
    // A non-participant group member sees history with no destructive action.
    expect(canDeleteGroupOperation(result.operations[0], groupId, outsider)).toBe(false);
  });

  it('group view never exposes private cross-scope cash, direct balances, or other groups', () => {
    // Production group reads return only this group's rows (getByGroup) plus
    // group-local lifecycle metadata (never requestedPaymentAmount). A $7 net
    // friendship payment made outside this group is therefore invisible here:
    // this group only carries its $8 adjustment.
    const result = buildGroupSettlementOperationActivity({
      settlements: [],
      scopeTransfers: [
        {
          id: 't-local',
          operationId: 'op-net',
          groupId,
          fromUserId: avee,
          toUserId: you,
          currency: 'USD',
          signedGroupBalanceDelta: -8,
          createdAt: t0,
        },
      ],
      operations: [{ operationId: 'op-net', status: 'committed', createdAt: t0 } as const],
      groupId,
      currentUserId: outsider,
    });

    expect(result.operations).toHaveLength(1);
    const projection = result.operations[0];
    // Group-local view is a clearing: no payment wording, no private $7 total.
    // With transfers visible but no cash rows and no authoritative total, the
    // operation stays cash-unknown (never a false zero-payment).
    expect(projection.authoritativeCashTotal).toBeUndefined();
    expect(projection.hasKnownPayment).toBe(false);
    expect(projection.isZeroPayment).toBe(false);
    expect(projection.cashUnknown).toBe(true);
    expect(canDeleteGroupOperation(projection, groupId, outsider)).toBe(false);
  });

  it('truly historical legacy payments stay readable with no operation Delete', () => {
    const legacy = {
      id: 's-legacy',
      operationId: undefined,
      groupId,
      fromUserId: avee,
      toUserId: you,
      amount: 12,
      currency: 'USD',
      date: t0,
      createdAt: t0,
    };
    const result = buildGroupSettlementOperationActivity({
      settlements: [legacy],
      scopeTransfers: [],
      groupId,
      currentUserId: you,
    });
    expect(result.operations).toHaveLength(0);
    expect(result.legacySettlements).toEqual([legacy]);
  });
});

describe('commitGroupSettlement (ticket 03 corrective)', () => {
  const t0 = Date.parse('2026-08-20T12:00:00.000Z');
  beforeEach(() => {
    commit.mockReset();
  });

  function queryClient() {
    return {
      invalidateQueries: vi.fn(async () => undefined),
      setQueryData: vi.fn(),
    };
  }

  it('commits through the existing group-mode boundary with the same payment intent', async () => {
    const qc = queryClient();
    commit.mockResolvedValueOnce({
      paymentIntentId: 'same-intent',
      reused: false,
      committedAt: t0,
      totalAmount: 10,
      currency: 'USD',
      direction: 'friend_paid_you',
      settlements: [{
        id: 's-new',
        operationId: 'op-new',
        groupId: 'group-1',
        fromUserId: 'user-avee',
        toUserId: 'user-you',
        amount: 10,
        currency: 'USD',
        date: t0,
        createdAt: t0,
      }],
      operationId: 'op-new',
      mode: 'group',
      affectedGroupIds: ['group-1'],
      transfers: [],
    });

    const receipt = await commitGroupSettlement({
      paymentIntentId: 'same-intent',
      friendId: 'user-avee',
      groupId: 'group-1',
      amount: 10,
      currency: 'USD',
      date: t0,
      expectedBalance: 25,
      fromUserId: 'user-avee',
      toUserId: 'user-you',
      currentUserId: 'user-you',
      friend: { id: 'user-avee', name: 'Avee', isActive: true, createdAt: 1 },
      currentUser: { id: 'user-you', name: 'You', isActive: true, createdAt: 1 },
      queryClient: qc,
    });

    expect(receipt.operationId).toBe('op-new');
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      paymentIntentId: 'same-intent',
      mode: 'group',
      groupId: 'group-1',
    }));
    // Single group-local allocation only: no direct/other-group cash leaves the group.
    const sent = commit.mock.calls[0]?.[0] as { allocations: { groupId?: string }[] };
    expect(sent.allocations).toHaveLength(1);
    expect(sent.allocations[0]?.groupId).toBe('group-1');
    // Friend, Home, Group detail, and pair-total caches are refreshed.
    const invalidated = qc.invalidateQueries.mock.calls.map(call => (call as unknown as [{ queryKey: unknown }])[0].queryKey);
    expect(invalidated).toContainEqual(['friends', 'home', 'user-you']);
    expect(invalidated).toContainEqual(['friends', 'detail', 'user-you', 'user-avee']);
    expect(invalidated).toContainEqual(['groups', 'detail', 'user-you', 'group-1']);
    expect(invalidated).toContainEqual(['groups', 'pair-totals', 'user-you', 'group-1']);
  });

  it('returns a reused receipt for the same payment intent without duplicating work', async () => {
    const qc = queryClient();
    commit.mockResolvedValueOnce({
      paymentIntentId: 'same-intent',
      reused: true,
      committedAt: t0,
      totalAmount: 10,
      currency: 'USD',
      direction: 'friend_paid_you',
      settlements: [],
      operationId: 'op-new',
      mode: 'group',
      affectedGroupIds: ['group-1'],
      transfers: [],
    });

    const receipt = await commitGroupSettlement({
      paymentIntentId: 'same-intent',
      friendId: 'user-avee',
      groupId: 'group-1',
      amount: 10,
      currency: 'USD',
      date: t0,
      expectedBalance: 25,
      fromUserId: 'user-avee',
      toUserId: 'user-you',
      currentUserId: 'user-you',
      friend: { id: 'user-avee', name: 'Avee', isActive: true, createdAt: 1 },
      currentUser: { id: 'user-you', name: 'You', isActive: true, createdAt: 1 },
      queryClient: qc,
    });

    expect(receipt.reused).toBe(true);
    expect(receipt.operationId).toBe('op-new');
  });

  it('keeps group creation group-only while folding receipt cancellations into the group cache', async () => {
    const qc = queryClient();
    commit.mockResolvedValueOnce({
      paymentIntentId: 'intent-cancel',
      reused: false,
      committedAt: t0,
      totalAmount: 10,
      currency: 'USD',
      direction: 'friend_paid_you',
      settlements: [],
      operationId: 'op-cancel',
      mode: 'group',
      affectedGroupIds: ['group-1'],
      transfers: [],
      cancellations: [{
        id: 'c-1',
        operationId: 'op-cancel',
        groupId: 'group-1',
        amount: 8,
        currency: 'USD',
        createdAt: t0,
      }],
    });

    await commitGroupSettlement({
      paymentIntentId: 'intent-cancel',
      friendId: 'user-avee',
      groupId: 'group-1',
      amount: 10,
      currency: 'USD',
      date: t0,
      expectedBalance: 25,
      fromUserId: 'user-avee',
      toUserId: 'user-you',
      currentUserId: 'user-you',
      friend: { id: 'user-avee', name: 'Avee', isActive: true, createdAt: 1 },
      currentUser: { id: 'user-you', name: 'You', isActive: true, createdAt: 1 },
      queryClient: qc,
    });

    // Group-only creation: one allocation in this group, never a cancellation payload.
    const sent = commit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.allocations).toHaveLength(1);
    expect(sent).not.toHaveProperty('cancellations');

    // The receipt cancellation still folds into the group read-model cache.
    const setDataCall = qc.setQueryData.mock.calls.find(call => {
      const key = (call as unknown[])[0] as readonly unknown[];
      return key.includes('group-1');
    });
    expect(setDataCall).toBeTruthy();
    const seed = {
      expenses: [],
      members: [],
      settlements: [],
      scopeTransfers: [],
      cancellations: [],
      settlementOperations: [],
      balances: new Map<string, number>(),
    } as unknown as GroupDetailReadModel;
    const updater = (setDataCall as unknown[])[1] as (current: GroupDetailReadModel | undefined) => GroupDetailReadModel | null;
    const next = updater(seed);
    expect(next?.cancellations.map(row => row.id)).toEqual(['c-1']);
  });
});
