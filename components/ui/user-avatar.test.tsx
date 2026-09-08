// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserAvatar } from './user-avatar';

vi.mock('@/hooks/use-theme-colors', () => ({
  useThemeColors: () => ({
    colors: { tint: '#16a34a', text: '#000000' },
    friends: { avatarSurface: 'rgba(34, 197, 94, 0.12)' },
    isDark: false,
  }),
}));

vi.mock('react-native', async () => {
  const R = await import('react');
  return {
    View: ({ children, testID, accessibilityLabel, accessibilityRole }: any) =>
      R.createElement('div', { 'data-testid': testID, 'aria-label': accessibilityLabel, role: accessibilityRole }, children),
    Image: ({ testID, onError }: any) =>
      R.createElement('img', { 'data-testid': testID, onError }),
    StyleSheet: {
      create: (s: any) => s,
    },
  };
});

vi.mock('@/components/themed-text', () => ({
  ThemedText: ({ children, testID }: any) =>
    React.createElement('span', { 'data-testid': testID }, children),
}));

describe('UserAvatar', () => {
  afterEach(cleanup);

  it('renders initials from user name', () => {
    render(<UserAvatar name="Alex Rivera" />);
    const initials = screen.getByTestId('user-avatar-initials');
    expect(initials.textContent).toBe('A');
  });

  it('falls back to "U" when no name is provided', () => {
    render(<UserAvatar />);
    const initials = screen.getByTestId('user-avatar-initials');
    expect(initials.textContent).toBe('U');
  });

  it('renders image when avatarUrl is provided', () => {
    render(<UserAvatar name="Alex" avatarUrl="https://example.com/alex.jpg" />);
    expect(screen.getByTestId('user-avatar-image')).toBeDefined();
  });

  it('renders image when uri prop is provided', () => {
    render(<UserAvatar name="Alex" uri="https://example.com/alex.jpg" />);
    expect(screen.getByTestId('user-avatar-image')).toBeDefined();
  });

  it('renders explicit initials when provided', () => {
    render(<UserAvatar name="Alex Rivera" initials="AR" />);
    const initials = screen.getByTestId('user-avatar-initials');
    expect(initials.textContent).toBe('AR');
  });

  it('sets accessible label and role', () => {
    render(<UserAvatar name="Sam" />);
    const avatar = screen.getByTestId('user-avatar');
    expect(avatar.getAttribute('role')).toBe('image');
    expect(avatar.getAttribute('aria-label')).toBe("Sam's avatar");
  });
});
