import { describe, expect, it, vi } from 'vitest';
import { CombinedSettlementError } from '@/services/settlement-service';
import type { FriendActivityItem, FriendDetailData } from '@/services/friend-detail-service';
import type { SettlementOperationStatusRecord } from '@/services/settlement-operation-projection';
import {
  SETTLEMENT_ALREADY_DELETED_COPY,
  SETTLEMENT_DELETE_LOAD_ERROR_COPY,
  SettlementAlreadyDeletedError,
  SettlementDeleteLoadError,
  buildSettlementDeleteInvalidationKeys,
  classifySettlementDeleteError,
  executeSettlementDelete,
  getPostDeleteRefreshFailureCopy,
  getSettlementDeleteConfirmationCopy,
  getSettlementDeleteSuccessCopy,
  loadSettlementDeleteConfirmationDetails,
} from '@/services/settlement-delete-flow';

describe('settlement delete confirmation copy', () => {
  it('uses the spec payment title and body with the original cash amount', () => {
    expect(getSettlementDeleteConfirmationCopy({
      kind: 'payment',
      paymentAmountText: '$7.00',
      friendName: 'Avee',
    })).toEqual({
      title: 'Delete settlement?',
      body: 'Delete the $7.00 payment between you and Avee? '
        + 'This also undoes any linked balance adjustments, including in other groups. '
        + 'Only the changes from this settlement will be undone. History will remain visible.',
    });
  });

  it('uses the spec zero-payment title and body', () => {
    expect(getSettlementDeleteConfirmationCopy({
      kind: 'clearing',
      friendName: 'Avee',
    })).toEqual({
      title: 'Delete balance clearing?',
      body: 'Undo the balance clearing with Avee? No payment was made. '
        + 'This also undoes linked balance adjustments, including in other groups. '
        + 'Only the changes from this settlement will be undone. History will remain visible.',
    });
  });

  it('falls back to a neutral name when no friend name is available', () => {
    const payment = getSettlementDeleteConfirmationCopy({ kind: 'payment', paymentAmountText: '$7.00' });
    expect(payment.body).toContain('between you and your friend?');

    const clearing = getSettlementDeleteConfirmationCopy({ kind: 'clearing', friendName: '   ' });
    expect(clearing.body).toContain('with your friend?');
  });

  it('reports success without promising an old numeric balance', () => {
    expect(getSettlementDeleteSuccessCopy('payment')).toEqual({
      title: 'Settlement deleted',
      body: 'The changes from this settlement were undone.',
    });
    expect(getSettlementDeleteSuccessCopy('clearing')).toEqual({
      title: 'Balance clearing deleted',
      body: 'The changes from this settlement were undone.',
    });
  });

  it('reports an already-deleted receipt distinctly from success', () => {
    expect(SETTLEMENT_ALREADY_DELETED_COPY.title).toBe('Already deleted');
    expect(SETTLEMENT_ALREADY_DELETED_COPY.body).not.toContain('revers');
  });

  it('keeps a retryable load error distinct from delete failures', () => {
    expect(SETTLEMENT_DELETE_LOAD_ERROR_COPY.title).toBe('Unable to load settlement');
    expect(SETTLEMENT_DELETE_LOAD_ERROR_COPY.body.length).toBeGreaterThan(0);
  });

  it('keeps post-success refresh failure successful without implying another delete', () => {
    const copy = getPostDeleteRefreshFailureCopy('payment');
    expect(copy.title).toBe('Settlement deleted');
    expect(copy.body).toContain('The settlement was deleted');
    expect(copy.body).not.toMatch(/delete it again|another deletion|try deleting/i);

    const clearing = getPostDeleteRefreshFailureCopy('clearing');
    expect(clearing.title).toBe('Balance clearing deleted');
  });
});

describe('classifySettlementDeleteError', () => {
  it('asks for refresh on the first stale rejection and requires a new confirmation', () => {
    expect(classifySettlementDeleteError(
      new CombinedSettlementError('stale_balance', 'This balance changed. Refresh and try again.'),
      0,
    )).toEqual({
      kind: 'stale_refresh',
      title: 'Balance changed',
      body: 'Refresh and try again.',
      retryable: true,
    });
  });

  it('ends the loop after the refreshed retry is still rejected', () => {
    const outcome = classifySettlementDeleteError(
      new CombinedSettlementError('stale_balance', 'This balance changed. Refresh and try again.'),
      1,
    );
    expect(outcome.kind).toBe('stale_final');
    expect(outcome.title).toBe('Unable to delete');
    expect(outcome.body).toContain('cannot be deleted with the current balances');
    expect(outcome.retryable).toBe(false);
  });

  it('maps permission failures without internal reversal wording', () => {
    const outcome = classifySettlementDeleteError(
      new CombinedSettlementError('unauthorized', 'Only the people in this settlement can reverse it.'),
    );
    expect(outcome).toEqual({
      kind: 'permission',
      title: 'Unable to delete',
      body: 'Only the people in this settlement can delete it.',
      retryable: false,
    });
  });

  it('maps offline failures with a retry path', () => {
    const outcome = classifySettlementDeleteError(new Error('Network request failed'));
    expect(outcome.kind).toBe('offline');
    expect(outcome.title).toBe('Unable to delete');
    expect(outcome.body).toMatch(/offline/i);
    expect(outcome.retryable).toBe(true);
  });

  it('maps unexpected failures without reversal or ledger wording', () => {
    const outcome = classifySettlementDeleteError(new Error('Something exploded'));
    expect(outcome.kind).toBe('unexpected');
    expect(outcome.title).toBe('Unable to delete');
    expect(`${outcome.title} ${outcome.body}`).not.toMatch(/revers|ledger/i);
  });

  it('treats a missing operation as already deleted so no second delete is attempted', () => {
    const outcome = classifySettlementDeleteError(
      new CombinedSettlementError('invalid_input', 'This settlement operation no longer exists.'),
    );
    expect(outcome.kind).toBe('already_deleted');
    expect(outcome.title).toBe('Already deleted');
  });

  it('never leaks internal wording through any classified failure', () => {
    const samples = [
      new CombinedSettlementError('unauthorized', 'SETTLEMENT_REVERSAL_UNAUTHORIZED'),
      new CombinedSettlementError('transient', 'The payment could not be confirmed. Please retry.'),
      new CombinedSettlementError('conflict', 'This settlement operation cannot be reversed.'),
      new Error('fetch failed'),
      new Error('boom'),
    ];
    for (const error of samples) {
      const outcome = classifySettlementDeleteError(error, 0);
      expect(`${outcome.title} ${outcome.body}`).not.toMatch(/revers|ledger/i);
    }
  });
});

describe('loadSettlementDeleteConfirmationDetails', () => {
  const currentUserId = 'user-you';
  const friendId = 'user-avee';
  const t0 = Date.parse('2026-08-20T12:00:00.000Z');

  function operationRecord(overrides: Partial<SettlementOperationStatusRecord> = {}): SettlementOperationStatusRecord {
    return {
      operationId: 'op-1',
      status: 'committed',
      createdAt: t0,
      requestedPaymentAmount: 7,
      currency: 'USD',
      ...overrides,
    };
  }

  function detailWith(options: {
    activity: FriendActivityItem[];
    operations?: SettlementOperationStatusRecord[];
    totalsAmount?: number;
    cancellations?: FriendDetailData['cancellations'];
    groupBalances?: FriendDetailData['groupBalances'];
  }): FriendDetailData {
    return {
      friend: { id: friendId, name: 'Avee', balance: 5, isActive: true, createdAt: t0 },
      expenses: [],
      activity: options.activity,
      ...(options.operations ? { settlementOperations: options.operations } : {}),
      ...(options.cancellations ? { cancellations: options.cancellations } : {}),
      ...(options.groupBalances ? { groupBalances: options.groupBalances } : {}),
      relationship: {
        directBalance: 5,
        groupBalances: [],
        activity: options.activity,
        totalsByCurrency: [{ currency: 'USD', amount: options.totalsAmount ?? 5, direction: 'you_are_owed' }],
      },
    } as unknown as FriendDetailData;
  }

  function paymentActivity(): FriendActivityItem[] {
    return [
      {
        id: 'settlement:s-1',
        type: 'settlement',
        date: t0,
        settlementId: 's-1',
        operationId: 'op-1',
        amount: 7,
        currency: 'USD',
        direction: 'friend_paid_you',
      },
      {
        id: 'scope-transfer:t-1',
        type: 'scope_transfer',
        date: t0,
        transferId: 't-1',
        operationId: 'op-1',
        groupId: 'group-1',
        groupName: 'Trip',
        amount: 8,
        currency: 'USD',
        fromUserId: friendId,
        toUserId: currentUserId,
        direction: 'you_paid_friend',
      },
    ];
  }

  function clearingActivity(): FriendActivityItem[] {
    return [
      {
        id: 'scope-transfer:t-1',
        type: 'scope_transfer',
        date: t0,
        transferId: 't-1',
        operationId: 'op-1',
        groupId: 'group-1',
        groupName: 'Trip',
        amount: 8,
        currency: 'USD',
        fromUserId: friendId,
        toUserId: currentUserId,
        direction: 'you_paid_friend',
      },
    ];
  }

  it('loads the original operation cash, never the clicked adjustment amount', async () => {
    const getDetail = vi.fn(async () => detailWith({ activity: paymentActivity(), operations: [operationRecord()] }));
    const details = await loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      friendName: 'Avee',
      getDetail,
    });

    expect(getDetail).toHaveBeenCalledWith(currentUserId, friendId);
    expect(details.kind).toBe('payment');
    expect(details.paymentAmount).toBe(7);
    expect(details.paymentAmountText).toBe('$7.00');
    expect(details.currency).toBe('USD');
    expect(details.friendDisplayName).toBe('Avee');
    expect(details.expectedBalance).toBe(5);
    expect(details.friendId).toBe(friendId);
  });

  it('loads zero-payment clearings without inventing a cash amount', async () => {
    const getDetail = vi.fn(async () => detailWith({
      activity: clearingActivity(),
      operations: [operationRecord({ requestedPaymentAmount: 0 })],
    }));
    const details = await loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      friendName: 'Avee',
      getDetail,
    });

    expect(details.kind).toBe('clearing');
    expect(details.paymentAmount).toBe(0);
  });

  it('names every cleared balance undone by the Delete', async () => {
    const getDetail = vi.fn(async () => detailWith({
      activity: paymentActivity(),
      operations: [operationRecord()],
      cancellations: [
        { id: 'c-1', operationId: 'op-1', groupId: 'group-1', amount: 10, currency: 'USD', createdAt: t0 },
        { id: 'c-2', operationId: 'op-1', groupId: 'group-2', amount: 3, currency: 'USD', createdAt: t0 },
      ],
      groupBalances: [
        { groupId: 'group-1', groupName: 'Trip', currency: 'USD', amount: 0, direction: 'settled' },
        { groupId: 'group-2', groupName: 'Roommates', currency: 'USD', amount: 0, direction: 'settled' },
      ],
    }));
    const details = await loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      friendName: 'Avee',
      getDetail,
    });

    expect(details.clearedBalances).toEqual([
      { groupId: 'group-1', groupName: 'Trip', amount: 10, currency: 'USD', amountText: '$10.00' },
      { groupId: 'group-2', groupName: 'Roommates', amount: 3, currency: 'USD', amountText: '$3.00' },
    ]);
    const copy = getSettlementDeleteConfirmationCopy({
      kind: details.kind,
      paymentAmountText: details.paymentAmountText,
      friendName: details.friendDisplayName,
      clearedBalances: details.clearedBalances,
    });
    expect(copy.title).toBe('Delete settlement?');
    expect(copy.body).toContain('Delete the $7.00 payment between you and Avee?');
    expect(copy.body).toContain('Cleared balances will be restored: Trip ($10.00), Roommates ($3.00).');
    expect(copy.body).not.toMatch(/revers|ledger|transfer/i);
  });

  it('names cleared balances on clearing confirmations without inventing cash', async () => {
    const getDetail = vi.fn(async () => detailWith({
      activity: clearingActivity(),
      operations: [operationRecord({ requestedPaymentAmount: 0 })],
      cancellations: [
        { id: 'c-1', operationId: 'op-1', groupId: 'group-1', amount: 8, currency: 'USD', createdAt: t0 },
      ],
      groupBalances: [
        { groupId: 'group-1', groupName: 'Trip', currency: 'USD', amount: 0, direction: 'settled' },
      ],
    }));
    const details = await loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      friendName: 'Avee',
      getDetail,
    });

    expect(details.kind).toBe('clearing');
    expect(details.paymentAmount).toBe(0);
    expect(details.clearedBalances).toHaveLength(1);
    const copy = getSettlementDeleteConfirmationCopy({
      kind: details.kind,
      friendName: details.friendDisplayName,
      clearedBalances: details.clearedBalances,
    });
    expect(copy.body).toContain('No payment was made.');
    expect(copy.body).toContain('Cleared balances will be restored: Trip ($8.00).');
  });

  it('leaves the confirmation copy unchanged when nothing was cleared', () => {
    expect(getSettlementDeleteConfirmationCopy({
      kind: 'payment',
      paymentAmountText: '$7.00',
      friendName: 'Avee',
      clearedBalances: [],
    }).body).toBe(
      'Delete the $7.00 payment between you and Avee? '
        + 'This also undoes any linked balance adjustments, including in other groups. '
        + 'Only the changes from this settlement will be undone. History will remain visible.',
    );
  });

  it('falls back to a neutral name when the friend name is unavailable', async () => {
    const getDetail = vi.fn(async () => detailWith({ activity: paymentActivity(), operations: [operationRecord()] }));
    const details = await loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      getDetail,
    });
    expect(details.friendDisplayName).toBe('your friend');
  });

  it('throws a retryable error when the authorized read is unloadable', async () => {
    await expect(loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      getDetail: vi.fn(async () => null),
    })).rejects.toBeInstanceOf(SettlementDeleteLoadError);

    await expect(loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      getDetail: vi.fn(async () => { throw new Error('Network request failed'); }),
    })).rejects.toBeInstanceOf(SettlementDeleteLoadError);
  });

  it('throws a retryable error when the operation is missing instead of guessing', async () => {
    const getDetail = vi.fn(async () => detailWith({ activity: paymentActivity(), operations: [operationRecord()] }));
    await expect(loadSettlementDeleteConfirmationDetails({
      operationId: 'op-unknown',
      currency: 'USD',
      friendId,
      currentUserId,
      getDetail,
    })).rejects.toBeInstanceOf(SettlementDeleteLoadError);
  });

  it('reports an already-deleted operation instead of confirming again', async () => {
    const getDetail = vi.fn(async () => detailWith({
      activity: paymentActivity(),
      operations: [operationRecord({ status: 'reversed', reversedAt: t0 + 1000 })],
    }));
    await expect(loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      getDetail,
    })).rejects.toBeInstanceOf(SettlementAlreadyDeletedError);
  });

  it('defaults the expected balance to zero when the currency total is missing', async () => {
    const detail = detailWith({ activity: paymentActivity(), operations: [operationRecord()], totalsAmount: 5 });
    detail.relationship.totalsByCurrency = [];
    const getDetail = vi.fn(async () => detail);
    const details = await loadSettlementDeleteConfirmationDetails({
      operationId: 'op-1',
      currency: 'USD',
      friendId,
      currentUserId,
      getDetail,
    });
    expect(details.expectedBalance).toBe(0);
  });
});

describe('executeSettlementDelete', () => {
  const currentUserId = 'user-you';
  const friendId = 'user-avee';

  function createQueryClient() {
    return {
      invalidateQueries: vi.fn(async (_options: unknown) => undefined),
      setQueryData: vi.fn(),
    };
  }

  it('reverses through the existing boundary with operation ID plus expected balance', async () => {
    const queryClient = createQueryClient();
    const reverse = vi.fn(async () => ({
      operationId: 'op-1',
      status: 'reversed' as const,
      reversedAt: 1,
      reused: false,
    }));

    const receipt = await executeSettlementDelete({
      operationId: 'op-1',
      expectedBalance: 5,
      currentUserId,
      friendId,
      groupId: 'group-1',
      reverse,
      queryClient,
    });

    expect(receipt).toEqual({ operationId: 'op-1', status: 'reversed', reversedAt: 1, reused: false });
    expect(reverse).toHaveBeenCalledWith({
      operationId: 'op-1',
      expectedBalance: 5,
      currentUserId,
      friendId,
      queryClient,
    });
  });

  it('passes reused receipts through for Already deleted handling', async () => {
    const queryClient = createQueryClient();
    const reverse = vi.fn(async () => ({
      operationId: 'op-1',
      status: 'reversed' as const,
      reversedAt: 1,
      reused: true,
    }));
    const receipt = await executeSettlementDelete({
      operationId: 'op-1',
      expectedBalance: 5,
      currentUserId,
      friendId,
      reverse,
      queryClient,
    });
    expect(receipt.reused).toBe(true);
  });

  it('invalidates Friend, Home, Group detail, and pair totals after deletion', async () => {
    const queryClient = createQueryClient();
    const reverse = vi.fn(async () => ({
      operationId: 'op-1',
      status: 'reversed' as const,
      reversedAt: 1,
      reused: false,
    }));
    await executeSettlementDelete({
      operationId: 'op-1',
      expectedBalance: 5,
      currentUserId,
      friendId,
      groupId: 'group-1',
      reverse,
      queryClient,
    });

    const invalidated = queryClient.invalidateQueries.mock.calls.map(call => (call[0] as { queryKey: unknown }).queryKey);
    expect(invalidated).toContainEqual(['friends', 'home', currentUserId]);
    expect(invalidated).toContainEqual(['friends', 'detail', currentUserId, friendId]);
    expect(invalidated).toContainEqual(['groups', 'list', currentUserId]);
    expect(invalidated).toContainEqual(['groups', 'detail', currentUserId, 'group-1']);
    expect(invalidated).toContainEqual(['groups', 'pair-totals', currentUserId, 'group-1']);
  });

  it('propagates stale failures without invalidating caches', async () => {
    const queryClient = createQueryClient();
    const staleError = new CombinedSettlementError('stale_balance', 'This balance changed. Refresh and try again.');
    const reverse = vi.fn(async () => { throw staleError; });

    await expect(executeSettlementDelete({
      operationId: 'op-1',
      expectedBalance: 5,
      currentUserId,
      friendId,
      groupId: 'group-1',
      reverse,
      queryClient,
    })).rejects.toBe(staleError);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('stays successful when post-delete invalidation fails', async () => {
    const queryClient = createQueryClient();
    queryClient.invalidateQueries.mockRejectedValueOnce(new Error('cache down'));
    const reverse = vi.fn(async () => ({
      operationId: 'op-1',
      status: 'reversed' as const,
      reversedAt: 1,
      reused: false,
    }));
    const receipt = await executeSettlementDelete({
      operationId: 'op-1',
      expectedBalance: 5,
      currentUserId,
      friendId,
      reverse,
      queryClient,
    });
    expect(receipt.status).toBe('reversed');
    expect(reverse).toHaveBeenCalledTimes(1);
  });
});

describe('buildSettlementDeleteInvalidationKeys', () => {
  it('covers Friend, Home, Group detail, and pair totals for group-initiated deletes', () => {
    expect(buildSettlementDeleteInvalidationKeys({
      currentUserId: 'user-you',
      friendId: 'user-avee',
      groupId: 'group-1',
    })).toEqual([
      ['friends', 'home', 'user-you'],
      ['friends', 'detail', 'user-you', 'user-avee'],
      ['groups', 'list', 'user-you'],
      ['activity', 'list', 'user-you', ''],
      ['groups', 'detail', 'user-you', 'group-1'],
      ['groups', 'pair-totals', 'user-you', 'group-1'],
      ['groups', 'detail', 'user-you'],
      ['groups', 'pair-totals', 'user-you'],
    ]);
  });

  it('still covers group surfaces for friend-initiated deletes via prefixes', () => {
    const keys = buildSettlementDeleteInvalidationKeys({ currentUserId: 'user-you', friendId: 'user-avee' });
    expect(keys).toContainEqual(['friends', 'detail', 'user-you', 'user-avee']);
    expect(keys).toContainEqual(['groups', 'detail', 'user-you']);
    expect(keys).toContainEqual(['groups', 'pair-totals', 'user-you']);
  });
});
