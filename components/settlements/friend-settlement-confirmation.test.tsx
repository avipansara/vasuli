// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FriendSettlementConfirmation } from './friend-settlement-confirmation';

const themeMode = vi.hoisted(() => ({ dark: false }));
vi.mock('react-native', () => {
  const el = (tag: string, name: string) => Object.assign(({ children, testID, accessibilityLabel, onPress, disabled, style, ...props }: any) => React.createElement(tag, { ...props, 'data-testid': testID, 'aria-label': accessibilityLabel, 'data-semantic-color': style?.[1]?.color ?? style?.[1]?.backgroundColor, disabled, onClick: onPress }, children), { displayName: name });
  const TextInput = ({ onChangeText, style, ...props }: any) => React.createElement('input', { ...props, onChange: (event: any) => onChangeText(event.target.value), 'data-testid': props.testID, 'data-semantic-color': style?.[1]?.color ?? style?.color });
  const rn = { View: el('div', 'View'), Text: el('span', 'Text'), TouchableOpacity: el('button', 'TouchableOpacity'), TextInput, Platform: { select: (value: any) => value.web ?? value.default }, StyleSheet: { create: (value: any) => value } };
  return { ...rn, default: rn };
});
vi.mock('@/components/ui/shared-modal', () => ({ SharedModal: ({ visible, children }: any) => visible ? React.createElement('div', null, children) : null }));
vi.mock('@/components/themed-text', () => ({ ThemedText: ({ children, style, testID, ...props }: any) => React.createElement('span', { ...props, 'data-testid': testID, 'data-semantic-color': style?.[1]?.color }, children) }));
vi.mock('@/hooks/use-theme-colors', () => ({ useThemeColors: () => themeMode.dark ? ({ colors: { text: '#fff', textSecondary: '#aaa', border: '#555', error: '#f99' }, settle: { textPrimary: '#fff', textSecondary: '#aaa', accentText: '#2dd4bf', buttonBackground: '#10b981', buttonText: '#040914' } }) : ({ colors: { text: '#111', textSecondary: '#555', border: '#ccc', error: '#b00' }, settle: { textPrimary: '#111', textSecondary: '#555', accentText: '#075', buttonBackground: '#075', buttonText: '#fff' } }) }));

const base = {
  friendName: 'Friend', currentUserId: 'me', friendId: 'friend', currency: 'USD', directBalance: -22,
  groupBalances: [{ groupId: 'trip', groupName: 'Trip', currency: 'USD', amount: 10, direction: 'you_are_owed' as const }],
  onRefresh: vi.fn(), onDone: vi.fn(),
};

describe('FriendSettlementConfirmation', () => {
  afterEach(cleanup);
  it('previews partial payment and commits after confirmation', async () => {
    const onCommit = vi.fn().mockResolvedValue({ totalAmount: 3, currency: 'USD', reused: false });
    render(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={onCommit} />);
    fireEvent.change(screen.getByTestId('friend-settlement-amount-input'), { target: { value: '3' } });
    expect(screen.getByTestId('friend-settlement-breakdown').textContent).toContain('Remaining overall: $9.00');
    fireEvent.click(screen.getByTestId('friend-settlement-record-button'));
    fireEvent.click(screen.getByTestId('friend-settlement-confirm-button'));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(3));
  });

  it('keeps a natural zero breakdown visible and disables recording', () => {
    render(<FriendSettlementConfirmation {...base} netAmount={0} onCommit={vi.fn()} />);
    expect(screen.getByText('You are settled up overall')).toBeTruthy();
    expect(screen.getByTestId('friend-settlement-breakdown').textContent).toContain('Trip');
    expect(screen.getByTestId('friend-settlement-record-button')).toHaveProperty('disabled', true);
  });

  it('shows full cash once and named cancellations', async () => {
    const onCommit = vi.fn().mockResolvedValue({ totalAmount: 12, currency: 'USD', reused: false });
    render(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={onCommit} />);
    expect(screen.getByTestId('friend-settlement-cleared-scopes').textContent).toContain('Also clearsTrip');
    expect(screen.getByTestId('friend-settlement-breakdown').textContent).not.toContain('$10.00 cleared');
    fireEvent.click(screen.getByTestId('friend-settlement-record-button'));
    const confirmation = screen.getByTestId('friend-settlement-confirmation').textContent ?? '';
    expect(confirmation).toContain('You pay Friend $12.00 once');
    expect(confirmation).toContain('Also clears balances in Trip. No extra payment.');
    fireEvent.click(screen.getByTestId('friend-settlement-confirm-button'));
    await waitFor(() => expect(screen.getByTestId('friend-settlement-success').textContent).toContain('$12.00 once'));
    expect(screen.getByTestId('friend-settlement-success').textContent?.match(/\$12\.00/g)).toHaveLength(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('supports the reverse payer direction', () => {
    render(<FriendSettlementConfirmation {...base} netAmount={12} directBalance={22} groupBalances={[{ ...base.groupBalances[0], amount: -10, direction: 'you_owe' }]} onCommit={vi.fn()} />);
    expect(screen.getByTestId('friend-settlement-overall').textContent).toContain('Friend paid you');
    fireEvent.click(screen.getByTestId('friend-settlement-record-button'));
    expect(screen.getByTestId('friend-settlement-confirmation').textContent).toContain('Friend pays you $12.00 once.');
  });

  it('shows an opposing direct balance as unchanged until full settlement clears it', () => {
    const props = {
      ...base,
      netAmount: 12,
      directBalance: -10,
      groupBalances: [{ ...base.groupBalances[0], amount: 22, direction: 'you_are_owed' as const }],
      onCommit: vi.fn(),
    };
    const view = render(<FriendSettlementConfirmation {...props} />);
    fireEvent.change(screen.getByTestId('friend-settlement-amount-input'), { target: { value: '3' } });
    expect(screen.getByTestId('friend-settlement-preview').textContent).toContain('DirectUnchanged');

    fireEvent.click(screen.getByLabelText('Settle the full balance'));
    expect(screen.getByTestId('friend-settlement-cleared-scopes').textContent).toContain('Also clearsTrip, Direct');
    expect(screen.getByTestId('friend-settlement-preview').textContent).toContain('No extra payment. All balances will be cleared.');
    view.unmount();
  });

  it('shows the screenshot case as one payment with simple cleared-scope names', () => {
    render(
      <FriendSettlementConfirmation
        {...base}
        friendName="Vay04"
        netAmount={15}
        directBalance={-5}
        groupBalances={[{
          groupId: 'temp-test-group',
          groupName: 'Temp Test Group',
          currency: 'USD',
          amount: 20,
          direction: 'you_are_owed',
        }]}
        onCommit={vi.fn()}
      />,
    );

    const preview = screen.getByTestId('friend-settlement-preview').textContent ?? '';
    expect(preview).toContain('Temp Test Group$15.00 payment');
    expect(preview).toContain('Also clearsTemp Test Group, Direct');
    expect(preview.match(/\$15\.00/g)).toHaveLength(1);
    expect(preview).not.toContain('$5.00');
  });

  it('validates zero, fractional, and over-maximum amounts', () => {
    render(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={vi.fn()} />);
    const input = screen.getByTestId('friend-settlement-amount-input');
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByTestId('friend-settlement-validation').textContent).toContain('greater than zero');
    fireEvent.change(input, { target: { value: '1.001' } });
    expect(screen.getByTestId('friend-settlement-validation').textContent).toContain('two decimal places');
    fireEvent.change(input, { target: { value: '13' } });
    expect(screen.getByTestId('friend-settlement-validation').textContent).toContain('$12.00');
  });

  it('offers half and full balance shortcuts', () => {
    render(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Settle half the balance'));
    expect(screen.getByTestId('friend-settlement-amount-input')).toHaveProperty('value', '6.00');
    expect(screen.getByTestId('friend-settlement-preview').textContent).toContain('Remaining overall: $6.00');
    fireEvent.click(screen.getByLabelText('Settle the full balance'));
    expect(screen.getByTestId('friend-settlement-amount-input')).toHaveProperty('value', '12.00');
    expect(screen.getByTestId('friend-settlement-preview').textContent).toContain('No extra payment. All balances will be cleared.');
  });

  it('offers retry after transient failure and refresh after stale balance', async () => {
    const transient = Object.assign(new Error('temporary'), { code: 'transient' });
    const stale = Object.assign(new Error('changed'), { code: 'stale_balance' });
    const onCommit = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce({ totalAmount: 3, currency: 'USD', reused: true });
    const onRefresh = vi.fn();
    render(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={onCommit} onRefresh={onRefresh} />);
    fireEvent.change(screen.getByTestId('friend-settlement-amount-input'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('friend-settlement-record-button'));
    fireEvent.click(screen.getByTestId('friend-settlement-confirm-button'));
    await waitFor(() => expect(screen.getByTestId('friend-settlement-retry')).toBeTruthy());
    fireEvent.click(screen.getByTestId('friend-settlement-retry-button'));
    await waitFor(() => expect(screen.getByTestId('friend-settlement-success').textContent).toContain('already recorded'));

    const staleCommit = vi.fn().mockRejectedValue(stale);
    const refresh = vi.fn();
    render(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={staleCommit} onRefresh={refresh} />);
    fireEvent.click(screen.getAllByTestId('friend-settlement-record-button').at(-1)!);
    fireEvent.click(screen.getAllByTestId('friend-settlement-confirm-button').at(-1)!);
    await waitFor(() => expect(screen.getAllByTestId('friend-settlement-stale').at(-1)).toBeTruthy());
    fireEvent.click(screen.getAllByTestId('friend-settlement-refresh-button').at(-1)!);
    expect(refresh).toHaveBeenCalled();
  });

  it('blocks duplicate submits while the first confirmation is pending', () => {
    let resolve: ((value: any) => void) | undefined;
    const onCommit = vi.fn().mockImplementation(() => new Promise(value => { resolve = value; }));
    render(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={onCommit} />);
    fireEvent.click(screen.getByTestId('friend-settlement-record-button'));
    const button = screen.getByTestId('friend-settlement-confirm-button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onCommit).toHaveBeenCalledTimes(1);
    resolve?.({ totalAmount: 12, currency: 'USD', reused: false });
  });

  it('renders semantic summary, input, and action colors in light and dark themes', () => {
    const view = render(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={vi.fn()} />);
    expect(screen.getByTestId('friend-settlement-overall-amount').getAttribute('data-semantic-color')).toBe('#111');
    expect(screen.getByTestId('friend-settlement-amount-input').getAttribute('data-semantic-color')).toBe('#075');
    expect(screen.getByTestId('friend-settlement-record-button').getAttribute('data-semantic-color')).toBe('#075');
    themeMode.dark = true;
    view.rerender(<FriendSettlementConfirmation {...base} netAmount={-12} onCommit={vi.fn()} />);
    expect(screen.getByTestId('friend-settlement-overall-amount').getAttribute('data-semantic-color')).toBe('#fff');
    expect(screen.getByTestId('friend-settlement-amount-input').getAttribute('data-semantic-color')).toBe('#2dd4bf');
    expect(screen.getByTestId('friend-settlement-record-button').getAttribute('data-semantic-color')).toBe('#10b981');
    themeMode.dark = false;
  });
});
