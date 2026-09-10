// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QRCode } from './qr-code';

vi.mock('react-native', async () => {
  const React = await import('react');
  const View = ({ children, style: _style, testID, ...props }: any) =>
    React.createElement('div', { 'data-testid': testID, ...props }, children);
  return {
    View,
    StyleSheet: {
      create: (s: any) => s,
    },
  };
});

describe('QRCode component', () => {
  afterEach(cleanup);

  it('renders a QR code view with children bars', () => {
    const { getByTestId } = render(
      <QRCode value="https://split-space.com/invite/8470a257-22d7-4632-9c1a-5ff7b5a83a1b" size={200} />
    );

    const qrView = getByTestId('qr-code-view');
    expect(qrView).toBeTruthy();
    expect(qrView.children.length).toBeGreaterThan(50);
  });

  it('renders empty container gracefully when value is empty', () => {
    const { getByTestId } = render(<QRCode value="" size={200} />);
    const qrView = getByTestId('qr-code-view');
    expect(qrView).toBeTruthy();
    expect(qrView.children.length).toBe(0);
  });
});
