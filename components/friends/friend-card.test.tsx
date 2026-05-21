// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/contexts/theme-context';
import { FriendCard } from './friend-card';

vi.mock('react-native', async () => {
  const React = await import('react');
  const View = ({ children, style: _style, ...props }: { children?: React.ReactNode; style?: unknown }) =>
    React.createElement('div', props, children);
  const Text = ({ children, style: _style, ...props }: { children?: React.ReactNode; style?: unknown }) =>
    React.createElement('span', props, children);
  const TouchableOpacity = ({
    children,
    onPress,
    style: _style,
    activeOpacity: _activeOpacity,
    ...props
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    style?: unknown;
    activeOpacity?: number;
  }) => React.createElement('button', { type: 'button', ...props, onClick: () => onPress?.() }, children);
  const Animated = {
    View,
  };
  const rn = {
    Animated,
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
      select: (spec: { web?: unknown; default?: unknown; ios?: unknown; android?: unknown }) =>
        spec.web ?? spec.default ?? spec.ios ?? spec.android,
    },
  };
  return { ...rn, default: rn };
});

vi.mock('react-native-gesture-handler/Swipeable', async () => {
  const React = await import('react');
  return {
    default: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  };
});

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

const baseFriend = {
  id: 'friend-1',
  name: 'Jay',
  email: 'jay@example.com',
  createdAt: 1,
  isActive: true,
  recentExpenses: [],
};

function renderFriendCard(balance: number) {
  render(
    <ThemeProvider>
      <FriendCard friend={{ ...baseFriend, balance }} />
    </ThemeProvider>,
  );
}

describe('FriendCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('treats sub-cent balances as settled instead of showing a $0.00 debt', () => {
    renderFriendCard(-0.004);

    expect(screen.getByText('settled up ✓')).toBeTruthy();
    expect(screen.queryByText('you owe')).toBeNull();
    expect(screen.queryByText('$0.00')).toBeNull();
  });
});
