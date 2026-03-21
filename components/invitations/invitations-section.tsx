import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { invitationService } from '@/services/invitation-service';
import type { Invitation } from '@/types/database';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

interface InvitationWithInviter extends Invitation {
  inviterName?: string;
}

export function InvitationsSection() {
  const { colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [receivedInvitations, setReceivedInvitations] = useState<InvitationWithInviter[]>([]);
  const [sentInvitations, setSentInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (user.email) {
        const received = await invitationService.getReceivedInvitations(user.email);
        setReceivedInvitations(received);
      } else {
        setReceivedInvitations([]);
      }

      // Load sent invitations
      const sent = await invitationService.getByInviter(user.id);
      setSentInvitations(sent.filter(inv => inv.status === 'pending'));
    } catch (error) {
      console.error('Error loading invitations:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  async function handleAccept(invitation: InvitationWithInviter) {
    setActionLoading(invitation.id);
    try {
      await invitationService.updateStatus(invitation.id, 'accepted');
      
      // Create friendship between inviter and current user
      const { friendshipService } = await import('@/services/friendship-service');
      const currentUserId = user?.id;
      if (currentUserId) {
        await friendshipService.createAccepted(currentUserId, invitation.inviterId);
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

  async function handleDecline(invitation: InvitationWithInviter) {
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

  async function handleResend(invitation: Invitation) {
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

  async function handleCancel(invitation: Invitation) {
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
              loadInvitations();
            } catch (error) {
              console.error('Error canceling invitation:', error);
              Alert.alert('Error', 'Failed to cancel invitation');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }

  const totalCount = receivedInvitations.length + sentInvitations.length;

  if (loading) {
    return (
      <View style={styles.section}>
        <ThemedText style={[styles.sectionTitle, !isDark && { color: colors.textSecondary }]}>
          Invitations
        </ThemedText>
        <View style={[styles.loadingContainer, { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card }]}>
          <ActivityIndicator size="small" color={isDark ? '#2DD4BF' : colors.tint} />
        </View>
      </View>
    );
  }

  if (totalCount === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, !isDark && { color: colors.textSecondary }]}>
        Invitations
      </ThemedText>

      {/* Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card }]}>
        <Pressable
          style={[
            styles.tab,
            activeTab === 'received' && [styles.tabActive, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.15)' }],
          ]}
          onPress={() => setActiveTab('received')}>
          <IconSymbol
            name="envelope.fill"
            size={16}
            color={activeTab === 'received' ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary)}
          />
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'received' && { color: isDark ? '#2DD4BF' : colors.tint },
              !isDark && activeTab !== 'received' && { color: colors.textSecondary },
            ]}>
            Received ({receivedInvitations.length})
          </ThemedText>
        </Pressable>

        <Pressable
          style={[
            styles.tab,
            activeTab === 'sent' && [styles.tabActive, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.15)' }],
          ]}
          onPress={() => setActiveTab('sent')}>
          <IconSymbol
            name="paperplane.fill"
            size={16}
            color={activeTab === 'sent' ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary)}
          />
          <ThemedText
            style={[
              styles.tabText,
              activeTab === 'sent' && { color: isDark ? '#2DD4BF' : colors.tint },
              !isDark && activeTab !== 'sent' && { color: colors.textSecondary },
            ]}>
            Sent ({sentInvitations.length})
          </ThemedText>
        </Pressable>
      </View>

      {/* Content */}
      {activeTab === 'received' ? (
        receivedInvitations.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card }]}>
            <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
              No pending invitations
            </ThemedText>
          </View>
        ) : (
          receivedInvitations.map(inv => (
            <View
              key={inv.id}
              style={[
                styles.invitationCard,
                { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card },
              ]}>
              <View style={styles.invitationHeader}>
                <View style={[styles.avatar, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
                  <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                    {(inv.inviterName || 'U').charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.invitationInfo}>
                  <ThemedText style={[styles.invitationName, !isDark && { color: colors.text }]}>
                    {inv.inviterName || 'Someone'}
                  </ThemedText>
                  <ThemedText style={[styles.invitationSubtext, !isDark && { color: colors.textSecondary }]}>
                    wants to connect with you
                  </ThemedText>
                </View>
              </View>

              <View style={styles.actionButtons}>
                <Pressable
                  style={[styles.declineButton, { borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)' }]}
                  onPress={() => handleDecline(inv)}
                  disabled={actionLoading === inv.id}>
                  {actionLoading === inv.id ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <>
                      <IconSymbol name="xmark" size={14} color="#EF4444" />
                      <ThemedText style={styles.declineText}>Decline</ThemedText>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.acceptButton, { backgroundColor: isDark ? '#2DD4BF' : colors.tint }]}
                  onPress={() => handleAccept(inv)}
                  disabled={actionLoading === inv.id}>
                  {actionLoading === inv.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <IconSymbol name="checkmark" size={14} color="#fff" />
                      <ThemedText style={styles.acceptText}>Accept</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ))
        )
      ) : (
        sentInvitations.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card }]}>
            <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
              No pending sent invitations
            </ThemedText>
          </View>
        ) : (
          sentInvitations.map(inv => (
            <View
              key={inv.id}
              style={[
                styles.invitationCard,
                { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card },
              ]}>
              <View style={styles.invitationHeader}>
                <View style={[styles.avatar, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)' }]}>
                  <IconSymbol name="clock" size={18} color={isDark ? '#fbbf24' : '#f59e0b'} />
                </View>
                <View style={styles.invitationInfo}>
                  <ThemedText style={[styles.invitationName, !isDark && { color: colors.text }]}>
                    {inv.inviteeName || inv.inviteeEmail}
                  </ThemedText>
                  <ThemedText style={[styles.invitationSubtext, !isDark && { color: colors.textSecondary }]}>
                    Pending • Sent {formatTimeAgo(inv.createdAt)}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.actionButtons}>
                <Pressable
                  style={[styles.cancelButton, { borderColor: isDark ? 'rgba(255,255,255,0.2)' : colors.border }]}
                  onPress={() => handleCancel(inv)}
                  disabled={actionLoading === inv.id}>
                  {actionLoading === inv.id ? (
                    <ActivityIndicator size="small" color={isDark ? '#fff' : colors.text} />
                  ) : (
                    <ThemedText style={[styles.cancelText, !isDark && { color: colors.textSecondary }]}>Cancel</ThemedText>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.resendButton, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}
                  onPress={() => handleResend(inv)}
                  disabled={actionLoading === inv.id}>
                  {actionLoading === inv.id ? (
                    <ActivityIndicator size="small" color={isDark ? '#2DD4BF' : colors.tint} />
                  ) : (
                    <>
                      <IconSymbol name="arrow.clockwise" size={14} color={isDark ? '#2DD4BF' : colors.tint} />
                      <ThemedText style={[styles.resendText, { color: isDark ? '#2DD4BF' : colors.tint }]}>Resend</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ))
        )
      )}
    </View>
  );
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
    marginLeft: 4,
  },
  loadingContainer: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: 'rgba(45, 212, 191, 0.2)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  emptyCard: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  invitationCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  invitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  invitationInfo: {
    flex: 1,
  },
  invitationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  invitationSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  acceptText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  declineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  resendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
});
