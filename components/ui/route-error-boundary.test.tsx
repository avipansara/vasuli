// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/contexts/theme-context';
import { RouteErrorBoundary } from './route-error-boundary';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  // Omit RN `style` — StyleSheet / arrays are not valid DOM `style` and break happy-dom.
  const View = ({
    children,
    style: _s,
    ...props
  }: {
    children?: React.ReactNode;
    style?: unknown;
  }) =>
    React.createElement('div', { 'data-testid': 'rn-view', ...props }, children);
  const Text = ({
    children,
    style: _s,
    ...props
  }: {
    children?: React.ReactNode;
    style?: unknown;
  }) => React.createElement('span', props, children);
  const Pressable = ({
    children,
    onPress,
    style: _s,
    accessibilityRole: _accessibilityRole,
    ...rest
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    style?: unknown;
    accessibilityRole?: string;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        role: 'button',
        ...rest,
        onClick: () => onPress?.(),
      },
      children,
    );
  const rn = {
    View,
    Text,
    Pressable,
    StyleSheet: {
      create: (s: Record<string, unknown>) => s,
    },
    useColorScheme: () => 'light' as const,
    Platform: {
      OS: 'web',
      select: (spec: {
        ios?: unknown;
        android?: unknown;
        web?: unknown;
        default?: unknown;
      }) => spec.web ?? spec.default ?? spec.ios ?? spec.android,
    },
  };
  return { ...rn, default: rn };
});

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));

function TestRoot({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('RouteErrorBoundary', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders fallback with default title and error message when a child throws', () => {
    function Boom(): never {
      throw new Error('planetary boom');
    }
    render(
      <TestRoot>
        <RouteErrorBoundary homeHref="/(tabs)">
          <Boom />
        </RouteErrorBoundary>
      </TestRoot>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('planetary boom')).toBeTruthy();
  });

  it('calls router.replace with homeHref when Go home is pressed', () => {
    function Boom(): never {
      throw new Error('fail');
    }
    render(
      <TestRoot>
        <RouteErrorBoundary homeHref="/(auth)/sign-in-otp">
          <Boom />
        </RouteErrorBoundary>
      </TestRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: /go home/i }));
    expect(mocks.replace).toHaveBeenCalledWith('/(auth)/sign-in-otp');
  });

  it('uses custom title when provided', () => {
    function Boom(): never {
      throw new Error('x');
    }
    render(
      <TestRoot>
        <RouteErrorBoundary homeHref="/(tabs)" title="Custom oops">
          <Boom />
        </RouteErrorBoundary>
      </TestRoot>,
    );
    expect(screen.getByText('Custom oops')).toBeTruthy();
  });

  it('recovers and shows child after Retry when the child succeeds on remount', () => {
    let allowRecover = false;
    function Flaky() {
      if (!allowRecover) throw new Error('first');
      return <Text>Recovered</Text>;
    }
    render(
      <TestRoot>
        <RouteErrorBoundary homeHref="/(tabs)">
          <Flaky />
        </RouteErrorBoundary>
      </TestRoot>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    allowRecover = true;
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    expect(screen.getByText('Recovered')).toBeTruthy();
  });

  it('formats non-Error throws in the fallback body', () => {
    function Boom(): never {
      throw 'string-throw';
    }
    render(
      <TestRoot>
        <RouteErrorBoundary homeHref="/(tabs)">
          <Boom />
        </RouteErrorBoundary>
      </TestRoot>,
    );
    expect(screen.getByText('string-throw')).toBeTruthy();
  });

  it('invokes onError in development (console.error)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Boom(): never {
      throw new Error('logged');
    }
    render(
      <TestRoot>
        <RouteErrorBoundary homeHref="/(tabs)">
          <Boom />
        </RouteErrorBoundary>
      </TestRoot>,
    );
    const routeLog = spy.mock.calls.find((c) => c[0] === '[RouteErrorBoundary]');
    expect(routeLog).toBeDefined();
    expect(routeLog?.[1]).toBeInstanceOf(Error);
    spy.mockRestore();
  });
});
