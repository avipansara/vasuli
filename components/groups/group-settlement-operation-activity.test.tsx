// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroupSettlementOperationActivity } from './group-settlement-operation-activity';
import { ThemeProvider } from '@/contexts/theme-context';
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
const groupId = 'group-1';
const currentUserId = 'user-you';

function projection(overrides: Partial<SettlementOperationProjection> & { operationId: string }): SettlementOperationProjection {
  return {
    status: 'committed',
    isDeleted: false,
    originalDate: t0,
    currency: 'USD',
    fromUserId: 'user-avee',
    toUserId: currentUserId,
    originalCashAmount: 10,
    hasKnownPayment: true,
    isZeroPayment: false,
    cashUnknown: false,
    allocations: [{
      id: 's-pay',
      operationId: overrides.operationId,
      groupId,
      fromUserId: 'user-avee',
      toUserId: currentUserId,
      amount: 10,
      currency: 'USD',
      date: t0,
      createdAt: t0,
    }],
    adjustments: [],
    cancellations: [],
    reversalSettlements: [],
    reversalTransfers: [],
    reversalCancellations: [],
    ...overrides,
  };
}

const themeProps = {
  groupId,
  currentUserId,
  payerName: 'Avee Lopez',
  payeeName: 'You',
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
  operationProjection: SettlementOperationProjection,
  extra: Partial<React.ComponentProps<typeof GroupSettlementOperationActivity>> = {},
) {
  render(
    <ThemeProvider>
      <GroupSettlementOperationActivity
        projection={operationProjection}
        canDelete
        onDelete={() => undefined}
        {...themeProps}
        {...extra}
      />
    </ThemeProvider>,
  );
}

describe('GroupSettlementOperationActivity', () => {
  afterEach(() => {
    cleanup();
  });

  it('reads a group payment with participants and group-local cash', () => {
    renderActivity(projection({ operationId: 'op-pay' }));

    expect(screen.getByText('Avee paid you')).toBeTruthy();
    expect(screen.getByText('$10.00 · Aug 20, 2026')).toBeTruthy();
    expect(screen.queryByText('Group balance cleared')).toBeNull();
    // Ticket 05: stable operation-scoped testID for E2E selection.
    expect(screen.getByTestId('group-settlement-operation-op-pay')).toBeTruthy();
  });

  it('reads an adjustment-only operation as cleared with no paid wording', () => {
    renderActivity(
      projection({
        operationId: 'op-clear',
        fromUserId: undefined,
        toUserId: undefined,
        originalCashAmount: 0,
        hasKnownPayment: false,
        isZeroPayment: true,
        allocations: [],
        adjustments: [{
          id: 't-1',
          operationId: 'op-clear',
          groupId,
          fromUserId: 'user-avee',
          toUserId: currentUserId,
          currency: 'USD',
          signedGroupBalanceDelta: -8,
          createdAt: t0,
        }],
      }),
    );

    expect(screen.getByText('Group balance cleared')).toBeTruthy();
    expect(screen.queryByText(/paid/)).toBeNull();
    fireEvent.click(screen.getByTestId('group-balance-details-toggle-op-clear'));
    expect(screen.getByText('Balance adjustment')).toBeTruthy();
    expect(screen.getByText('$8.00')).toBeTruthy();
    expect(screen.getByText('No additional payment')).toBeTruthy();
  });

  it('keeps this-group history only when another scope also changed', () => {
    renderActivity(
      projection({
        operationId: 'op-mixed',
        allocations: [{
          id: 's-local',
          operationId: 'op-mixed',
          groupId,
          fromUserId: 'user-avee',
          toUserId: currentUserId,
          amount: 10,
          currency: 'USD',
          date: t0,
          createdAt: t0,
        }],
        adjustments: [
          {
            id: 't-local',
            operationId: 'op-mixed',
            groupId,
            fromUserId: 'user-avee',
            toUserId: currentUserId,
            currency: 'USD',
            signedGroupBalanceDelta: -8,
            createdAt: t0,
          },
          {
            id: 't-elsewhere',
            operationId: 'op-mixed',
            groupId: 'group-2',
            fromUserId: 'user-avee',
            toUserId: currentUserId,
            currency: 'USD',
            signedGroupBalanceDelta: -5,
            createdAt: t0,
          },
        ],
      }),
    );

    fireEvent.click(screen.getByTestId('group-balance-details-toggle-op-mixed'));
    expect(screen.getByText('$8.00')).toBeTruthy();
    expect(screen.queryByText('$5.00')).toBeNull();
  });

  it('lists this group cleared balance with no paid wording and no other-group amounts', () => {
    renderActivity(
      projection({
        operationId: 'op-cancelled',
        fromUserId: undefined,
        toUserId: undefined,
        originalCashAmount: 0,
        hasKnownPayment: false,
        isZeroPayment: false,
        cashUnknown: true,
        allocations: [],
        cancellations: [
          { id: 'c-local', operationId: 'op-cancelled', groupId, amount: 8, currency: 'USD', createdAt: t0 },
          { id: 'c-elsewhere', operationId: 'op-cancelled', groupId: 'group-2', amount: 5, currency: 'USD', createdAt: t0 },
        ],
      }),
    );

    expect(screen.getByText('Group balance cleared')).toBeTruthy();
    expect(screen.queryByText(/paid/)).toBeNull();
    fireEvent.click(screen.getByTestId('group-balance-details-toggle-op-cancelled'));
    expect(screen.getByText('Balance cleared')).toBeTruthy();
    expect(screen.getByText('$8.00')).toBeTruthy();
    expect(screen.queryByText('$5.00')).toBeNull();
    expect(screen.getByText('No additional payment')).toBeTruthy();
  });

  it('shows history with no Delete to non-participants', () => {
    const onDelete = vi.fn();
    renderActivity(projection({ operationId: 'op-seen' }), { canDelete: false, onDelete });

    expect(screen.getByText('Avee paid you')).toBeTruthy();
    expect(screen.queryByTestId('delete-group-settlement-operation-op-seen')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('keeps a deleted operation in place with deletion date and no Delete', () => {
    renderActivity(
      projection({
        operationId: 'op-gone',
        status: 'reversed',
        isDeleted: true,
        reversedAt: t0 + DAY,
      }),
      { canDelete: false },
    );

    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(screen.queryByTestId('delete-group-settlement-operation-op-gone')).toBeNull();
    fireEvent.click(screen.getByTestId('group-balance-details-toggle-op-gone'));
    expect(screen.getByText(/Deleted on/)).toBeTruthy();
  });

  it('renders the local post-success Deleted state before activity refreshes', () => {
    renderActivity(projection({ operationId: 'op-local' }), { canDelete: true, isDeletedOverride: true });

    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(screen.queryByTestId('delete-group-settlement-operation-op-local')).toBeNull();
  });

  it('disables swipe Delete while a deletion is pending', () => {
    const onDelete = vi.fn();
    renderActivity(projection({ operationId: 'op-busy' }), { isDeleting: true, onDelete });

    const button = screen.getByTestId('delete-group-settlement-operation-op-busy');
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Deleting…')).toBeTruthy();
  });

  it('renders payment-only operations with no inline Delete card (swipe-only)', () => {
    renderActivity(projection({ operationId: 'op-swipe-only' }));

    // No Balance details section for payment-only; Delete lives only in swipe.
    expect(screen.queryByTestId('group-balance-details-toggle-op-swipe-only')).toBeNull();
    expect(screen.getByTestId('delete-group-settlement-operation-op-swipe-only')).toBeTruthy();
    expect(screen.getByText('Settled')).toBeTruthy();
  });
});

// ADR-0004 ticket 05: one payment activity per payment with plain copy and a
// single Delete path. These cover payment, deleted, pending, and
// converted-history states in both appearances with placeholder names only.
describe.each([{ isDark: false }, { isDark: true }])(
  'GroupSettlementOperationActivity single Delete path (isDark=$isDark)',
  ({ isDark }) => {
    afterEach(() => {
      cleanup();
    });

    it('reads a plain group payment with swipe-only Delete and no transfer vocabulary', () => {
      const onDelete = vi.fn();
      renderActivity(projection({ operationId: 'op-plain' }), { isDark, onDelete });

      expect(screen.getByTestId('group-settlement-operation-op-plain')).toBeTruthy();
      expect(screen.getByText('Avee paid you')).toBeTruthy();
      expect(screen.getByText('$10.00 · Aug 20, 2026')).toBeTruthy();
      expect(screen.queryByText(/ledger|offset|friendship balance|moved to|moved from/i)).toBeNull();
      // Payment-only has no expandable details — Delete is swipe-only.
      expect(screen.queryByTestId('group-balance-details-toggle-op-plain')).toBeNull();
      fireEvent.click(screen.getByTestId('delete-group-settlement-operation-op-plain'));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('keeps a deleted payment in place with no Delete', () => {
      renderActivity(
        projection({
          operationId: 'op-gone-plain',
          status: 'reversed',
          isDeleted: true,
          reversedAt: t0 + DAY,
        }),
        { isDark, canDelete: false },
      );

      expect(screen.getByText('Deleted')).toBeTruthy();
      expect(screen.queryByTestId('delete-group-settlement-operation-op-gone-plain')).toBeNull();
      expect(screen.queryByText(/ledger|offset|friendship balance|moved to|moved from/i)).toBeNull();
    });

    it('disables swipe Delete while a deletion is pending', () => {
      const onDelete = vi.fn();
      renderActivity(projection({ operationId: 'op-pending-plain' }), { isDark, isDeleting: true, onDelete });

      const button = screen.getByTestId('delete-group-settlement-operation-op-pending-plain');
      expect(button.hasAttribute('disabled')).toBe(true);
      fireEvent.click(button);
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('reads converted history without paid wording and with plain copy', () => {
      renderActivity(
        projection({
          operationId: 'op-history',
          fromUserId: undefined,
          toUserId: undefined,
          originalCashAmount: 0,
          hasKnownPayment: false,
          isZeroPayment: true,
          allocations: [],
          adjustments: [{
            id: 't-history',
            operationId: 'op-history',
            groupId,
            fromUserId: 'user-avee',
            toUserId: currentUserId,
            currency: 'USD',
            signedGroupBalanceDelta: -8,
            createdAt: t0,
          }],
        }),
        { isDark },
      );

      expect(screen.getByText('Group balance cleared')).toBeTruthy();
      expect(screen.queryByText(/paid/)).toBeNull();
      fireEvent.click(screen.getByTestId('group-balance-details-toggle-op-history'));
      expect(screen.getByText('$8.00')).toBeTruthy();
      expect(screen.queryByText(/ledger|offset|friendship balance|moved to|moved from/i)).toBeNull();
    });
  },
);
