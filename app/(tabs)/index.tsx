import { FriendCard } from '@/components/friends/friend-card';
import { InviteFriendModal } from '@/components/friends/invite-friend-modal';
import { QRCodeModal } from '@/components/friends/qr-code-modal';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useDebouncedQueryInvalidation } from '@/hooks/use-debounced-query-invalidation';
import { useRealtime } from '@/hooks/use-realtime';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { friendSummaryService, initDatabase } from '@/services/api';
import { friendshipService } from '@/services/friendship-service';
import { invitationService } from '@/services/invitation-service';
import { queryKeys } from '@/services/query-keys';
import type { Expense, User } from '@/types/database';
import { isEmailValid, normalizeEmail } from '@/utils/validation';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';

interface UserWithBalance extends User {
  balance: number;
  recentExpenses?: Expense[];
}

export default function FriendsScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const friendsQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);
  const invalidateFriends = useDebouncedQueryInvalidation(friendsQueryKey, 500);

  const {
    data: friends = [],
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: friendsQueryKey,
    enabled: !!currentUserId,
    queryFn: async () => {
      await initDatabase();
      return friendSummaryService.getHomeSummaries(currentUserId);
    },
  });
  const loading = isLoading && friends.length === 0;
  const loadError = error ? getFetchErrorMessage(error) : null;

  const loadFriends = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      loadFriends();
    }, [loadFriends])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  useRealtime({
    table: 'friendships',
    filter: currentUserId ? `user_id_1=eq.${currentUserId}` : undefined,
    onChange: invalidateFriends,
    enabled: !!currentUserId,
  });
  useRealtime({
    table: 'friendships',
    filter: currentUserId ? `user_id_2=eq.${currentUserId}` : undefined,
    onChange: invalidateFriends,
    enabled: !!currentUserId,
  });
  useRealtime({
    table: 'expenses',
    filter: currentUserId ? `paid_by=eq.${currentUserId}` : undefined,
    onChange: invalidateFriends,
    enabled: !!currentUserId,
  });
  useRealtime({
    table: 'expense_splits',
    filter: currentUserId ? `user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriends,
    enabled: !!currentUserId,
  });
  useRealtime({
    table: 'settlements',
    filter: currentUserId ? `from_user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriends,
    enabled: !!currentUserId,
  });
  useRealtime({
    table: 'settlements',
    filter: currentUserId ? `to_user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriends,
    enabled: !!currentUserId,
  });

  const sendInvite = async () => {
    const contact = normalizeEmail(newFriendEmail);

    if (!contact) {
      Alert.alert('Required', 'Please enter an email address');
      return;
    }
    if (!isEmailValid(contact)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    try {
      await invitationService.create({
        inviterId: currentUserId,
        inviteeEmail: contact,
        inviteeName: newFriendName.trim() || contact.split('@')[0],
        inviterName: user?.name || 'A friend',
      });

      setNewFriendName('');
      setNewFriendEmail('');
      setModalVisible(false);
      loadFriends();
      Alert.alert('Invite Sent!', `An invite has been sent to ${contact}`);
    } catch (error) {
      console.error('Error sending invite:', error);
      Alert.alert('Error', 'Failed to send invite');
    }
  }

  const handleFriendPress = useCallback((friend: UserWithBalance) => {
    router.push(`/friend/${friend.id}` as any);
  }, []);

  const handleDeleteFriend = useCallback(
    (friend: UserWithBalance) => {
      Alert.alert(
        'Remove Friend',
        `Are you sure you want to remove ${friend.name} from your friends?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await friendshipService.remove(currentUserId, friend.id);
                loadFriends();
                Alert.alert('Success', `${friend.name} has been removed from your friends`);
              } catch (error) {
                console.error('Error removing friend:', error);
                Alert.alert('Error', 'Failed to remove friend');
              }
            },
          },
        ]
      );
    },
    [currentUserId, loadFriends]
  );

  const renderFriendItem = useCallback(
    ({ item }: { item: UserWithBalance }) => (
      <FriendCard friend={item} onPress={handleFriendPress} onDelete={handleDeleteFriend} />
    ),
    [handleFriendPress, handleDeleteFriend]
  );

  // Calculate net balance (positive = you are owed, negative = you owe)
  const netBalance = friends.reduce((sum, f) => sum + f.balance, 0);
  const balanceLabel = netBalance > 0 ? 'You are owed' : netBalance < 0 ? 'You owe' : 'All settled up';

  // Separate friends with balances and settled friends
  const { friendsWithBalance, settledFriends } = useMemo(() => {
    const withBalance = friends.filter(f => f.balance !== 0);
    const settled = friends.filter(f => f.balance === 0);
    return { friendsWithBalance: withBalance, settledFriends: settled };
  }, [friends]);

  // Accordion state for settled friends
  const [settledExpanded, setSettledExpanded] = useState(false);
  const balanceColor = netBalance > 0 ? colors.success : netBalance < 0 ? colors.error : colors.tint;

  return (
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'column', gap: 6 }}>
          <ThemedText style={[styles.headerLabel, { color: colors.textSecondary }]}>{balanceLabel}</ThemedText>
          <ThemedText type="header" style={[styles.headerAmount, { color: balanceColor }]}>${Math.abs(netBalance).toFixed(2)}</ThemedText>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}
            onPress={() => setQrModalVisible(true)}>
            <IconSymbol size={20} name="qrcode" color={isDark ? '#2DD4BF' : colors.tint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}
            onPress={() => router.push('/scan-qr')}>
            <IconSymbol size={20} name="qrcode.viewfinder" color={isDark ? '#2DD4BF' : colors.tint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}
            onPress={() => router.push('/add-friend')}>
            <IconSymbol size={20} name="person.badge.plus" color={isDark ? '#2DD4BF' : colors.tint} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <LoadingState message="Loading friends..." />
      ) : loadError ? (
        <AsyncErrorState
          message={loadError}
          onRetry={loadFriends}
          title="Couldn't load friends"
        />
      ) : (
        <FlatList
          data={friendsWithBalance}
          renderItem={renderFriendItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.tint}
              titleColor={colors.textSecondary}
              colors={[colors.tint]}
              progressBackgroundColor={colors.background}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            friends.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
                  <IconSymbol size={64} name="person.2" color={isDark ? '#2DD4BF' : colors.tint} />
                </View>
                <ThemedText type="subtitle" style={[styles.emptyTitle, { color: colors.text }]}>
                  No friends yet
                </ThemedText>
                <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Add friends to start splitting expenses together
                </ThemedText>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => router.push('/add-friend')}>
                  <LinearGradient
                    colors={gradients.buttonPrimary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.createButtonGradient}>
                    <ThemedText style={styles.createButtonText}>Add Friend</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : settledFriends.length > 0 ? (
              <View style={styles.allSettledContainer}>
                <IconSymbol name="checkmark.seal.fill" size={48} color={colors.tint} />
                <ThemedText type="subtitle" style={[styles.allSettledTitle, { color: colors.text }]}>
                  All Settled Up!
                </ThemedText>
                <ThemedText style={[styles.allSettledText, { color: colors.textSecondary }]}>
                  You have no pending balances with any friends.
                </ThemedText>
              </View>
            ) : null
          }
          ListFooterComponent={
            settledFriends.length > 0 ? (
              <View style={[styles.settledSection, { borderTopColor: colors.border, borderTopWidth: friendsWithBalance.length > 0 ? 1 : 0 }]}>
                <TouchableOpacity
                  style={[styles.accordionHeader, { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.4)' : 'rgba(0,0,0,0.03)' }]}
                  onPress={() => setSettledExpanded(!settledExpanded)}
                  activeOpacity={0.7}>
                  <View style={styles.accordionTitleRow}>
                    <IconSymbol
                      name="checkmark.circle.fill"
                      size={18}
                      color={colors.tint}
                    />
                    <ThemedText style={[styles.accordionTitle, { color: colors.textSecondary }]}>
                      Settled Up ({settledFriends.length})
                    </ThemedText>
                  </View>
                  <IconSymbol
                    name={settledExpanded ? 'chevron.up' : 'chevron.down'}
                    size={16}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
                {settledExpanded && (
                  <View style={styles.settledList}>
                    {settledFriends.map((friend) => (
                      <FriendCard
                        key={friend.id}
                        friend={friend}
                        onPress={handleFriendPress}
                        onDelete={handleDeleteFriend}
                      />
                    ))}
                  </View>
                )}
              </View>
            ) : null
          }
        />
      )}

      <InviteFriendModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        name={newFriendName}
        setName={setNewFriendName}
        email={newFriendEmail}
        setEmail={setNewFriendEmail}
        onSubmit={sendInvite}
      />

      <QRCodeModal
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        userId={currentUserId}
        userName={user?.name || ''}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerAmount: {
    color: '#fff',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 120,
  },
  friendCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2DD4BF',
  },
  friendInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  friendName: {
    fontSize: 14,
    marginBottom: 2,
  },
  friendEmail: {
    fontSize: 11,
    opacity: 0.6,
  },
  balanceContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  balanceLabel: {
    fontSize: 10,
    opacity: 0.6,
  },
  settledText: {
    fontSize: 11,
    opacity: 0.6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: 28,
    fontSize: 15,
    lineHeight: 22,
  },
  createButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  createButtonText: {
    color: '#0A0A0F',
    fontWeight: '600',
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalContent: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 20 : 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonRect: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    padding: 24,
    paddingTop: 0,
    flexGrow: 1,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.7,
  },
  modalFooter: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
  },
  submitButton: {
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  glassInput: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    color: '#f4f4f5',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  modalKeyboard: {
    flex: 1,
  },
  inviteHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  inviteIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteTitle: {
    color: '#fff',
    marginBottom: 8,
    lineHeight: 32,
  },
  inviteSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  methodToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  methodButtonActive: {
    backgroundColor: '#2DD4BF',
  },
  methodButtonText: {
    color: '#2DD4BF',
    fontWeight: '600',
  },
  methodButtonTextActive: {
    color: '#0A0A0F',
  },
  privacyNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addExpenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    gap: 6,
  },
  addExpenseText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2DD4BF',
  },
  addButtonRect: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settledSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  settledList: {
    gap: 0,
  },
  allSettledContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  allSettledTitle: {
    marginTop: 12,
    marginBottom: 6,
  },
  allSettledText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
