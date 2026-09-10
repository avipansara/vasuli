// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/contexts/theme-context';
import { SettlementDeleteDialogs } from '@/components/settlements/settlement-delete-dialogs';
import { useSettlementDeleteFlow } from './use-settlement-delete-flow';
import type { FriendActivityItem, FriendDetailData } from '@/services/friend-detail-service';
import { CombinedSettlementError } from '@/services/settlement-service';
import type { SettlementOperationStatusRecord } from '@/services/settlement-operation-projection';

vi.mock('react-native', async () => {
  const React = await import('react');
  const toDomProps = ({
    testID,
    accessibilityLabel,
    accessibilityHint,
    accessibilityRole,
    accessibilityState,
    ...rest
  }: Record<string, unknown>) => {
    const dom: Record<string, unknown> = { ...rest };
    if (typeof testID === 'string') dom['data-testid'] = testID;
    if (typeof accessibilityLabel === 'string') dom['aria-label'] = accessibilityLabel;
    if (typeof accessibilityHint === 'string') dom['aria-description'] = accessibilityHint;
    if (typeof accessibilityRole === 'string') dom['role'] = accessibilityRole;
    const state = accessibilityState as { disabled?: boolean; busy?: boolean; expanded?: boolean } | undefined;
    if (state?.disabled !== undefined) dom['aria-disabled'] = state.disabled;
    if (state?.busy !== undefined) dom['aria-busy'] = state.busy;
    if (state?.expanded !== undefined) dom['aria-expanded'] = state.expanded;
    return dom;
  };
  const View = ({ children, style: _style, ...props }: { children?: React.ReactNode; style?: unknown }) =>
    React.createElement('div', toDomProps(props), children);
  const Text = ({ children, style: _style, ...props }: { children?: React.ReactNode; style?: unknown }) =>
    React.createElement('span', toDomProps(props), children);
  const TouchableOpacity = ({
    children,
    onPress,
    disabled,
    style: _style,
    activeOpacity: _activeOpacity,
    ...props
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    style?: unknown;
    activeOpacity?: number;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        ...toDomProps(props),
        onClick: disabled ? undefined : () => onPress?.(),
        disabled,
      },
      children,
    );
  const Modal = ({ children, visible }: { children?: React.ReactNode; visible?: boolean }) =>
    visible ? React.createElement('div', { 'data-testid': 'rn-modal' }, children) : null;
  const ScrollView = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('div', toDomProps(props as Record<string, unknown>), children);
  const KeyboardAvoidingView = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('div', toDomProps(props as Record<string, unknown>), children);
  const ActivityIndicator = () => React.createElement('div', { 'data-testid': 'activity-indicator' });
  const rn = {
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
    },
    View,
    Text,
    TouchableOpacity,
    Modal,
    ScrollView,
    KeyboardAvoidingView,
    ActivityIndicator,
    Appearance: {
      setColorScheme: vi.fn(),
    },
    useColorScheme: () => 'light' as const,
    Platform: {
      OS: 'web',
      select: (spec: { web?: unknown; default?: unknown }) => spec.web ?? spec.default,
    },
  };
  return { ...rn, default: rn };
});

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Flow = ReturnType<typeof useSettlementDeleteFlow>;
type FlowParams = Parameters<typeof useSettlementDeleteFlow>[0];

const holder: { current: Flow | null } = { current: null };

function Probe({ params }: { params: FlowParams }) {
  const flow = useSettlementDeleteFlow(params);
  React.useEffect(() => {
    holder.current = flow;
  });
  return <SettlementDeleteDialogs flow={flow} />;
}

function renderProbe(params: FlowParams) {
  render(
    <ThemeProvider>
      <Probe params={params} />
    </ThemeProvider>,
  );
}

function successReceipt(reused = false) {
  return { operationId: 'op-1', status: 'reversed' as const, reversedAt: t0, reused };
}

function baseParams(overrides: Partial<FlowParams> = {}): FlowParams {
  return {
    currentUserId,
    queryClient: { invalidateQueries: vi.fn(async () => undefined) } as unknown as FlowParams['queryClient'],
    refetch: vi.fn(async () => ({ data: null, error: null })),
    getDetail: vi.fn(async () => detailWith({ activity: paymentActivity(), operations: [operationRecord()] })),
    reverse: vi.fn(async () => successReceipt()),
    ...overrides,
  };
}

const reqA = { operationId: 'op-1', currency: 'USD', friendId, friendName: 'Avee' };
const reqB = { operationId: 'op-2', currency: 'USD', friendId, friendName: 'Avee' };

describe('useSettlementDeleteFlow dialog serialization', () => {
  afterEach(() => {
    cleanup();
    holder.current = null;
  });

  it('serializes rapid A/A requests with a synchronous lock', async () => {
    const gate = deferred<FriendDetailData>();
    const getDetail = vi.fn(() => gate.promise);
    renderProbe(baseParams({ getDetail }));

    const first = holder.current;
    expect(first).not.toBeNull();
    // Two synchronous taps before any read resolves: the second must not
    // start a second authorized read.
    void first!.requestDelete(reqA);
    holder.current!.requestDelete(reqA);
    expect(getDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve(detailWith({ activity: paymentActivity(), operations: [operationRecord()] }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-confirm-op-1')).toBeTruthy();
    });
    expect(holder.current!.isDeletePending('op-1')).toBe(true);
  });

  it('ignores request B while request A holds the dialog lock', async () => {
    const gate = deferred<FriendDetailData>();
    const getDetail = vi.fn(() => gate.promise);
    renderProbe(baseParams({ getDetail }));

    const first = holder.current;
    expect(first).not.toBeNull();
    void first!.requestDelete(reqA);
    holder.current!.requestDelete(reqB);
    expect(getDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve(detailWith({ activity: paymentActivity(), operations: [operationRecord()] }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-confirm-op-1')).toBeTruthy();
    });
    expect(screen.queryByTestId('settlement-delete-confirm-op-2')).toBeNull();
    expect(holder.current!.isDeletePending('op-2')).toBe(false);
  });

  it('cancel dismisses the confirmation without mutating', async () => {
    const reverse = vi.fn(async () => successReceipt());
    renderProbe(baseParams({ reverse }));

    await act(async () => {
      await holder.current!.requestDelete(reqA);
    });
    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-confirm-op-1')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('settlement-delete-cancel-op-1'));
    await waitFor(() => {
      expect(screen.queryByTestId('settlement-delete-dialog')).toBeNull();
    });
    expect(reverse).not.toHaveBeenCalled();
    expect(holder.current!.isDeletePending('op-1')).toBe(false);
  });

  it('successful deletion with refresh failure stays successful and marks deleted locally', async () => {
    const reverse = vi.fn(async () => successReceipt(false));
    const refetch = vi.fn(async () => ({ data: null, error: new Error('refresh down'), isError: true }));
    const track = vi.fn(async () => true);
    const analytics = { track } as unknown as NonNullable<FlowParams['analytics']>;
    renderProbe(baseParams({ analytics, reverse, refetch }));

    await act(async () => {
      await holder.current!.requestDelete(reqA);
    });
    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-confirm-op-1')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('settlement-delete-confirm-op-1'));

    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-dialog-title').textContent).toBe('Settlement deleted');
    });
    // Real React Query refetch failures resolve with an error result instead
    // of rejecting: the dialog must report the post-success refresh copy,
    // never plain success and never another delete.
    expect(screen.getByTestId('settlement-delete-dialog-body').textContent).toMatch(/could not be refreshed/i);
    expect(holder.current!.isDeletedLocally('op-1')).toBe(true);
    expect(reverse).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(track).toHaveBeenCalledWith(
        'settlement reversed',
        expect.objectContaining({ currency_code: 'USD' }),
      );
    });
  });

  it('stale rejection requires a new confirmation and ends the loop on the second rejection', async () => {
    const stale = () => new CombinedSettlementError('stale_balance', 'This balance changed. Refresh and try again.');
    const reverse = vi.fn(async () => { throw stale(); });
    const refetch = vi.fn(async () => ({ data: null, error: null }));
    renderProbe(baseParams({ reverse, refetch }));

    await act(async () => {
      await holder.current!.requestDelete(reqA);
    });
    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-confirm-op-1')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('settlement-delete-confirm-op-1'));

    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-dialog-title').textContent).toBe('Balance changed');
    });
    expect(reverse).toHaveBeenCalledTimes(1);

    // Refresh dismisses without auto-retry: a new confirmation is required.
    fireEvent.click(screen.getByTestId('settlement-delete-result-primary-op-1'));
    await waitFor(() => {
      expect(screen.queryByTestId('settlement-delete-dialog')).toBeNull();
    });
    expect(refetch).toHaveBeenCalled();
    expect(reverse).toHaveBeenCalledTimes(1);

    await act(async () => {
      await holder.current!.requestDelete(reqA);
    });
    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-confirm-op-1')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('settlement-delete-confirm-op-1'));

    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-dialog-title').textContent).toBe('Unable to delete');
    });
    expect(screen.getByTestId('settlement-delete-dialog-body').textContent).toMatch(
      /cannot be deleted with the current balances/i,
    );
    expect(reverse).toHaveBeenCalledTimes(2);
  });

  it('web confirmation shows the spec copy and deletes on confirm', async () => {
    const reverse = vi.fn(async () => successReceipt(false));
    const refetch = vi.fn(async () => ({ data: null, error: null }));
    renderProbe(baseParams({ reverse, refetch }));

    await act(async () => {
      await holder.current!.requestDelete(reqA);
    });

    // Cross-platform modal (works on web where Alert buttons do not): the
    // confirmation uses the original operation cash, never a guessed amount.
    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-dialog-title').textContent).toBe('Delete settlement?');
    });
    expect(screen.getByTestId('settlement-delete-dialog-body').textContent).toContain('$7.00');
    expect(screen.getByTestId('settlement-delete-dialog-body').textContent).toContain('Avee');
    fireEvent.click(screen.getByTestId('settlement-delete-confirm-op-1'));

    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-dialog-title').textContent).toBe('Settlement deleted');
    });
    expect(reverse).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'op-1', expectedBalance: 5 }),
    );
  });

  it('reused receipts show Already deleted and refresh activity', async () => {
    const reverse = vi.fn(async () => successReceipt(true));
    const refetch = vi.fn(async () => ({ data: null, error: null }));
    const track = vi.fn(async () => true);
    const analytics = { track } as unknown as NonNullable<FlowParams['analytics']>;
    renderProbe(baseParams({ analytics, reverse, refetch }));

    await act(async () => {
      await holder.current!.requestDelete(reqA);
    });
    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-confirm-op-1')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('settlement-delete-confirm-op-1'));

    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-dialog-title').textContent).toBe('Already deleted');
    });
    expect(refetch).toHaveBeenCalled();
    expect(holder.current!.isDeletedLocally('op-1')).toBe(true);
    expect(track).not.toHaveBeenCalled();
  });

  it('confirmation names every cleared balance undone by the Delete', async () => {
    const getDetail = vi.fn(async () => detailWith({
      activity: paymentActivity(),
      operations: [operationRecord()],
      cancellations: [
        { id: 'c-1', operationId: 'op-1', groupId: 'group-1', amount: 8, currency: 'USD', createdAt: t0 },
      ],
      groupBalances: [
        { groupId: 'group-1', groupName: 'Trip', currency: 'USD', amount: 0, direction: 'settled' },
      ],
    }));
    renderProbe(baseParams({ getDetail }));

    await act(async () => {
      await holder.current!.requestDelete(reqA);
    });

    await waitFor(() => {
      expect(screen.getByTestId('settlement-delete-dialog-title').textContent).toBe('Delete settlement?');
    });
    // The shared flow serves both the friend and group entry points, so one
    // confirmation covers every affected balance from either screen.
    expect(screen.getByTestId('settlement-delete-dialog-body').textContent).toContain(
      'Cleared balances will be restored: Trip ($8.00).',
    );
  });
});
