import { notificationService } from '@/services/notification-service';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

export function useNotifications() {
  const router = useRouter();
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

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
          router.push(`/group/${data.groupId}` as any);
        }
        break;
      case 'invitation_sent':
        router.push('/invitations');
        break;
      case 'invitation_accepted':
        if (data.groupId) {
          router.push(`/group/${data.groupId}` as any);
        } else if (data.friendId) {
          router.push(`/friend/${data.friendId}` as any);
        }
        break;
      case 'settlement_created':
        if (data.groupId) {
          router.push(`/group/${data.groupId}` as any);
        }
        break;
      default:
        console.log('Unknown notification type:', data.type);
    }
  }, [router]);

  useEffect(() => {
    // Register for push notifications and get token
    const registerForPushNotifications = async () => {
      const token = await notificationService.registerForPushNotificationsAsync();
      if (token) {
        console.log('Push token registered:', token);
        // TODO: Store token in user profile via user service
        // You can access user from auth context and update their push token
        // await userService.updatePushToken(userId, token);
      }
    };

    registerForPushNotifications();

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
