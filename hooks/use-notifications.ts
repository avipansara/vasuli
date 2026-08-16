import { useAuth } from '@/contexts/auth-context-otp';
import { userService } from '@/services/user-service';
import { notificationService } from '@/services/notification-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

const NOTIFICATION_ONBOARDING_PREFIX = 'notifications-onboarding-prompted:';

export function useNotifications(enabled = true) {
  const router = useRouter();
  const { user, isLoading, refreshUser } = useAuth();
  const notificationListener = useRef<Notifications.EventSubscription>(undefined);
  const responseListener = useRef<Notifications.EventSubscription>(undefined);

  useEffect(() => {
    if (!enabled || isLoading || !user?.id) return;

    let cancelled = false;
    const onboardingKey = `${NOTIFICATION_ONBOARDING_PREFIX}${user.id}`;

    async function syncPushToken() {
      const preference = await notificationService.getNotificationPreference(user.id);
      if (preference === false || cancelled) return;

      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        const token = await notificationService.registerForPushNotificationsAsync();
        if (!cancelled && token && token !== user.pushToken) {
          await userService.updatePushToken(user.id, token);
        }
        if (token && preference !== true) {
          await notificationService.setNotificationPreference(user.id, true);
        }
        if (!cancelled && token && token !== user.pushToken) {
          await refreshUser();
        }
        return;
      }

      const hasPrompted = await AsyncStorage.getItem(onboardingKey);
      if (hasPrompted || cancelled) return;

      await AsyncStorage.setItem(onboardingKey, 'true');
      Alert.alert(
        'Stay in the loop',
        'Get notified when someone adds an expense, sends a friend request, or settles up with you.',
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => notificationService.setNotificationPreference(user.id, false),
          },
          {
            text: 'Enable notifications',
            onPress: async () => {
              const token = await notificationService.registerForPushNotificationsAsync();
              if (!cancelled && token) {
                await notificationService.setNotificationPreference(user.id, true);
                await userService.updatePushToken(user.id, token);
                await refreshUser();
              }
            },
          },
        ],
      );
    }

    syncPushToken().catch(error => {
      console.error('Error syncing push notification token:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, isLoading, refreshUser, user?.id, user?.pushToken]);

  const handleNotificationNavigation = useCallback((data: any) => {
    switch (data.type) {
      case 'expense_added':
        if (data.expenseId) {
          router.push(`/expense-detail/${data.expenseId}` as any);
        }
        break;
      case 'group_created':
      case 'member_added':
        if (data.groupId) {
          router.push(`/groups/${data.groupId}` as any);
        }
        break;
      case 'invitation_sent':
        router.push('/invitations');
        break;
      case 'invitation_accepted':
        if (data.groupId) {
          router.push(`/groups/${data.groupId}` as any);
        } else if (data.friendId) {
          router.push(`/friends/${data.friendId}` as any);
        }
        break;
      case 'settlement_created':
        if (data.groupId) {
          router.push(`/groups/${data.groupId}` as any);
        }
        break;
      default:
        console.log('Unknown notification type:', data.type);
    }
  }, [router]);

  useEffect(() => {
    // Listen for notifications received while app is in foreground
    notificationListener.current = notificationService.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
        // You can show a custom in-app notification here if desired
      }
    );

    // Listen for user tapping on notifications
    responseListener.current = notificationService.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.log('Notification tapped:', data);

        // Navigate based on notification type
        handleNotificationNavigation(data);
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationService.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        notificationService.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [handleNotificationNavigation]);

  return {
    clearBadge: notificationService.clearBadge,
    setBadgeCount: notificationService.setBadgeCount,
    getBadgeCount: notificationService.getBadgeCount,
  };
}
