// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScanQRScreen from '@/app/scan-qr';

const mocks = vi.hoisted(() => ({
  scan: undefined as undefined | ((event: { data: string }) => Promise<void>),
  permission: { granted: true, canAskAgain: true },
  requestPermission: vi.fn(), openSettings: vi.fn(), alert: vi.fn(),
  getById: vi.fn(), areFriends: vi.fn(), createAccepted: vi.fn(), invalidate: vi.fn(),
  back: vi.fn(), push: vi.fn(), focused: true,
  getPermission: vi.fn(), appStateChanged: undefined as undefined | ((state: string) => void),
}));
vi.mock('@/hooks/use-theme-colors', () => ({ useThemeColors: () => ({
  colors: { background: '#fff', text: '#111', textSecondary: '#555', accent: '#065f46' },
  gradients: { screenBackground: ['#fff', '#fff'] }, isDark: false,
}) }));
vi.mock('@/contexts/auth-context-otp', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/lib/invite-deeplink', () => ({ parseInviteFromUrl: (data: string) =>
  data === 'valid' ? { inviterId: 'friend' } : null }));
vi.mock('@/services/user-service', () => ({ userService: { getById: mocks.getById } }));
vi.mock('@/services/friendship-service', () => ({ friendshipService: { createAccepted: mocks.createAccepted, areFriends: mocks.areFriends } }));
vi.mock('@/services/friend-relationship-invalidation', () => ({ invalidateFriendRelationshipSurfaces: mocks.invalidate }));
vi.mock('expo-router', () => ({ router: { back: mocks.back, push: mocks.push }, useIsFocused: () => mocks.focused }));
vi.mock('expo-camera', () => ({
  useCameraPermissions: () => [mocks.permission, mocks.requestPermission, mocks.getPermission],
  CameraView: ({ onBarcodeScanned }: any) => { mocks.scan = onBarcodeScanned; return <div data-testid="camera" />; },
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@/components/themed-text', () => ({ ThemedText: ({ children }: any) => <span>{children}</span> }));
vi.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
vi.mock('@/components/ui/screen-header', () => ({ NavigationHeader: () => null }));
vi.mock('@/components/friends/my-qr-code-modal', () => ({ MyQRCodeModal: () => null }));
vi.mock('react-native', () => ({
  View: ({ children }: any) => <div>{children}</div>,
  TouchableOpacity: ({ children, onPress }: any) => <button onClick={onPress}>{children}</button>,
  AppState: { addEventListener: (_event: string, callback: (state: string) => void) => {
    mocks.appStateChanged = callback;
    return { remove: vi.fn() };
  } },
  Alert: { alert: mocks.alert }, Linking: { openSettings: mocks.openSettings },
  Platform: { OS: 'ios' }, StyleSheet: { create: (styles: any) => styles, absoluteFill: {} },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission = { granted: true, canAskAgain: true };
  mocks.focused = true;
  mocks.areFriends.mockResolvedValue(false);
  mocks.getById.mockResolvedValue({ id: 'friend', name: 'Alex' });
});
afterEach(cleanup);

describe('friend QR scanner', () => {
  it('opens an existing friend without offering to add them again', async () => {
    mocks.areFriends.mockResolvedValue(true);
    render(<ScanQRScreen />);
    await act(async () => { await mocks.scan!({ data: 'valid' }); });
    const [title, message, buttons] = mocks.alert.mock.calls[0];
    expect(title).toBe('Already Friends');
    expect(message).toBe("You're already friends with Alex.");
    expect(buttons.map((button: { text: string }) => button.text)).toEqual(['Cancel', 'Open Friend']);
    act(() => buttons[0].onPress());
    expect(mocks.scan).toBeTypeOf('function');
    await act(async () => { await mocks.scan!({ data: 'valid' }); });
    act(() => mocks.alert.mock.calls[1][2][1].onPress());
    expect(mocks.push).toHaveBeenCalledWith('/friends/friend');
    expect(mocks.createAccepted).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('handles one scan while lookup and confirmation are pending, then resumes on cancel', async () => {
    render(<ScanQRScreen />);
    const scan = mocks.scan!;
    await act(async () => { await Promise.all([scan({ data: 'valid' }), scan({ data: 'valid' })]); });
    expect(mocks.getById).toHaveBeenCalledTimes(1);
    expect(mocks.alert).toHaveBeenCalledTimes(1);
    act(() => mocks.alert.mock.calls[0][2][0].onPress());
    await act(async () => { await mocks.scan!({ data: 'valid' }); });
    expect(mocks.getById).toHaveBeenCalledTimes(2);
  });

  it('waits for the invalid-code alert to be dismissed before scanning again', async () => {
    render(<ScanQRScreen />);
    await act(async () => { await mocks.scan!({ data: 'invalid' }); });
    expect(mocks.scan).toBeUndefined();
    act(() => mocks.alert.mock.calls[0][2][0].onPress());
    expect(mocks.scan).toBeTypeOf('function');
  });

  it('opens settings when camera permission can no longer be requested', () => {
    mocks.permission = { granted: false, canAskAgain: false };
    const view = render(<ScanQRScreen />);
    fireEvent.click(view.getByText('Open Settings'));
    expect(mocks.openSettings).toHaveBeenCalledOnce();
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });

  it('refreshes camera permission when returning from settings', () => {
    render(<ScanQRScreen />);
    act(() => mocks.appStateChanged!('active'));
    expect(mocks.getPermission).toHaveBeenCalledOnce();
  });

  it('releases the camera when the route loses focus', () => {
    const view = render(<ScanQRScreen />);
    expect(view.queryByTestId('camera')).toBeTruthy();
    mocks.focused = false;
    view.rerender(<ScanQRScreen />);
    expect(view.queryByTestId('camera')).toBeNull();
  });

  it('allows retry after adding a friend fails', async () => {
    mocks.createAccepted.mockRejectedValueOnce(new Error('Connection lost'));
    render(<ScanQRScreen />);
    await act(async () => { await mocks.scan!({ data: 'valid' }); });
    await act(async () => { await mocks.alert.mock.calls[0][2][1].onPress(); });
    expect(mocks.alert.mock.calls[1][1]).toBe('Connection lost');
    expect(mocks.scan).toBeUndefined();
    act(() => mocks.alert.mock.calls[1][2][0].onPress());
    expect(mocks.scan).toBeTypeOf('function');
  });

  it('connects the friend and refreshes balances before showing success', async () => {
    render(<ScanQRScreen />);
    await act(async () => { await mocks.scan!({ data: 'valid' }); });
    await act(async () => { await mocks.alert.mock.calls[0][2][1].onPress(); });
    expect(mocks.createAccepted).toHaveBeenCalledWith('me', 'friend');
    expect(mocks.invalidate).toHaveBeenCalledWith(expect.anything(), 'me', 'friend');
    expect(mocks.alert.mock.calls[1][0]).toBe('Connected!');
  });
});
