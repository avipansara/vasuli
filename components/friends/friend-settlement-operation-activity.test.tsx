// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FriendSettlementOperationActivity } from './friend-settlement-operation-activity';
import { ThemeProvider } from '@/contexts/theme-context';
import type { FriendSettlementOperationItem } from '@/services/friend-detail-service';
import type { SettlementOperationProjection } from '@/services/settlement-operation-projection';

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
  const rn = {
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
    },
    TouchableOpacity,
    View,
    Text,
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

vi.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({
    children,
    renderRightActions,
  }: {
    children?: React.ReactNode;
    renderRightActions?: (_progress: unknown, translation: { get: () => number }) => React.ReactNode;
  }) =>
    React.createElement(
      'div',
      null,
      // Swipe actions render off-screen until swiped on device. Render them
      // here so tests cover the swipe-only Delete path (no inline button).
      renderRightActions?.(null, { get: () => -100 }),
      children,
    ),
}));

vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const View = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  const Default = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  // `Reanimated.View` is used by the swipe action; expose it on the default export.
  (Default as unknown as Record<string, unknown>).View = View;
  return {
    __esModule: true,
    default: Default,
    View,
    useAnimatedStyle: () => ({}),
  };
});

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

const t0 = Date.parse('2026-08-20T12:00:00.000Z');
const DAY = 86_400_000;

function projection(overrides: Partial<SettlementOperationProjection> & { operationId: string }): SettlementOperationProjection {
  return {
    status: 'committed',
    isDeleted: false,
    originalDate: t0,
    currency: 'USD',
    fromUserId: 'user-avee',
    toUserId: 'user-you',
    originalCashAmount: 7,
    hasKnownPayment: true,
    isZeroPayment: false,
    cashUnknown: false,
    allocations: [],
    adjustments: [],
    cancellations: [],
    reversalSettlements: [],
    reversalTransfers: [],
    reversalCancellations: [],
    ...overrides,
  };
}

function item(overrides: Partial<FriendSettlementOperationItem> & { operationId: string }): FriendSettlementOperationItem {
  const { operationId, ...rest } = overrides;
  return {
    id: `operation:${operationId}`,
    type: 'settlement_operation',
    date: t0,
    operationId,
    direction: 'friend_paid_you',
    projection: projection({ operationId }),
    ...rest,
  };
}

const themeProps = {
  friendName: 'Avee Lopez',
  colors: { card: '#fff', text: '#111', textSecondary: '#666', border: '#eee' },
  friendDetailTheme: {
    positive: '#0a0',
    positiveSurface: '#e6f4ea',
    danger: '#c00',
    dangerSurface: '#fdecea',
    actionSurface: '#eee',
    actionIcon: '#666',
    settledSurface: '#f0f0f0',
  },
  isDark: false,
  formatDate: () => 'Aug 20, 2026',
  swipeableRefs: { current: new Map() },
};

function renderActivity(
  operationItem: FriendSettlementOperationItem,
  extra: Partial<React.ComponentProps<typeof FriendSettlementOperationActivity>> = {},
) {
  render(
    <ThemeProvider>
      <FriendSettlementOperationActivity
        item={operationItem}
        canDelete
        onDelete={() => undefined}
        {...themeProps}
        {...extra}
      />
    </ThemeProvider>,
  );
}

describe('FriendSettlementOperationActivity', () => {
  afterEach(() => {
    cleanup();
  });

  it('reads a payment as who paid whom with the actual cash amount and date', () => {
    renderActivity(item({ operationId: 'op-pay' }));

    expect(screen.getByText('Avee paid you')).toBeTruthy();
    expect(screen.getByText('$7.00 · Aug 20, 2026')).toBeTruthy();
    expect(screen.queryByText('No payment was made')).toBeNull();
    // Ticket 05: the operation card exposes a stable operation-scoped testID
    // so E2E selects the intended operation without matching a11y copy.
    expect(screen.getByTestId('friend-settlement-operation-op-pay')).toBeTruthy();
  });

  it('reads a zero-payment operation as a balance clearing with no $0 payment', () => {
    renderActivity(
      item({
        operationId: 'op-zero',
        direction: undefined,
        projection: projection({
          operationId: 'op-zero',
          fromUserId: undefined,
          toUserId: undefined,
          originalCashAmount: 0,
          hasKnownPayment: false,
          isZeroPayment: true,
        }),
      }),
    );

    expect(screen.getByText('Balances cleared with Avee')).toBeTruthy();
    expect(screen.getByText(/No payment was made/)).toBeTruthy();
    expect(screen.queryByText('You paid $0.00')).toBeNull();
    expect(screen.queryByText('$0.00 · Aug 20, 2026')).toBeNull();
  });

  it('expands Balance details with per-group adjustments and no per-adjustment Delete', () => {
    const onOpenGroup = vi.fn();
    renderActivity(
      item({
        operationId: 'op-details',
        projection: projection({
          operationId: 'op-details',
          adjustments: [{
            id: 't-1',
            operationId: 'op-details',
            groupId: 'group-1',
            fromUserId: 'user-avee',
            toUserId: 'user-you',
            currency: 'USD',
            signedGroupBalanceDelta: 8,
            createdAt: t0,
          }],
        }),
        groupNames: { 'group-1': 'Trip' },
      }),
      { onOpenGroup },
    );

    expect(screen.queryByText('Balance adjustment')).toBeNull();
    fireEvent.click(screen.getByTestId('friend-balance-details-toggle-op-details'));
    expect(screen.getByText('Balance adjustment')).toBeTruthy();
    expect(screen.getByText('$8.00')).toBeTruthy();
    expect(screen.getByText('No additional payment')).toBeTruthy();
    fireEvent.click(screen.getByText('Trip'));
    expect(onOpenGroup).toHaveBeenCalledWith('group-1');
    expect(screen.queryByTestId('delete-settlement-adjustment-t-1')).toBeNull();
  });

  it('lists cleared balances with the actual cash headline and no extra payment row', () => {
    const onOpenGroup = vi.fn();
    renderActivity(
      item({
        operationId: 'op-full',
        projection: projection({
          operationId: 'op-full',
          originalCashAmount: 12,
          cancellations: [
            { id: 'c-1', operationId: 'op-full', groupId: 'group-1', amount: 10, currency: 'USD', createdAt: t0 },
            { id: 'c-2', operationId: 'op-full', groupId: 'group-2', amount: 3, currency: 'USD', createdAt: t0 },
          ],
        }),
        groupNames: { 'group-1': 'Trip', 'group-2': 'Roommates' },
      }),
      { onOpenGroup },
    );

    // Headline shows the actual cash only, once.
    expect(screen.getByText('Avee paid you')).toBeTruthy();
    expect(screen.getByText('$12.00 · Aug 20, 2026')).toBeTruthy();
    expect(screen.queryByText('Balance cleared')).toBeNull();
    fireEvent.click(screen.getByTestId('friend-balance-details-toggle-op-full'));
    // Details list naming each cleared scope, never an extra payment row.
    expect(screen.getAllByText('Balance cleared')).toHaveLength(2);
    expect(screen.getByText('Trip')).toBeTruthy();
    expect(screen.getByText('Roommates')).toBeTruthy();
    expect(screen.getByText('$10.00')).toBeTruthy();
    expect(screen.getByText('$3.00')).toBeTruthy();
    expect(screen.getAllByText('No additional payment')).toHaveLength(2);
    expect(screen.queryByText(/ledger|transfer|revers/i)).toBeNull();
    fireEvent.click(screen.getByText('Trip'));
    expect(onOpenGroup).toHaveBeenCalledWith('group-1');
  });

  it('keeps a deleted operation in place with original details, deletion date, and no Delete', () => {
    const onDelete = vi.fn();
    renderActivity(
      item({
        operationId: 'op-gone',
        projection: projection({
          operationId: 'op-gone',
          status: 'reversed',
          isDeleted: true,
          reversedAt: t0 + DAY,
        }),
      }),
      { canDelete: false, onDelete },
    );

    expect(screen.getByText('Avee paid you')).toBeTruthy();
    expect(screen.getByText('$7.00 · Aug 20, 2026')).toBeTruthy();
    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(screen.queryByTestId('delete-settlement-operation-op-gone')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('friend-balance-details-toggle-op-gone'));
    expect(screen.getByText(/Deleted on/)).toBeTruthy();
  });

  it('exposes a swipe-only Delete action with whole-settlement accessibility copy', () => {
    const onDelete = vi.fn();
    renderActivity(item({ operationId: 'op-del' }), { onDelete });

    // Payment-only has no expandable section — Delete lives only in swipe.
    expect(screen.queryByTestId('friend-balance-details-toggle-op-del')).toBeNull();
    const button = screen.getByTestId('delete-settlement-operation-op-del');
    expect(button.getAttribute('aria-label')).toBe('Delete settlement, $7.00, Avee Lopez');
    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('announces balance-clearing deletion distinctly', () => {
    renderActivity(
      item({
        operationId: 'op-clear-del',
        direction: undefined,
        projection: projection({
          operationId: 'op-clear-del',
          fromUserId: undefined,
          toUserId: undefined,
          originalCashAmount: 0,
          hasKnownPayment: false,
          isZeroPayment: true,
        }),
      }),
    );

    expect(
      screen.getByTestId('delete-settlement-operation-op-clear-del').getAttribute('aria-label'),
    ).toBe('Delete balance clearing with Avee Lopez');
  });

  it('disables the swipe Delete entry point while a deletion is pending', () => {
    const onDelete = vi.fn();
    renderActivity(item({ operationId: 'op-busy' }), { isDeleting: true, onDelete });

    const button = screen.getByTestId('delete-settlement-operation-op-busy');
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Deleting…')).toBeTruthy();
  });

  it('keeps a deleted balance clearing as a clearing with deletion date and no Delete', () => {
    renderActivity(
      item({
        operationId: 'op-zero-gone',
        direction: undefined,
        projection: projection({
          operationId: 'op-zero-gone',
          status: 'reversed',
          isDeleted: true,
          reversedAt: t0 + DAY,
          fromUserId: undefined,
          toUserId: undefined,
          originalCashAmount: 0,
          hasKnownPayment: false,
          isZeroPayment: true,
        }),
      }),
      { canDelete: true },
    );

    expect(screen.getByText('Balances cleared with Avee')).toBeTruthy();
    expect(screen.getByText(/No payment was made/)).toBeTruthy();
    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(screen.queryByTestId('delete-settlement-operation-op-zero-gone')).toBeNull();
    fireEvent.click(screen.getByTestId('friend-balance-details-toggle-op-zero-gone'));
    expect(screen.getByText(/Deleted on/)).toBeTruthy();
  });

  it('renders the local post-success Deleted state before activity refreshes', () => {
    renderActivity(item({ operationId: 'op-local' }), { canDelete: true, isDeletedOverride: true });

    expect(screen.getByText('Avee paid you')).toBeTruthy();
    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(screen.queryByTestId('delete-settlement-operation-op-local')).toBeNull();
  });

  it('renders an off-page payment with its authoritative amount, never a false $0', () => {
    renderActivity(
      item({
        operationId: 'op-offpage',
        projection: projection({
          operationId: 'op-offpage',
          originalCashAmount: 0,
          authoritativeCashTotal: 7,
          hasKnownPayment: true,
          isZeroPayment: false,
          cashUnknown: true,
          allocations: [],
        }),
      }),
    );

    expect(screen.getByText('Avee paid you')).toBeTruthy();
    expect(screen.getByText('$7.00 · Aug 20, 2026')).toBeTruthy();
    expect(screen.queryByText('$0.00 · Aug 20, 2026')).toBeNull();
  });

  it('uses a neutral title instead of guessing a direction when the payer is unknown', () => {
    renderActivity(
      item({
        operationId: 'op-nodir',
        direction: undefined,
        projection: projection({
          operationId: 'op-nodir',
          fromUserId: undefined,
          toUserId: undefined,
        }),
      }),
    );

    expect(screen.getByText('Settlement with Avee')).toBeTruthy();
    expect(screen.getByText('$7.00 · Aug 20, 2026')).toBeTruthy();
    expect(screen.queryByText('You paid Avee')).toBeNull();
    expect(screen.queryByText('Avee paid you')).toBeNull();
  });
});

// ADR-0004 ticket 05: one payment activity per payment with plain copy and a
// single Delete path. These cover payment, deleted, pending, and
// converted-history states in both appearances with placeholder names only.
describe.each([{ isDark: false }, { isDark: true }])(
  'FriendSettlementOperationActivity single Delete path (isDark=$isDark)',
  ({ isDark }) => {
    afterEach(() => {
      cleanup();
    });

    it('reads a plain payment with swipe-only Delete and no transfer vocabulary', () => {
      const onDelete = vi.fn();
      renderActivity(item({ operationId: 'op-plain' }), { isDark, onDelete });

      expect(screen.getByTestId('friend-settlement-operation-op-plain')).toBeTruthy();
      expect(screen.getByText('Avee paid you')).toBeTruthy();
      expect(screen.getByText('$7.00 · Aug 20, 2026')).toBeTruthy();
      expect(screen.queryByText(/ledger|offset|friendship balance|moved to|moved from/i)).toBeNull();
      // Payment-only has no expandable details — Delete is swipe-only.
      expect(screen.queryByTestId('friend-balance-details-toggle-op-plain')).toBeNull();
      fireEvent.click(screen.getByTestId('delete-settlement-operation-op-plain'));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('keeps a deleted payment in place with no Delete', () => {
      renderActivity(
        item({
          operationId: 'op-gone-plain',
          projection: projection({
            operationId: 'op-gone-plain',
            status: 'reversed',
            isDeleted: true,
            reversedAt: t0 + DAY,
          }),
        }),
        { isDark, canDelete: false },
      );

      expect(screen.getByText('Avee paid you')).toBeTruthy();
      expect(screen.getByText('Deleted')).toBeTruthy();
      expect(screen.queryByTestId('delete-settlement-operation-op-gone-plain')).toBeNull();
      expect(screen.queryByText(/ledger|offset|friendship balance|moved to|moved from/i)).toBeNull();
    });

    it('disables swipe Delete while a deletion is pending', () => {
      const onDelete = vi.fn();
      renderActivity(item({ operationId: 'op-pending-plain' }), { isDark, isDeleting: true, onDelete });

      const button = screen.getByTestId('delete-settlement-operation-op-pending-plain');
      expect(button.hasAttribute('disabled')).toBe(true);
      fireEvent.click(button);
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('reads converted history with per-group entries and plain copy', () => {
      renderActivity(
        item({
          operationId: 'op-history',
          projection: projection({
            operationId: 'op-history',
            adjustments: [{
              id: 't-history',
              operationId: 'op-history',
              groupId: 'group-1',
              fromUserId: 'user-avee',
              toUserId: 'user-you',
              currency: 'USD',
              signedGroupBalanceDelta: 8,
              createdAt: t0,
            }],
          }),
          groupNames: { 'group-1': 'Test Group' },
        }),
        { isDark },
      );

      fireEvent.click(screen.getByTestId('friend-balance-details-toggle-op-history'));
      expect(screen.getByText('Test Group')).toBeTruthy();
      expect(screen.getByText('$8.00')).toBeTruthy();
      expect(screen.queryByText(/ledger|offset|friendship balance|moved to|moved from/i)).toBeNull();
    });
  },
);
