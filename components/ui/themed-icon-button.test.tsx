// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemedIconButton } from './themed-icon-button';

vi.mock('@/hooks/use-theme-colors', () => ({
  useThemeColors: () => ({
    colors: { tint: '#16a34a', text: '#000000', textSecondary: '#666666', background: '#FFFFFF' },
    isDark: false,
  }),
}));

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: ({ name, color, size }: any) =>
    React.createElement('span', { 'data-testid': `icon-${name}`, 'data-color': color, 'data-size': size }),
}));

vi.mock('react-native', async () => {
  const R = await import('react');
  return {
    TouchableOpacity: ({ children, testID, accessibilityLabel, disabled, onPress }: any) =>
      R.createElement(
        'button',
        { 'data-testid': testID, 'aria-label': accessibilityLabel, disabled, onClick: onPress },
        children
      ),
    View: ({ children, testID, style }: any) =>
      R.createElement('div', { 'data-testid': testID, style }, children),
    ActivityIndicator: () => R.createElement('div', { 'data-testid': 'activity-indicator' }),
    StyleSheet: {
      create: (s: any) => s,
    },
    Platform: {
      OS: 'ios',
      select: (spec: any) => spec.ios ?? spec.default,
    },
  };
});

vi.mock('@/components/themed-text', () => ({
  ThemedText: ({ children, style }: any) =>
    React.createElement('span', { 'data-testid': 'themed-text', style }, children),
}));

describe('ThemedIconButton', () => {
  afterEach(cleanup);

  it('renders icon button with accessibility label', () => {
    render(
      <ThemedIconButton
        name="bell"
        accessibilityLabel="Notifications"
        onPress={() => {}}
      />
    );
    expect(screen.getByLabelText('Notifications')).toBeDefined();
    expect(screen.getByTestId('icon-bell')).toBeDefined();
  });

  it('renders numeric badge count when badge > 0 is provided', () => {
    render(
      <ThemedIconButton
        name="bell"
        badge={3}
        accessibilityLabel="Notifications"
        onPress={() => {}}
      />
    );
    const badgeText = screen.getByTestId('themed-text');
    expect(badgeText.textContent).toBe('3');
  });

  it('caps numeric badge at 99+ when badge exceeds 99', () => {
    render(
      <ThemedIconButton
        name="bell"
        badge={120}
        accessibilityLabel="Notifications"
        onPress={() => {}}
      />
    );
    const badgeText = screen.getByTestId('themed-text');
    expect(badgeText.textContent).toBe('99+');
  });

  it('does not render badge when badge is 0 or undefined', () => {
    render(
      <ThemedIconButton
        name="bell"
        badge={0}
        accessibilityLabel="Notifications"
        onPress={() => {}}
      />
    );
    expect(screen.queryByTestId('themed-text')).toBeNull();
  });
});
