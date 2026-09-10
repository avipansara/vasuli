// @vitest-environment happy-dom
import { cleanup, render, fireEvent } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shareMock: vi.fn(),
}));

vi.mock('@/contexts/theme-context', () => ({
  useTheme: () => ({ isDark: false, theme: 'light', toggleTheme: vi.fn() }),
  ThemeProvider: ({ children }: any) => children,
}));

vi.mock('@/hooks/use-theme-colors', () => ({
  useThemeColors: () => ({
    colors: { text: '#000000', textSecondary: '#64748b', border: '#e2e8f0', tint: '#22c55e' },
    isDark: false,
    gradients: { screenBackground: ['#ffffff', '#ffffff'] },
  }),
}));

vi.mock('@/hooks/use-theme-color', () => ({
  useThemeColor: () => '#000000',
}));

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

vi.mock('expo-linking', () => ({
  parse: vi.fn(),
  createURL: vi.fn(),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  const View = ({ children, style: _style, testID, ...props }: any) =>
    React.createElement('div', { 'data-testid': testID, ...props }, children);
  const Text = ({ children, style: _style, ...props }: any) =>
    React.createElement('span', props, children);
  const TouchableOpacity = ({ children, onPress, ...props }: any) =>
    React.createElement('button', { type: 'button', onClick: onPress, ...props }, children);
  const Modal = ({ children, visible, ...props }: any) =>
    visible ? React.createElement('div', { 'data-testid': 'modal', ...props }, children) : null;
  const Share = {
    share: mocks.shareMock,
  };
  const rn = {
    View,
    Text,
    TouchableOpacity,
    Modal,
    KeyboardAvoidingView: View,
    ScrollView: View,
    Share,
    Appearance: {
      setColorScheme: vi.fn(),
    },
    useColorScheme: () => 'light' as const,
    Platform: {
      OS: 'ios' as const,
      select: (spec: { ios?: unknown; default?: unknown }) => spec.ios ?? spec.default,
    },
    StyleSheet: {
      create: (s: any) => s,
      hairlineWidth: 1,
    },
  };
  return { ...rn, default: rn };
});

vi.mock('expo-linear-gradient', async () => {
  const React = await import('react');
  return {
    LinearGradient: ({ children }: any) => React.createElement('div', {}, children),
  };
});

import { MyQRCodeModal } from './my-qr-code-modal';

describe('MyQRCodeModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders user details and QR code when visible', () => {
    const user = {
      id: '8470a257-22d7-4632-9c1a-5ff7b5a83a1b',
      name: 'Jane Doe',
      email: 'jane@example.com',
    };

    const { getByText, getByTestId } = render(
      <MyQRCodeModal visible={true} onClose={vi.fn()} user={user} />
    );

    expect(getByText('Jane Doe')).toBeTruthy();
    expect(getByText('jane@example.com')).toBeTruthy();
    expect(getByTestId('qr-code-view')).toBeTruthy();
  });

  it('triggers native share with correct invite link when share button is pressed', () => {
    const user = {
      id: '8470a257-22d7-4632-9c1a-5ff7b5a83a1b',
      name: 'Jane Doe',
      email: 'jane@example.com',
    };

    const { getByText } = render(
      <MyQRCodeModal visible={true} onClose={vi.fn()} user={user} />
    );

    const shareButton = getByText('Share Invite Link');
    fireEvent.click(shareButton);

    expect(mocks.shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Connect with me on Vasuli',
        message: expect.stringContaining(user.id),
      })
    );
  });

  it('returns null when user is null', () => {
    const { queryByTestId } = render(
      <MyQRCodeModal visible={true} onClose={vi.fn()} user={null} />
    );

    expect(queryByTestId('modal')).toBeNull();
  });
});
