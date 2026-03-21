import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { friendshipService } from '@/services/friendship-service';
import { invitationService } from '@/services/invitation-service';
import type { Invitation } from '@/types/database';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
  const [receivedInvitations, setReceivedInvitations] = useState<InvitationWithDetails[]>([]);
  const [sentInvitations, setSentInvitations] = useState<InvitationWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      loadInvitations();
    }, [])
  );

  const loadInvitations = async () => {
    if (!user?.email) return;

    try {
      // Only show loader on first load
      if (!hasLoadedOnce.current) {
        setLoading(true);
        hasLoadedOnce.current = true;
      }

      const received = await invitationService.getReceivedInvitations(user.email);
      setReceivedInvitations(received);

      // Load sent invitations
      const sent = await invitationService.getByInviter(user.id);
      setSentInvitations(sent);
    } catch (error) {
      console.error('Error loading invitations:', error);
      Alert.alert('Error', 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  }

  const handleAccept = async (invitation: InvitationWithDetails) => {
    setActionLoading(invitation.id);
    try {
      await invitationService.updateStatus(invitation.id, 'accepted');

      // Create friendship
      if (user?.id) {
        await friendshipService.createAccepted(user.id, invitation.inviterId);
      }

      Alert.alert('Success', 'Invitation accepted!');
      loadInvitations();
    } catch (error) {
      console.error('Error accepting invitation:', error);
      Alert.alert('Error', 'Failed to accept invitation');
    } finally {
      setActionLoading(null);
    }
  }

  const handleDecline = async (invitation: InvitationWithDetails) => {
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
  }

  const handleResend = async (invitation: InvitationWithDetails) => {
    setActionLoading(invitation.id);
    try {
      await invitationService.resend(invitation.id, user?.name);
      Alert.alert('Success', 'Invitation resent!');
      loadInvitations();
    } catch (error) {
      console.error('Error resending invitation:', error);
      Alert.alert('Error', 'Failed to resend invitation');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel(invitation: InvitationWithDetails) {
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
  }

  function renderReceivedInvitation({ item }: { item: InvitationWithDetails }) {
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
  }

  function renderSentInvitation({ item }: { item: InvitationWithDetails }) {
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
  }

  const currentInvitations = activeTab === 'received' ? receivedInvitations : sentInvitations;

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
              Received ({receivedInvitations.length})
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
          <LoadingState message="Loading invitations..." />
        ) : (
          <FlatList
            data={currentInvitations}
            renderItem={activeTab === 'received' ? renderReceivedInvitation : renderSentInvitation}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <IconSymbol
                  name={activeTab === 'received' ? 'envelope.open' : 'paperplane'}
                  size={64}
                  color={isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)'}
                />
                <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {activeTab === 'received'
                    ? 'No invitations received'
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
