import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import type { CombinedSettlementReceipt } from './settlement-service';

const { getById } = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('./user-service', () => ({ userService: { getById } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('expo-notifications', () => ({ setNotificationHandler: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(async () => null) } }));

import { notificationService } from './notification-service';
import { sendSettlementNotification } from './settlement-notification';
import { getNotificationHref } from '@/lib/notification-link';

const currentUser: User = { id: 'actor', name: 'Alex', isActive: true, createdAt: 1 };
const friend: User = { id: 'friend', name: 'Sam', isActive: true, createdAt: 1 };
const receipt: CombinedSettlementReceipt = {
  paymentIntentId: 'intent', reused: false, committedAt: 1, totalAmount: 12.5,
  currency: 'GBP', direction: 'you_paid_friend', settlements: [],
};

describe('settlement push notifications', () => {
  const send = vi.spyOn(notificationService, 'sendPushNotification');
  beforeEach(() => {
    getById.mockReset().mockResolvedValue({ ...friend, pushToken: 'saved-token' });
    send.mockReset().mockResolvedValue(undefined);
  });

  it('notifies the other person once with the payment and friend destination', async () => {
    await sendSettlementNotification({ receipt, currentUser, friend });
    expect(getById).toHaveBeenCalledWith('friend');
    expect(send).toHaveBeenCalledOnce();
    const [token, notification] = send.mock.calls[0];
    expect(token).toBe('saved-token');
    expect(notification.body).toBe('Alex recorded that Alex paid £12.50 to Sam');
    expect(getNotificationHref({ ...notification.data, type: notification.type })).toBe('/friends/actor');
  });

  it('identifies the payer when the recipient paid and opens the group', async () => {
    await sendSettlementNotification({ receipt: { ...receipt, direction: 'friend_paid_you', currency: 'INR' }, currentUser, friend, groupId: 'group-1' });
    const notification = send.mock.calls[0][1];
    expect(notification.body).toBe('Alex recorded that Sam paid ₹12.50 to Alex');
    expect(getNotificationHref({ ...notification.data, type: notification.type })).toBe('/groups/group-1');
  });

  it('skips retries, zero-value clearings, and recipients without a token', async () => {
    await sendSettlementNotification({ receipt: { ...receipt, reused: true }, currentUser, friend });
    await sendSettlementNotification({ receipt: { ...receipt, totalAmount: 0 }, currentUser, friend });
    getById.mockResolvedValueOnce({ ...friend, pushToken: null });
    await sendSettlementNotification({ receipt, currentUser, friend });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not fail a recorded payment when the recipient lookup fails', async () => {
    getById.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(sendSettlementNotification({ receipt, currentUser, friend })).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('does not fail a recorded payment when sending fails', async () => {
    send.mockRejectedValueOnce(new Error('push unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(sendSettlementNotification({ receipt, currentUser, friend })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
