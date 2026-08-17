import { useAuth } from '@/contexts/auth-context-otp';
import { getNotificationHref } from '@/lib/notification-link';
import { notificationService } from '@/services/notification-service';
import { userService } from '@/services/user-service';
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
      if (!user) return;
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

  const handleNotificationNavigation = useCallback((data: Record<string, unknown>) => {
    const href = getNotificationHref(data);
    if (href) {
      router.push(href as any);
    } else {
      console.warn('Notification has no navigable destination:', data);
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
    const handledResponseIds = new Set<string>();
    const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (handledResponseIds.has(responseId)) return;
      handledResponseIds.add(responseId);

      const data = response.notification.request.content.data as Record<string, unknown>;
      console.log('Notification tapped:', data);
      handleNotificationNavigation(data);
    };

    responseListener.current = notificationService.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );

    // A notification tapped while the app was terminated can be delivered
    // before the listener above is registered. Recover that initial response.
    Notifications.getLastNotificationResponseAsync()
      .then(response => {
        if (response) {
          handleNotificationResponse(response);
          void Notifications.clearLastNotificationResponseAsync().catch(error => {
            console.warn('Could not clear initial notification response:', error);
          });
        }
      })
      .catch(error => console.warn('Could not read initial notification response:', error));

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
