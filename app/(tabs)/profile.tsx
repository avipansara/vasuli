import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context-otp';
import { useTheme } from '@/contexts/theme-context';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useRealtime } from '@/hooks/use-realtime';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getAppVersionLabel } from '@/lib/app-version';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { calculateFriendSummaryTotals, friendSummaryService } from '@/services/friend-summary-service';
import { userService } from '@/services/user-service';
import { friendshipService } from '@/services/friendship-service';
import { invitationService } from '@/services/invitation-service';
import { notificationService } from '@/services/notification-service';
import { queryKeys } from '@/services/query-keys';
import { getPendingInvitationCount } from '@/utils/invitation-count';
import { normalizeEmail } from '@/utils/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

type SettingsItem = {
  icon: string;
  title: string;
  onPress?: () => void;
  hasSwitch?: boolean;
  value?: boolean;
  onToggle?: (value: boolean) => void;
  badge?: number;
};

export default function ProfileScreen() {
  const { gradients, isDark, colors } = useThemeColors();
  const { toggleTheme } = useTheme();
  const { user: currentUser, signOut, refreshUser } = useAuth();
  const [notificationOverride, setNotificationOverride] = useState<boolean | null>(null);
  const currentUserId = currentUser?.id || '';
  const queryClient = useQueryClient();
  const normalizedEmail = normalizeEmail(currentUser?.email) || '';
  const pendingInvitationQueryKey = useMemo(
    () => queryKeys.invitations.pendingCount(currentUserId, normalizedEmail),
    [currentUserId, normalizedEmail]
  );
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);
  const notificationsEnabled = notificationOverride ?? !!currentUser?.pushToken;

  const pendingInvitationQuery = useQuery({
    queryKey: pendingInvitationQueryKey,
    enabled: !!currentUserId,
    queryFn: async () => {
      const [friendRequests, emailInvitations] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.invitations.friendRequests(currentUserId),
          queryFn: () => friendshipService.getPendingRequests(currentUserId),
        }),
        normalizedEmail
          ? queryClient.fetchQuery({
              queryKey: queryKeys.invitations.received(currentUserId, normalizedEmail),
              queryFn: () => invitationService.getReceivedInvitations(normalizedEmail),
            })
          : Promise.resolve([]),
      ]);
      return getPendingInvitationCount(friendRequests.length, emailInvitations.length);
    },
  });
  const {
    data: pendingInvitationCountData,
    isFetching: isFetchingPendingInvitations,
    isStale: isPendingInvitationsStale,
    refetch: refetchPendingInvitations,
  } = pendingInvitationQuery;
  const pendingInvitationCount = pendingInvitationCountData ?? 0;

  useRefetchOnFocus({
    enabled: !!currentUserId,
    isFetching: isFetchingPendingInvitations,
    isStale: isPendingInvitationsStale,
    refetch: refetchPendingInvitations,
  });

  const invalidateInvitationCount = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['invitations'] });
  }, [queryClient]);

  useRealtime({
    table: 'invitations',
    filter: normalizedEmail ? `invitee_email=eq.${normalizedEmail}` : undefined,
    onChange: invalidateInvitationCount,
    enabled: !!normalizedEmail,
  });
  useRealtime({
    table: 'friendships',
    filter: currentUserId ? `friend_id=eq.${currentUserId}` : undefined,
    onChange: invalidateInvitationCount,
    enabled: !!currentUserId,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationPreference() {
      if (!currentUser?.id) {
        setNotificationOverride(null);
        return;
      }

      const preference = await notificationService.getNotificationPreference(currentUser.id);
      if (!cancelled && preference !== null) {
        setNotificationOverride(preference);
      }
    }

    loadNotificationPreference().catch(error => {
      console.error('Error loading notification preference:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  async function handleToggleNotifications(value: boolean) {
    if (!currentUser?.id) return;
    setNotificationOverride(value);
    try {
      if (value) {
        const token = await notificationService.registerForPushNotificationsAsync();
        if (token) {
          await userService.updatePushToken(currentUser.id, token);
          await notificationService.setNotificationPreference(currentUser.id, true);
          await refreshUser();
        } else {
          setNotificationOverride(false);
          await notificationService.setNotificationPreference(currentUser.id, false);
        }
      } else {
        await notificationService.setNotificationPreference(currentUser.id, false);
        await userService.updatePushToken(currentUser.id, null);
        await refreshUser();
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
      setNotificationOverride(!value);
      Alert.alert('Error', 'Failed to update notification settings');
    }
  }

  const cachedFriends = queryClient.getQueryData<Awaited<ReturnType<typeof friendSummaryService.getHomeSummaries>>>(friendsHomeQueryKey);
  const {
    data: friends = [],
    error: statsQueryError,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: friendsHomeQueryKey,
    enabled: !!currentUserId,
    initialData: cachedFriends,
    refetchOnMount: false,
    queryFn: async () => {
      return friendSummaryService.getHomeSummaries(currentUserId);
    },
  });
  const { totalOwed, totalOwing } = useMemo(() => calculateFriendSummaryTotals(friends), [friends]);
  const statsError = statsQueryError ? getFetchErrorMessage(statsQueryError) : null;

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  const loadStats = useCallback(() => {
    refetchStats();
  }, [refetchStats]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  function handleEditProfile() {
    router.push('/edit-profile');
  }

  async function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive', onPress: async () => {
          await signOut();
        }
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This will permanently remove all your data including expenses, groups, and friendships. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation for destructive action
            Alert.alert(
              'Confirm Deletion',
              'Please confirm that you want to permanently delete your account and all associated data.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      if (currentUser?.id) {
                        await userService.delete(currentUser.id);
                      }
                      await signOut();
                    } catch (error) {
                      console.error('Error deleting account:', error);
                      Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  const settingsItems: SettingsItem[] = [
    { icon: 'envelope.badge', title: 'Invitations', badge: pendingInvitationCount, onPress: () => router.push('/invitations') },
    { icon: 'person.badge.plus', title: 'Invite a Friend', onPress: () => router.push('/add-friend') },
    // { icon: 'figure.skateboarding', title: 'Loading Playground', onPress: () => setPlaygroundVisible(true) },
    { icon: 'bell.fill', title: 'Notifications', hasSwitch: true, value: notificationsEnabled, onToggle: handleToggleNotifications },
    { icon: 'moon.fill', title: 'Dark Mode', hasSwitch: true, value: isDark, onToggle: toggleTheme },
    { icon: 'lock.shield.fill', title: 'Privacy Policy', onPress: () => router.push('/privacy-policy') },
    { icon: 'doc.text.fill', title: 'Terms & Conditions', onPress: () => router.push('/terms-conditions') },
    { icon: 'questionmark.circle.fill', title: 'Help & Support', onPress: () => router.push('/help-support') },
  ];

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={[styles.headerLabel, { color: colors.textSecondary }]}>Account</ThemedText>
        </View>

        <View
          style={[
            styles.profileCard,
            !isDark && { backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <View style={[styles.avatarLarge, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <ThemedText style={[styles.avatarLargeText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
              {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
            </ThemedText>
          </View>
          <View style={styles.profileInfo}>
            <ThemedText type="subtitle" style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
              {currentUser?.name || 'User'}
            </ThemedText>
            <ThemedText style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>
              {currentUser?.email || 'No email set'}
            </ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            hitSlop={10}
            style={({ pressed }) => [
              styles.editButton,
              {
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.14)' : 'rgba(34, 197, 94, 0.1)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.26)' : 'rgba(34, 197, 94, 0.22)',
              },
              pressed && styles.pressed,
            ]}
            onPress={handleEditProfile}>
            <IconSymbol name="pencil" size={18} color={isDark ? '#2DD4BF' : colors.tint} />
          </Pressable>
        </View>

        <View
          style={[
            styles.statsSection,
            (statsLoading || statsError) && styles.statsSectionStack,
            !isDark && { backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          {statsLoading ? (
            <View style={styles.statsLoading}>
              <ActivityIndicator size="small" color={isDark ? '#2DD4BF' : colors.tint} />
            </View>
          ) : statsError ? (
            <AsyncErrorState
              variant="compact"
              message={statsError}
              onRetry={loadStats}
              title="Couldn't load balances"
            />
          ) : (
            <>
              <View style={styles.statItem}>
                <ThemedText style={[styles.statValue, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                  ${totalOwed.toFixed(2)}
                </ThemedText>
                <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>You are owed</ThemedText>
              </View>
              <View style={[styles.statDivider, !isDark && { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <ThemedText style={[styles.statValue, { color: isDark ? '#F87171' : '#DC2626' }]}>
                  ${totalOwing.toFixed(2)}
                </ThemedText>
                <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>You owe</ThemedText>
              </View>
            </>
          )}
        </View>

        <View style={styles.settingsSection}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>Settings</ThemedText>
          {pendingInvitationCount > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${pendingInvitationCount} pending invitation${pendingInvitationCount === 1 ? '' : 's'}`}
              style={({ pressed }) => [
                styles.invitationAlert,
                { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.14)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.25)' },
                pressed && styles.pressed,
              ]}
              onPress={() => router.push('/invitations')}>
              <View style={[styles.invitationAlertIcon, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.16)' }]}>
                <IconSymbol name="envelope.badge" size={18} color={isDark ? '#2DD4BF' : colors.tint} />
              </View>
              <View style={styles.invitationAlertContent}>
                <ThemedText style={[styles.invitationAlertTitle, { color: colors.text }]}>
                  You have {pendingInvitationCount} pending invitation{pendingInvitationCount === 1 ? '' : 's'}
                </ThemedText>
                <ThemedText style={[styles.invitationAlertSubtitle, { color: colors.textSecondary }]}>Review and accept or decline now</ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={16} color={isDark ? '#2DD4BF' : colors.tint} />
            </Pressable>
          )}
          <View style={[styles.settingsList, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
            {settingsItems.map((item, index) => (
              <Pressable
                key={item.title}
                style={({ pressed }) => [
                  styles.settingItem,
                  index < settingsItems.length - 1 && [
                    styles.settingItemBorder,
                    { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border },
                  ],
                  pressed && !item.hasSwitch && styles.pressed,
                ]}
                onPress={item.onPress}
                disabled={item.hasSwitch}>
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.12)' : 'rgba(34, 197, 94, 0.08)' }]}>
                    <IconSymbol name={item.icon as any} size={19} color={isDark ? '#2DD4BF' : colors.tint} />
                  </View>
                  <ThemedText style={[styles.settingTitle, { color: colors.text }]}>{item.title}</ThemedText>
                </View>
                {item.hasSwitch ? (
                  <Switch
                    value={item.value}
                    onValueChange={item.onToggle}
                    trackColor={{ false: isDark ? '#333' : '#D4D4D4', true: isDark ? 'rgba(45, 212, 191, 0.4)' : 'rgba(34, 197, 94, 0.4)' }}
                    thumbColor={item.value ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? '#666' : '#999')}
                  />
                ) : (
                  <View style={styles.settingRight}>
                    {item.badge ? (
                      <View style={[styles.invitationBadge, { backgroundColor: isDark ? '#2DD4BF' : colors.tint }]}>
                        <ThemedText style={[styles.invitationBadgeText, { color: isDark ? '#0A0A0F' : '#FFFFFF' }]}>{item.badge > 9 ? '9+' : item.badge}</ThemedText>
                      </View>
                    ) : null}
                    <IconSymbol name="chevron.right" size={16} color={isDark ? 'rgba(255,255,255,0.35)' : colors.textSecondary} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.accountActions}>
          <Pressable style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]} onPress={handleLogout}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={19} color="#EF4444" />
            <ThemedText style={styles.logoutText}>Log out</ThemedText>
          </Pressable>

          <Pressable style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]} onPress={handleDeleteAccount}>
            <ThemedText style={styles.deleteText}>Delete Account</ThemedText>
          </Pressable>
        </View>

        <ThemedText style={[styles.versionText, !isDark && { color: colors.textSecondary }]}>
          {getAppVersionLabel()}
        </ThemedText>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 58 : 52,
    paddingBottom: 10,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    borderColor: 'rgba(45, 212, 191, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
  },
  avatarLarge: {
    width: 58,
    height: 58,
    borderRadius: 15,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarLargeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2DD4BF',
    lineHeight: 28,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 17,
    color: '#fff',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderColor: 'rgba(45, 212, 191, 0.3)',
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: {
    opacity: 0.72,
  },
  statsSection: {
    flexDirection: 'row',
    marginHorizontal: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.12)',
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    marginBottom: 22,
  },
  statsSectionStack: {
    flexDirection: 'column',
  },
  statsLoading: {
    paddingVertical: 8,
    alignItems: 'center',
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#2DD4BF',
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  settingsSection: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  invitationAlert: {
    alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 12, padding: 13,
  },
  invitationAlertIcon: {
    alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', width: 36,
  },
  invitationAlertContent: { flex: 1, gap: 2 },
  invitationAlertTitle: { fontSize: 14, fontWeight: '700' },
  invitationAlertSubtitle: { fontSize: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  settingsList: {
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    borderColor: 'rgba(45, 212, 191, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  settingItemBorder: {
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  settingRight: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  invitationBadge: { alignItems: 'center', borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2 },
  invitationBadgeText: { fontSize: 11, fontWeight: '800' },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  accountActions: {
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  logoutButton: {
    borderColor: 'rgba(239, 68, 68, 0.22)',
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#fff',
    opacity: 0.5,
    marginTop: 20,
  },
});
