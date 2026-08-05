import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const NOTIFICATION_PREFERENCE_PREFIX = 'notifications-enabled:';

function notificationPreferenceKey(userId: string): string {
  return `${NOTIFICATION_PREFERENCE_PREFIX}${userId}`;
}

export interface PushNotificationData {
  type: 'expense_added' | 'expense_updated' | 'expense_deleted' | 'expense_reminder' | 'group_created' | 'member_added' | 'invitation_sent' | 'invitation_accepted' | 'settlement_created';
  title: string;
  body: string;
  data?: Record<string, any>;
}

async function invokeSendPushNotification(
  tokens: string[],
  notification: PushNotificationData
): Promise<void> {
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        tokens: unique,
        notification: {
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        },
      },
    });

    if (error) {
      console.error('Error sending push notification:', error.message);
      return;
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      console.error('send-push-notification:', String((data as { error: string }).error));
    }
  } catch (err) {
    console.error('Error sending push notification:', err);
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notificationService = {
  async getNotificationPreference(userId: string): Promise<boolean | null> {
    const value = await AsyncStorage.getItem(notificationPreferenceKey(userId));
    if (value === null) return null;
    return value === 'true';
  },

  async setNotificationPreference(userId: string, enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(notificationPreferenceKey(userId), String(enabled));
  },

  async clearNotificationPreference(userId: string): Promise<void> {
    await AsyncStorage.removeItem(notificationPreferenceKey(userId));
  },

  async registerForPushNotificationsAsync(): Promise<string | null> {
    let token: string | null = null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2DD4BF',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) {
        console.warn('Project ID not found in app config');
        return null;
      }

      const pushTokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      token = pushTokenData.data;
      console.log('Push token:', token);
    } catch (error) {
      console.error('Error getting push token:', error);
    }

    return token;
  },

  async sendPushNotification(
    expoPushToken: string,
    notification: PushNotificationData
  ): Promise<void> {
    await invokeSendPushNotification([expoPushToken], notification);
  },

  async sendNotificationToUsers(
    userTokens: string[],
    notification: PushNotificationData
  ): Promise<void> {
    await invokeSendPushNotification(userTokens, notification);
  },

  async scheduleLocalNotification(
    notification: PushNotificationData,
    seconds: number = 0
  ): Promise<string> {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: { ...notification.data, type: notification.type },
        sound: true,
      },
      trigger: seconds > 0 ? { seconds, repeats: false } as Notifications.TimeIntervalTriggerInput : null,
    });

    return notificationId;
  },

  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  },

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  },

  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  },

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  },

  addNotificationReceivedListener(
    listener: (notification: Notifications.Notification) => void
  ) {
    return Notifications.addNotificationReceivedListener(listener);
  },

  addNotificationResponseReceivedListener(
    listener: (response: Notifications.NotificationResponse) => void
  ) {
    return Notifications.addNotificationResponseReceivedListener(listener);
  },

  removeNotificationSubscription(
    subscription: Notifications.EventSubscription
  ) {
    subscription.remove();
  },
};

export const createExpenseNotification = (
  expenseName: string,
  amount: number,
  paidBy: string,
  groupName?: string
): PushNotificationData => ({
  type: 'expense_added',
  title: '💸 New Expense Added',
  body: `${paidBy} added "${expenseName}" for $${amount.toFixed(2)}${groupName ? ` in ${groupName}` : ''}`,
  data: { expenseName, amount, paidBy, groupName },
});

export const createExpenseUpdatedNotification = (
  expenseName: string,
  amount: number,
  updatedBy: string,
  groupName?: string
): PushNotificationData => ({
  type: 'expense_updated',
  title: 'Expense Updated',
  body: `${updatedBy} updated "${expenseName}" to $${amount.toFixed(2)}${groupName ? ` in ${groupName}` : ''}`,
  data: { expenseName, amount, updatedBy, groupName },
});

export const createExpenseDeletedNotification = (
  expenseName: string,
  amount: number,
  deletedBy: string,
  groupName?: string
): PushNotificationData => ({
  type: 'expense_deleted',
  title: 'Expense Deleted',
  body: `${deletedBy} deleted "${expenseName}" for $${amount.toFixed(2)}${groupName ? ` in ${groupName}` : ''}`,
  data: { expenseName, amount, deletedBy, groupName },
});

export const createGroupNotification = (
  groupName: string,
  createdBy: string
): PushNotificationData => ({
  type: 'group_created',
  title: '👥 New Group Created',
  body: `${createdBy} created a new group "${groupName}"`,
  data: { groupName, createdBy },
});

export const createMemberAddedNotification = (
  groupName: string,
  addedBy: string,
  memberName: string,
  groupId: string,
): PushNotificationData => ({
  type: 'member_added',
  title: '➕ Added to Group',
  body: `${addedBy} added ${memberName} to "${groupName}"`,
  data: { groupId, groupName, addedBy, memberName },
});

export const createInvitationNotification = (
  inviterName: string,
  groupName?: string
): PushNotificationData => ({
  type: 'invitation_sent',
  title: '📨 New Invitation',
  body: groupName
    ? `${inviterName} invited you to join "${groupName}"`
    : `${inviterName} sent you a friend request`,
  data: { inviterName, groupName },
});

export const createInvitationAcceptedNotification = (
  accepterName: string,
  groupName?: string
): PushNotificationData => ({
  type: 'invitation_accepted',
  title: '✅ Invitation Accepted',
  body: groupName
    ? `${accepterName} joined "${groupName}"`
    : `${accepterName} accepted your friend request`,
  data: { accepterName, groupName },
});

export const createSettlementNotification = (
  paidBy: string,
  amount: number,
  paidTo: string
): PushNotificationData => ({
  type: 'settlement_created',
  title: '💰 Payment Recorded',
  body: `${paidBy} paid $${amount.toFixed(2)} to ${paidTo}`,
  data: { paidBy, amount, paidTo },
});
