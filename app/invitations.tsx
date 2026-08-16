import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GenericSkeleton } from '@/components/ui/skeleton';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useRealtime } from '@/hooks/use-realtime';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { friendshipService } from '@/services/friendship-service';
import { invitationService } from '@/services/invitation-service';
import { queryKeys } from '@/services/query-keys';
import { normalizeEmail } from '@/utils/validation';
import type { Invitation } from '@/types/database';
import type { PendingFriendshipRequest } from '@/services/friendship-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

type InvitationWithDetails = Invitation & { inviterName?: string; inviteeName?: string };

type TabType = 'received' | 'sent';

export default function InvitationsScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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

  const { refetch: refetchReceivedInvitations } = receivedInvitationsQuery;
  const { refetch: refetchSentInvitations } = sentInvitationsQuery;
  const { refetch: refetchFriendRequests } = friendRequestsQuery;

  const receivedInvitations = receivedInvitationsQuery.data || [];
  const sentInvitations = sentInvitationsQuery.data || [];
  const receivedFriendRequests = friendRequestsQuery.data || [];
  const loading = [receivedInvitationsQuery, sentInvitationsQuery, friendRequestsQuery]
    .some((query) => query.isLoading && !query.data);
  const queryError = [receivedInvitationsQuery, sentInvitationsQuery, friendRequestsQuery]
    .find((query) => query.error)?.error;
  const loadError = queryError ? getFetchErrorMessage(queryError) : null;
  const noEmailForInvites = !normalizedEmail;

  const loadInvitations = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      refetchReceivedInvitations(),
      refetchSentInvitations(),
      refetchFriendRequests(),
    ]);
  }, [refetchFriendRequests, refetchReceivedInvitations, refetchSentInvitations, userId]);

  const invalidateInvitationQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['invitations'] });
  }, [queryClient]);

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

  const handleAcceptFriendRequest = useCallback(async (request: PendingFriendshipRequest) => {
    setActionLoading(request.id);
    try {
      await friendshipService.accept(request.id);
      Alert.alert('Success', `You are now connected with ${request.requesterName}`);
      loadInvitations();
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
      loadInvitations();
    } catch (error) {
      console.error('Error declining friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request');
    } finally {
      setActionLoading(null);
    }
  }, [loadInvitations]);

  const handleAccept = useCallback(async (invitation: InvitationWithDetails) => {
    setActionLoading(invitation.id);
    try {
      await invitationService.updateStatus(invitation.id, 'accepted');

      // Create friendship
      if (userId) {
        await friendshipService.createAccepted(userId, invitation.inviterId);
      }

      Alert.alert('Success', 'Invitation accepted!');
      loadInvitations();
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
              loadInvitations();
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
      loadInvitations();
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
              loadInvitations();
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

  const renderReceivedInvitation = useCallback(({ item }: { item: InvitationWithDetails }) => {
    const isLoading = actionLoading === item.id;
    const isExpired = item.expiresAt && item.expiresAt < Date.now();

    return (
      <BlurView
        intensity={isDark ? 20 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.invitationCard, isExpired ? styles.expiredCard : '']}>
        <View style={[styles.cardContent, !isDark && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
          <View style={styles.invitationHeader}>
            <View style={[styles.iconContainer, {
              backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
            }]}>
              <IconSymbol
                name="person.crop.circle.badge.plus"
                size={24}
                color={isDark ? '#2DD4BF' : colors.tint}
              />
            </View>
            <View style={styles.invitationInfo}>
              <ThemedText style={[styles.inviterName, { color: colors.text }]}>
                {item.inviterName || 'Someone'}
              </ThemedText>
              <ThemedText style={[styles.invitationDate, { color: colors.textSecondary }]}>
                {new Date(item.createdAt).toLocaleDateString()}
              </ThemedText>
            </View>
            {isExpired && (
              <View style={styles.expiredBadge}>
                <ThemedText style={styles.expiredText}>Expired</ThemedText>
              </View>
            )}
          </View>

          {!isExpired && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                onPress={() => handleAccept(item)}
                disabled={isLoading}
                style={[styles.actionButton, styles.acceptButton, {
                  backgroundColor: isDark ? '#2DD4BF' : '#22C55E',
                  opacity: isLoading ? 0.5 : 1,
                }]}>
                <IconSymbol name="checkmark" size={18} color="#0A0A0F" />
                <ThemedText style={styles.actionButtonText}>Accept</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDecline(item)}
                disabled={isLoading}
                style={[styles.actionButton, styles.declineButton, {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)',
                  opacity: isLoading ? 0.5 : 1,
                }]}>
                <IconSymbol name="xmark" size={18} color={isDark ? '#EF4444' : '#DC2626'} />
                <ThemedText style={[styles.actionButtonText, { color: isDark ? '#EF4444' : '#DC2626' }]}>
                  Decline
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </BlurView>
    );
  }, [actionLoading, colors, isDark, handleAccept, handleDecline]);

  const renderSentInvitation = useCallback(({ item }: { item: InvitationWithDetails }) => {
    const isLoading = actionLoading === item.id;
    const statusColor = item.status === 'accepted' ? '#22C55E' : item.status === 'declined' ? '#EF4444' : '#F59E0B';

    return (
      <BlurView
        intensity={isDark ? 20 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={styles.invitationCard}>
        <View style={[styles.cardContent, !isDark && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
          <View style={styles.invitationHeader}>
            <View style={[styles.iconContainer, {
              backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
            }]}>
              <IconSymbol
                name="envelope"
                size={24}
                color={isDark ? '#2DD4BF' : colors.tint}
              />
            </View>
            <View style={styles.invitationInfo}>
              <ThemedText style={[styles.inviterName, { color: colors.text }]}>
                {item.inviteeName || item.inviteeEmail}
              </ThemedText>
              <ThemedText style={[styles.invitationDate, { color: colors.textSecondary }]}>
                {new Date(item.createdAt).toLocaleDateString()}
              </ThemedText>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <ThemedText style={styles.statusText}>{item.status}</ThemedText>
            </View>
          </View>

          {item.status === 'pending' && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                onPress={() => handleResend(item)}
                disabled={isLoading}
                style={[styles.actionButton, {
                  backgroundColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.1)',
                  borderColor: isDark ? 'rgba(45, 212, 191, 0.4)' : 'rgba(34, 197, 94, 0.3)',
                  opacity: isLoading ? 0.5 : 1,
                }]}>
                <IconSymbol name="arrow.clockwise" size={18} color={isDark ? '#2DD4BF' : colors.tint} />
                <ThemedText style={[styles.actionButtonText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                  Resend
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleCancel(item)}
                disabled={isLoading}
                style={[styles.actionButton, styles.declineButton, {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)',
                  opacity: isLoading ? 0.5 : 1,
                }]}>
                <IconSymbol name="trash" size={18} color={isDark ? '#EF4444' : '#DC2626'} />
                <ThemedText style={[styles.actionButtonText, { color: isDark ? '#EF4444' : '#DC2626' }]}>
                  Cancel
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </BlurView>
    );
  }, [actionLoading, colors, isDark, handleResend, handleCancel]);

  const currentInvitations = activeTab === 'received' ? receivedInvitations : sentInvitations;
  const receivedCount = receivedInvitations.length + receivedFriendRequests.length;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

        <NavigationHeader title="Invitations" onBack={() => router.back()} />

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            onPress={() => setActiveTab('received')}
            style={[
              styles.tab,
              activeTab === 'received' && styles.activeTab,
              {
                backgroundColor: activeTab === 'received'
                  ? (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.1)')
                  : 'transparent',
                borderBottomColor: activeTab === 'received'
                  ? (isDark ? '#2DD4BF' : colors.tint)
                  : 'transparent',
              },
            ]}>
            <ThemedText style={[
              styles.tabText,
              activeTab === 'received' && styles.activeTabText,
              activeTab === 'received' && { color: isDark ? '#2DD4BF' : colors.tint },
              { color: colors.text },
            ]}>
              Received ({receivedCount})
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('sent')}
            style={[
              styles.tab,
              activeTab === 'sent' && styles.activeTab,
              {
                backgroundColor: activeTab === 'sent'
                  ? (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.1)')
                  : 'transparent',
                borderBottomColor: activeTab === 'sent'
                  ? (isDark ? '#2DD4BF' : colors.tint)
                  : 'transparent',
              },
            ]}>
            <ThemedText style={[
              styles.tabText,
              activeTab === 'sent' && styles.activeTabText,
              activeTab === 'sent' && { color: isDark ? '#2DD4BF' : colors.tint },
              { color: colors.text },
            ]}>
              Sent ({sentInvitations.length})
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <GenericSkeleton />
        ) : loadError ? (
          <AsyncErrorState
            message={loadError}
            onRetry={loadInvitations}
            title="Couldn't load invitations"
          />
        ) : (
          <FlatList
            data={currentInvitations}
            renderItem={activeTab === 'received' ? renderReceivedInvitation : renderSentInvitation}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={activeTab === 'received' && receivedFriendRequests.length > 0 ? (
              <View>
                {receivedFriendRequests.map((request) => {
                  const isLoading = actionLoading === request.id;
                  return (
                    <BlurView key={request.id} intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={styles.invitationCard}>
                      <View style={[styles.cardContent, !isDark && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
                        <View style={styles.invitationHeader}>
                          <View style={[styles.iconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
                            <IconSymbol name="person.crop.circle.badge.plus" size={24} color={isDark ? '#2DD4BF' : colors.tint} />
                          </View>
                          <View style={styles.invitationInfo}>
                            <ThemedText style={[styles.inviterName, { color: colors.text }]}>{request.requesterName}</ThemedText>
                            <ThemedText style={[styles.invitationDate, { color: colors.textSecondary }]}>wants to be your friend</ThemedText>
                          </View>
                        </View>
                        <View style={styles.actionButtons}>
                          <TouchableOpacity onPress={() => handleDeclineFriendRequest(request)} disabled={isLoading} style={[styles.actionButton, styles.declineButton, { opacity: isLoading ? 0.5 : 1 }]}>
                            <ThemedText style={[styles.actionButtonText, { color: isDark ? '#EF4444' : '#DC2626' }]}>Decline</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleAcceptFriendRequest(request)} disabled={isLoading} style={[styles.actionButton, styles.acceptButton, { backgroundColor: isDark ? '#2DD4BF' : '#22C55E', opacity: isLoading ? 0.5 : 1 }]}>
                            <ThemedText style={styles.actionButtonText}>Accept</ThemedText>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </BlurView>
                  );
                })}
                {receivedInvitations.length > 0 && <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>App invitations</ThemedText>}
              </View>
            ) : null}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <IconSymbol
                  name={activeTab === 'received' ? 'envelope.open' : 'paperplane'}
                  size={64}
                  color={isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)'}
                />
                <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {activeTab === 'received'
                    ? receivedFriendRequests.length > 0
                      ? 'No app invitations received'
                      : noEmailForInvites
                      ? 'Friend invitations are sent to your email. Add an email in your profile so pending invites appear here.'
                      : 'No invitations received'
                    : 'No invitations sent'}
                </ThemedText>
              </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderRadius: 8,
  },
  activeTab: {
    borderBottomWidth: 3,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: '700',
  },
  listContent: {
    padding: 20,
    paddingTop: 0,
  },
  invitationCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  expiredCard: {
    opacity: 0.6,
  },
  cardContent: {
    padding: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
  },
  invitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  invitationInfo: {
    flex: 1,
  },
  inviterName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  invitationDate: {
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    textTransform: 'capitalize',
  },
  expiredBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#6B7280',
  },
  expiredText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
  },
  acceptButton: {
    borderWidth: 0,
  },
  declineButton: {
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A0A0F',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
});
