import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { GenericSkeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  ACCENT_TEAL,
  BG_ICON_DARK,
  BG_ICON_LIGHT,
  BORDER_ACCENT_DARK,
  BORDER_ACCENT_LIGHT,
} from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context-otp';
import { useRealtime } from '@/hooks/use-realtime';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import type { PendingFriendshipRequest, SentFriendshipRequest } from '@/services/friendship-service';
import { friendshipService } from '@/services/friendship-service';
import { invitationService } from '@/services/invitation-service';
import { queryKeys } from '@/services/query-keys';
import type { Invitation } from '@/types/database';
import { formatDate } from '@/utils/date';
import { getSentInvitationDisplay } from '@/utils/invitation-display';
import { normalizeEmail } from '@/utils/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

type InvitationWithDetails = Invitation & {
  inviterName?: string;
  inviteeName?: string;
  groupName?: string;
};
type TabType = 'received' | 'sent';

type ReceivedListItem =
  | { type: 'section_header'; id: string; title: string; count: number }
  | { type: 'friend_request'; id: string; data: PendingFriendshipRequest }
  | { type: 'email_invitation'; id: string; data: InvitationWithDetails };

type SentListItem =
  | { type: 'section_header'; id: string; title: string; count: number }
  | { type: 'friend_request'; id: string; data: SentFriendshipRequest }
  | { type: 'email_invitation'; id: string; data: InvitationWithDetails };

function getRequesterDisplayName(request: PendingFriendshipRequest): string {
  return request.requesterName?.trim()
    || request.requesterEmail?.split('@')[0]
    || 'Someone';
}

export default function InvitationsScreen() {
  const { gradients, colors, invitations, isDark } = useThemeColors();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const userId = user?.id;
  const userName = user?.name;
  const normalizedEmail = normalizeEmail(user?.email);

  const receivedInvitationsQueryKey = useMemo(
    () => queryKeys.invitations.received(userId || '', normalizedEmail || ''),
    [normalizedEmail, userId]
  );
  const sentInvitationsQueryKey = useMemo(
    () => queryKeys.invitations.sent(userId || ''),
    [userId]
  );
  const friendRequestsQueryKey = useMemo(
    () => queryKeys.invitations.friendRequests(userId || ''),
    [userId]
  );
  const sentRequestsQueryKey = useMemo(
    () => queryKeys.invitations.sentRequests(userId || ''),
    [userId]
  );

  const receivedInvitationsQuery = useQuery({
    queryKey: receivedInvitationsQueryKey,
    enabled: !!userId && !!normalizedEmail,
    queryFn: () => invitationService.getReceivedInvitations(normalizedEmail!),
  });
  const sentInvitationsQuery = useQuery({
    queryKey: sentInvitationsQueryKey,
    enabled: !!userId,
    queryFn: () => invitationService.getByInviter(userId!),
  });
  const friendRequestsQuery = useQuery({
    queryKey: friendRequestsQueryKey,
    enabled: !!userId,
    queryFn: () => friendshipService.getPendingRequestsWithRequesters(userId!),
  });
  const sentRequestsQuery = useQuery({
    queryKey: sentRequestsQueryKey,
    enabled: !!userId,
    queryFn: () => friendshipService.getSentRequestsWithRecipients(userId!),
  });

  const { refetch: refetchReceivedInvitations } = receivedInvitationsQuery;
  const { refetch: refetchSentInvitations } = sentInvitationsQuery;
  const { refetch: refetchFriendRequests } = friendRequestsQuery;
  const { refetch: refetchSentRequests } = sentRequestsQuery;

  const receivedInvitations = useMemo(
    () => receivedInvitationsQuery.data || [],
    [receivedInvitationsQuery.data]
  );
  const sentInvitations = useMemo(
    () => sentInvitationsQuery.data || [],
    [sentInvitationsQuery.data]
  );
  const receivedFriendRequests = useMemo(
    () => friendRequestsQuery.data || [],
    [friendRequestsQuery.data]
  );
  const sentFriendRequests = useMemo(
    () => sentRequestsQuery.data || [],
    [sentRequestsQuery.data]
  );

  const loading = [receivedInvitationsQuery, sentInvitationsQuery, friendRequestsQuery, sentRequestsQuery]
    .some((query) => query.isLoading && !query.data);
  const queryError = [receivedInvitationsQuery, sentInvitationsQuery, friendRequestsQuery, sentRequestsQuery]
    .find((query) => query.error)?.error;
  const loadError = queryError ? getFetchErrorMessage(queryError) : null;
  const noEmailForInvites = !normalizedEmail;

  const invalidateInvitationQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['invitations'] });
  }, [queryClient]);

  const loadInvitations = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      refetchReceivedInvitations(),
      refetchSentInvitations(),
      refetchFriendRequests(),
      refetchSentRequests(),
    ]);
    invalidateInvitationQueries();
  }, [
    invalidateInvitationQueries,
    refetchFriendRequests,
    refetchReceivedInvitations,
    refetchSentInvitations,
    refetchSentRequests,
    userId,
  ]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInvitations();
    } finally {
      setRefreshing(false);
    }
  }, [loadInvitations]);

  useRealtime({
    table: 'invitations',
    filter: normalizedEmail ? `invitee_email=eq.${normalizedEmail}` : undefined,
    onChange: invalidateInvitationQueries,
    enabled: !!normalizedEmail,
  });
  useRealtime({
    table: 'invitations',
    filter: userId ? `inviter_id=eq.${userId}` : undefined,
    onChange: invalidateInvitationQueries,
    enabled: !!userId,
  });
  useRealtime({
    table: 'friendships',
    filter: userId ? `friend_id=eq.${userId}` : undefined,
    onChange: invalidateInvitationQueries,
    enabled: !!userId,
  });
  useRealtime({
    table: 'friendships',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    onChange: invalidateInvitationQueries,
    enabled: !!userId,
  });

  const handleAcceptFriendRequest = useCallback(async (request: PendingFriendshipRequest) => {
    setActionLoading(request.id);
    try {
      await friendshipService.accept(request.id);
      Alert.alert('Success', `You are now connected with ${getRequesterDisplayName(request)}`);
      await loadInvitations();
    } catch (error) {
      console.error('Error accepting friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request');
    } finally {
      setActionLoading(null);
    }
  }, [loadInvitations]);

  const handleDeclineFriendRequest = useCallback(async (request: PendingFriendshipRequest) => {
    setActionLoading(request.id);
    try {
      await friendshipService.decline(request.id);
      await loadInvitations();
    } catch (error) {
      console.error('Error declining friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request');
    } finally {
      setActionLoading(null);
    }
  }, [loadInvitations]);

  const handleCancelFriendRequest = useCallback(async (request: SentFriendshipRequest) => {
    Alert.alert(
      'Cancel Request',
      `Cancel your friend request to ${request.recipientName}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(request.id);
            try {
              await friendshipService.cancel(request.id);
              await loadInvitations();
            } catch (error) {
              console.error('Error cancelling friend request:', error);
              Alert.alert('Error', 'Failed to cancel friend request');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }, [loadInvitations]);

  const handleResendFriendRequest = useCallback((request: SentFriendshipRequest) => {
    if (!userId) return;

    Alert.alert(
      'Send request again?',
      `Send a new friend request to ${request.recipientName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setActionLoading(request.id);
            try {
              await friendshipService.create(userId, request.friendId);
              await loadInvitations();
            } catch (error) {
              console.error('Error resending friend request:', error);
              Alert.alert('Error', 'Failed to resend friend request');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  }, [loadInvitations, userId]);

  const handleAccept = useCallback(async (invitation: InvitationWithDetails) => {
    setActionLoading(invitation.id);
    try {
      const fresh = await invitationService.getById(invitation.id);
      if (!fresh || fresh.status !== 'pending' || (fresh.expiresAt && fresh.expiresAt < Date.now())) {
        Alert.alert('No longer available', 'This invitation is no longer pending.');
        await loadInvitations();
        return;
      }

      await invitationService.updateStatus(invitation.id, 'accepted');

      if (userId) {
        await friendshipService.createAccepted(userId, invitation.inviterId);
      }

      Alert.alert('Success', 'Invitation accepted!');
      await loadInvitations();
    } catch (error) {
      console.error('Error accepting invitation:', error);
      Alert.alert('Error', 'Failed to accept invitation');
    } finally {
      setActionLoading(null);
    }
  }, [userId, loadInvitations]);

  const handleDecline = useCallback(async (invitation: InvitationWithDetails) => {
    Alert.alert(
      'Decline Invitation',
      'Are you sure you want to decline this invitation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(invitation.id);
            try {
              await invitationService.updateStatus(invitation.id, 'declined');
              Alert.alert('Success', 'Invitation declined');
              await loadInvitations();
            } catch (error) {
              console.error('Error declining invitation:', error);
              Alert.alert('Error', 'Failed to decline invitation');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }, [loadInvitations]);

  const handleResend = useCallback(async (invitation: InvitationWithDetails) => {
    setActionLoading(invitation.id);
    try {
      await invitationService.resend(invitation.id, userName);
      Alert.alert('Success', 'Invitation resent!');
      await loadInvitations();
    } catch (error) {
      console.error('Error resending invitation:', error);
      Alert.alert('Error', 'Failed to resend invitation');
    } finally {
      setActionLoading(null);
    }
  }, [userName, loadInvitations]);

  const handleCancel = useCallback(async (invitation: InvitationWithDetails) => {
    Alert.alert(
      'Cancel Invitation',
      'Are you sure you want to cancel this invitation?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(invitation.id);
            try {
              await invitationService.delete(invitation.id);
              Alert.alert('Success', 'Invitation cancelled');
              await loadInvitations();
            } catch (error) {
              console.error('Error cancelling invitation:', error);
              Alert.alert('Error', 'Failed to cancel invitation');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }, [loadInvitations]);

  const receivedCount = receivedInvitations.length + receivedFriendRequests.length;
  const sentCount = sentInvitations.length + sentFriendRequests.length;

  const receivedListItems = useMemo<ReceivedListItem[]>(() => {
    const items: ReceivedListItem[] = [];
    const hasFriendRequests = receivedFriendRequests.length > 0;
    const hasEmailInvitations = receivedInvitations.length > 0;
    const showHeaders = hasFriendRequests && hasEmailInvitations;

    if (hasFriendRequests) {
      if (showHeaders) {
        items.push({
          type: 'section_header',
          id: 'hdr-friend-requests',
          title: 'Friend requests',
          count: receivedFriendRequests.length,
        });
      }
      for (const req of receivedFriendRequests) {
        items.push({ type: 'friend_request', id: req.id, data: req });
      }
    }

    if (hasEmailInvitations) {
      if (showHeaders) {
        items.push({
          type: 'section_header',
          id: 'hdr-email-invitations',
          title: 'Email invitations',
          count: receivedInvitations.length,
        });
      }
      for (const inv of receivedInvitations) {
        items.push({ type: 'email_invitation', id: inv.id, data: inv });
      }
    }

    return items;
  }, [receivedFriendRequests, receivedInvitations]);

  const sentListItems = useMemo<SentListItem[]>(() => {
    const items: SentListItem[] = [];
    const hasFriendRequests = sentFriendRequests.length > 0;
    const hasEmailInvitations = sentInvitations.length > 0;
    const showHeaders = hasFriendRequests && hasEmailInvitations;

    if (hasFriendRequests) {
      if (showHeaders) {
        items.push({
          type: 'section_header',
          id: 'hdr-sent-friend-requests',
          title: 'Friend requests',
          count: sentFriendRequests.length,
        });
      }
      for (const req of sentFriendRequests) {
        items.push({ type: 'friend_request', id: req.id, data: req });
      }
    }

    if (hasEmailInvitations) {
      if (showHeaders) {
        items.push({
          type: 'section_header',
          id: 'hdr-sent-email-invitations',
          title: 'Email invitations',
          count: sentInvitations.length,
        });
      }
      for (const inv of sentInvitations) {
        items.push({ type: 'email_invitation', id: inv.id, data: inv });
      }
    }

    return items;
  }, [sentFriendRequests, sentInvitations]);

  const cardSurfaceStyle = useMemo(
    () => ({
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.72)' : '#FFFFFF',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
    }),
    [colors.border, isDark]
  );

  const renderReceivedItem = useCallback(
    ({ item }: { item: ReceivedListItem }) => {
      if (item.type === 'section_header') {
        return (
          <View style={styles.sectionHeader}>
            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {item.title} ({item.count})
            </ThemedText>
          </View>
        );
      }

      if (item.type === 'friend_request') {
        const req = item.data;
        const isLoading = actionLoading === req.id;
        const requesterName = getRequesterDisplayName(req);
        const requestMetadata = `Wants to be your friend · ${formatDate(req.createdAt, 'monthDay')}`;

        return (
          <View style={[styles.card, cardSurfaceStyle]}>
            <View style={styles.cardHeader}>
              <UserAvatar name={requesterName} size="md" />
              <View style={styles.cardTextContainer}>
                <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.cardTitle}>
                  {requesterName}
                </ThemedText>
                {req.requesterEmail ? (
                  <ThemedText numberOfLines={1} style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    {req.requesterEmail}
                  </ThemedText>
                ) : null}
                <ThemedText numberOfLines={1} style={[styles.cardDate, { color: colors.textSecondary }]}>
                  {requestMetadata}
                </ThemedText>
              </View>
              <View style={[styles.statusBadge, styles.statusBadgePending]}>
                <ThemedText style={[styles.statusBadgeText, styles.statusTextPending]}>
                  Pending
                </ThemedText>
              </View>
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => handleDeclineFriendRequest(req)}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Decline friend request from ${requesterName}`}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                style={[
                  styles.actionButton,
                  styles.actionButtonSecondary,
                  {
                    backgroundColor: invitations.dangerSurface,
                    borderColor: invitations.dangerBorder,
                    opacity: isLoading ? 0.5 : 1,
                  },
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={invitations.danger} />
                ) : (
                  <>
                    <IconSymbol name="xmark" size={16} color={invitations.danger} />
                    <ThemedText style={[styles.actionText, { color: invitations.danger }]}>
                      Decline
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleAcceptFriendRequest(req)}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Accept friend request from ${requesterName}`}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                style={[
                  styles.actionButton,
                  styles.actionButtonPrimary,
                  {
                    backgroundColor: isDark ? '#0D9488' : '#0F4C3A',
                    opacity: isLoading ? 0.5 : 1,
                  },
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <IconSymbol name="checkmark" size={16} color="#FFFFFF" />
                    <ThemedText style={[styles.actionText, styles.actionTextPrimary]}>
                      Accept
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      }

      // email invitation
      const inv = item.data;
      const isLoading = actionLoading === inv.id;
      const isExpired = Boolean(inv.expiresAt && inv.expiresAt < Date.now());
      const displayName = inv.inviterName?.trim() || 'A friend';
      const subtitle = inv.groupName
        ? `Invited you to join ${inv.groupName}`
        : 'Invited you to connect on Vasuli';

      return (
        <View
          style={[
            styles.card,
            cardSurfaceStyle,
            isExpired ? styles.cardExpired : undefined,
          ]}
        >
          <View style={styles.cardHeader}>
            <UserAvatar name={displayName} size="md" />
            <View style={styles.cardTextContainer}>
              <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.cardTitle}>
                {displayName}
              </ThemedText>
              <ThemedText style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                {subtitle}
              </ThemedText>
              <ThemedText style={[styles.cardDate, { color: colors.textSecondary }]}>
                {formatDate(inv.createdAt, 'monthDay')}
              </ThemedText>
            </View>
            <View
              style={[
                styles.statusBadge,
                isExpired ? styles.statusBadgeExpired : styles.statusBadgePending,
              ]}
            >
              <ThemedText
                style={[
                  styles.statusBadgeText,
                  isExpired ? styles.statusTextExpired : styles.statusTextPending,
                ]}
              >
                {isExpired ? 'Expired' : 'Pending'}
              </ThemedText>
            </View>
          </View>

          {!isExpired && (
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => handleDecline(inv)}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Decline invitation from ${displayName}`}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                style={[
                  styles.actionButton,
                  styles.actionButtonSecondary,
                  {
                    backgroundColor: invitations.dangerSurface,
                    borderColor: invitations.dangerBorder,
                    opacity: isLoading ? 0.5 : 1,
                  },
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={invitations.danger} />
                ) : (
                  <>
                    <IconSymbol name="xmark" size={16} color={invitations.danger} />
                    <ThemedText style={[styles.actionText, { color: invitations.danger }]}>
                      Decline
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleAccept(inv)}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Accept invitation from ${displayName}`}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                style={[
                  styles.actionButton,
                  styles.actionButtonPrimary,
                  {
                    backgroundColor: isDark ? '#0D9488' : '#0F4C3A',
                    opacity: isLoading ? 0.5 : 1,
                  },
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <IconSymbol name="checkmark" size={16} color="#FFFFFF" />
                    <ThemedText style={[styles.actionText, styles.actionTextPrimary]}>
                      Accept
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [
      actionLoading,
      cardSurfaceStyle,
      colors.textSecondary,
      handleAccept,
      handleAcceptFriendRequest,
      handleDecline,
      handleDeclineFriendRequest,
      invitations.danger,
      invitations.dangerBorder,
      invitations.dangerSurface,
      isDark,
    ]
  );

  const renderSentItem = useCallback(
    ({ item }: { item: SentListItem }) => {
      if (item.type === 'section_header') {
        return (
          <View style={styles.sectionHeader}>
            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {item.title} ({item.count})
            </ThemedText>
          </View>
        );
      }

      if (item.type === 'friend_request') {
        const req = item.data;
        const isLoading = actionLoading === req.id;
        const isPending = req.status === 'pending';

        return (
          <View style={[
            styles.card,
            styles.sentFriendRequestCard,
            cardSurfaceStyle,
          ]}>
            <View style={[styles.cardHeader, styles.compactCardHeader]}>
              <UserAvatar name={req.recipientName} size={36} />
              <View style={[styles.cardTextContainer, styles.compactCardTextContainer]}>
                <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.cardTitle}>
                  {req.recipientName}
                </ThemedText>
                <ThemedText style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  {req.recipientEmail || 'Friend request sent'}
                </ThemedText>
                <ThemedText style={[styles.cardDate, { color: colors.textSecondary }]}>
                  {isPending ? formatDate(req.createdAt, 'short') : `Declined · ${formatDate(req.createdAt, 'short')}`}
                </ThemedText>
              </View>
              <View style={[
                styles.statusBadge,
                {
                  backgroundColor: isPending ? invitations.pendingSurface : invitations.dangerSurface,
                  borderColor: isPending ? invitations.pendingBorder : invitations.dangerBorder,
                },
              ]}>
                <ThemedText style={[styles.statusBadgeText, { color: isPending ? invitations.pendingText : invitations.danger }]}>
                  {isPending ? 'Pending' : 'Declined'}
                </ThemedText>
              </View>
            </View>

            <View style={[styles.cancelInvitationFooter, { borderTopColor: invitations.divider }]}>
              <TouchableOpacity
                onPress={() => isPending
                  ? handleCancelFriendRequest(req)
                  : handleResendFriendRequest(req)}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={isPending
                  ? `Cancel invitation to ${req.recipientName}`
                  : `Send friend request again to ${req.recipientName}`}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                style={[
                  styles.actionButton,
                  {
                    opacity: isLoading ? 0.5 : 1,
                  },
                  styles.cancelInvitationAction,
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={isPending ? invitations.danger : invitations.icon} />
                ) : (
                  <>
                    <IconSymbol
                      name={isPending ? 'trash.fill' : 'arrow.clockwise'}
                      size={15}
                      color={isPending ? invitations.danger : invitations.icon}
                    />
                    <ThemedText style={[styles.actionText, { color: isPending ? invitations.danger : invitations.icon }]}>
                      {isPending ? 'Cancel invitation' : 'Send again'}
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      }

      // email invitation
      const inv = item.data;
      const isLoading = actionLoading === inv.id;
      const display = getSentInvitationDisplay(inv);
      const isPending = inv.status === 'pending';
      const isAccepted = inv.status === 'accepted';
      const isDeclined = inv.status === 'declined';

      const statusBadgeStyle = isAccepted
        ? styles.statusBadgeAccepted
        : isDeclined
          ? styles.statusBadgeDeclined
          : styles.statusBadgePending;

      const statusTextStyle = isAccepted
        ? styles.statusTextAccepted
        : isDeclined
          ? styles.statusTextDeclined
          : styles.statusTextPending;

      return (
        <View style={[styles.card, cardSurfaceStyle]}>
          <View style={styles.cardHeader}>
            <UserAvatar name={display.title} size="md" />
            <View style={styles.cardTextContainer}>
              <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.cardTitle}>
                {display.title}
              </ThemedText>
              <ThemedText style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                {display.subtitle || 'Email invitation'}
              </ThemedText>
              <ThemedText style={[styles.cardDate, { color: colors.textSecondary }]}>
                {formatDate(inv.createdAt, 'monthDay')}
              </ThemedText>
            </View>
            <View style={[styles.statusBadge, statusBadgeStyle]}>
              <ThemedText style={[styles.statusBadgeText, statusTextStyle]}>
                {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
              </ThemedText>
            </View>
          </View>

          {isPending && (
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => handleResend(inv)}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Resend invitation to ${display.title}`}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                style={[
                  styles.actionButton,
                  styles.actionButtonSecondary,
                  {
                    backgroundColor: isDark ? BG_ICON_DARK : BG_ICON_LIGHT,
                    borderColor: isDark ? BORDER_ACCENT_DARK : BORDER_ACCENT_LIGHT,
                    opacity: isLoading ? 0.5 : 1,
                  },
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={isDark ? ACCENT_TEAL : colors.tint} />
                ) : (
                  <>
                    <IconSymbol
                      name="arrow.clockwise"
                      size={16}
                      color={isDark ? ACCENT_TEAL : colors.tint}
                    />
                    <ThemedText
                      style={[
                        styles.actionText,
                        { color: isDark ? ACCENT_TEAL : colors.tint },
                      ]}
                    >
                      Resend
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleCancel(inv)}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Cancel invitation to ${display.title}`}
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
                style={[
                  styles.actionButton,
                  styles.actionButtonSecondary,
                  {
                    backgroundColor: invitations.dangerSurface,
                    borderColor: invitations.dangerBorder,
                    opacity: isLoading ? 0.5 : 1,
                  },
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={invitations.danger} />
                ) : (
                  <>
                    <IconSymbol name="trash.fill" size={15} color={invitations.danger} />
                    <ThemedText style={[styles.actionText, { color: invitations.danger }]}>
                      Cancel
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [
      actionLoading,
      cardSurfaceStyle,
      colors.textSecondary,
      colors.tint,
      handleCancel,
      handleCancelFriendRequest,
      handleResendFriendRequest,
      handleResend,
      invitations.danger,
      invitations.dangerBorder,
      invitations.dangerSurface,
      invitations.icon,
      isDark,
    ]
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

        <NavigationHeader title="Invitations" onBack={() => router.back()} />

        {/* Segmented Tab Pill Control */}
        <View
          style={[
            styles.tabContainer,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => setActiveTab('received')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'received' }}
            accessibilityLabel={`Received invitations, ${receivedCount} items`}
            style={[
              styles.tabPill,
              activeTab === 'received' && [
                styles.tabPillActive,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)',
                },
              ],
            ]}
          >
            <ThemedText
              type={activeTab === 'received' ? 'defaultSemiBold' : 'default'}
              style={[
                styles.tabLabel,
                { color: activeTab === 'received' ? (isDark ? '#F8FAFC' : colors.text) : colors.textSecondary },
              ]}
            >
              Received
            </ThemedText>
            <View
              style={[
                styles.tabBadge,
                {
                  backgroundColor:
                    activeTab === 'received'
                      ? isDark
                        ? '#0D9488'
                        : '#0F4C3A'
                      : isDark
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.tabBadgeText,
                  {
                    color:
                      activeTab === 'received'
                        ? '#FFFFFF'
                        : colors.textSecondary,
                  },
                ]}
              >
                {receivedCount}
              </ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('sent')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'sent' }}
            accessibilityLabel={`Sent invitations, ${sentCount} items`}
            style={[
              styles.tabPill,
              activeTab === 'sent' && [
                styles.tabPillActive,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)',
                },
              ],
            ]}
          >
            <ThemedText
              type={activeTab === 'sent' ? 'defaultSemiBold' : 'default'}
              style={[
                styles.tabLabel,
                { color: activeTab === 'sent' ? (isDark ? '#F8FAFC' : colors.text) : colors.textSecondary },
              ]}
            >
              Sent
            </ThemedText>
            <View
              style={[
                styles.tabBadge,
                {
                  backgroundColor:
                    activeTab === 'sent'
                      ? isDark
                        ? '#0D9488'
                        : '#0F4C3A'
                      : isDark
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.tabBadgeText,
                  {
                    color:
                      activeTab === 'sent'
                        ? '#FFFFFF'
                        : colors.textSecondary,
                  },
                ]}
              >
                {sentCount}
              </ThemedText>
            </View>
          </TouchableOpacity>
        </View>

        {/* Body Content */}
        {loading ? (
          <GenericSkeleton />
        ) : loadError ? (
          <AsyncErrorState
            message={loadError}
            onRetry={loadInvitations}
            title="Couldn't load invitations"
          />
        ) : activeTab === 'received' ? (
          <FlatList
            data={receivedListItems}
            renderItem={renderReceivedItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.tint}
                colors={[colors.tint]}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="envelope.open"
                title="No invitations received"
                subtitle={
                  noEmailForInvites
                    ? 'Friend invitations are sent to your email. Add an email in your profile so pending invites appear here.'
                    : 'When friends invite you to split expenses, their requests will show up here.'
                }
              />
            }
          />
        ) : (
          <FlatList
            data={sentListItems}
            renderItem={renderSentItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.tint}
                colors={[colors.tint]}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="paperplane"
                title="No invitations sent"
                subtitle="You haven't sent any invitations or friend requests yet."
                buttonLabel="Add Friend"
                onButtonPress={() => router.push('/add-friend')}
              />
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabPillActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 14,
  },
  tabBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  sectionHeader: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sentFriendRequestCard: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 0,
  },
  cardExpired: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compactCardHeader: {
    gap: 8,
  },
  cardTextContainer: {
    flex: 1,
    gap: 3,
  },
  compactCardTextContainer: {
    gap: 0,
  },
  cardTitle: {
    fontSize: 16,
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  cardDate: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  statusTextPending: {
    color: '#D97706',
  },
  statusBadgeAccepted: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  statusTextAccepted: {
    color: '#16A34A',
  },
  statusBadgeDeclined: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusTextDeclined: {
    color: '#DC2626',
  },
  statusBadgeExpired: {
    backgroundColor: 'rgba(107, 114, 128, 0.12)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  statusTextExpired: {
    color: '#6B7280',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
  },
  cancelInvitationFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  actionButtonPrimary: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButtonSecondary: {
    borderWidth: 1,
  },
  cancelInvitationAction: {
    alignSelf: 'stretch',
    borderWidth: 0,
    flex: 0,
    justifyContent: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionTextPrimary: {
    color: '#FFFFFF',
  },
});
