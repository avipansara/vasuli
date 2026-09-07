// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FriendSettlementActivity } from './friend-settlement-activity';
import { ThemeProvider } from '@/contexts/theme-context';
import type { FriendActivityItem } from '@/services/friend-detail-service';

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
  default: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
}));

vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    useAnimatedStyle: () => ({}),
  };
});

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

const t0 = Date.parse('2026-08-20T12:00:00.000Z');

type SettlementItem = Extract<FriendActivityItem, { type: 'settlement' }>;

function settlementItem(overrides: Partial<SettlementItem> = {}): SettlementItem {
  return {
    id: 'settlement:s-legacy',
    type: 'settlement',
    date: t0,
    settlementId: 's-legacy',
    amount: 12,
    currency: 'USD',
    direction: 'you_paid_friend',
    ...overrides,
  };
}

// ADR-0004 ticket 05: legacy payments without an operation ID stay readable
// as plain payment cards. No Reverse/transfer UI; Delete flows through the
// shared operation dialog only, so legacy cards expose no destructive action.
const baseProps = {
  friendName: 'Friend A',
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
};

function renderLegacy(
  item: SettlementItem,
  extra: Partial<React.ComponentProps<typeof FriendSettlementActivity>> = {},
) {
  render(
    <ThemeProvider>
      <FriendSettlementActivity item={item} {...baseProps} {...extra} />
    </ThemeProvider>,
  );
}

describe.each([{ isDark: false }, { isDark: true }])(
  'FriendSettlementActivity legacy (isDark=$isDark)',
  ({ isDark }) => {
    afterEach(() => {
      cleanup();
    });

    it('reads a direct legacy payment as plain who-paid-whom copy', () => {
      renderLegacy(settlementItem(), { isDark });

      expect(screen.getByText(/You paid Friend/)).toBeTruthy();
      expect(screen.getByText('Settled')).toBeTruthy();
      expect(screen.getByTestId('friend-settlement-s-legacy')).toBeTruthy();
      expect(screen.queryByText('Reverse')).toBeNull();
      expect(screen.queryByText(/ledger|offset|friendship balance/i)).toBeNull();
    });

    it('reads a group legacy payment with its plain group scope', () => {
      renderLegacy(
        settlementItem({
          id: 'settlement:s-group',
          settlementId: 's-group',
          direction: 'friend_paid_you',
          groupId: 'group-1',
          groupName: 'Test Group',
        }),
        { isDark },
      );

      expect(screen.getByText(/Friend paid you/)).toBeTruthy();
      expect(screen.getByText(/Test Group/)).toBeTruthy();
      expect(screen.queryByText('Reverse')).toBeNull();
      expect(screen.queryByText(/ledger|offset|friendship balance/i)).toBeNull();
    });
  },
);
