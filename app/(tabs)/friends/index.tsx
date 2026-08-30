import { FriendCard } from '@/components/friends/friend-card';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FriendsListSkeleton } from '@/components/ui/skeleton';
import { ThemedIconButton } from '@/components/ui/themed-icon-button';
import { useAuth } from '@/contexts/auth-context-otp';
import { useDebouncedQueryInvalidation } from '@/hooks/use-debounced-query-invalidation';
import { useRealtime } from '@/hooks/use-realtime';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { friendSummaryService } from '@/services/friend-summary-service';
import { friendshipService } from '@/services/friendship-service';
import { queryKeys } from '@/services/query-keys';
import type { Expense, User } from '@/types/database';
import { formatCurrency } from '@/utils/currency';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';

interface UserWithBalance extends User {
  balance: number;
  recentExpenses?: Expense[];
}

export default function FriendsScreen() {
  const { colors, friends: friendsTheme } = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const friendsQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);
  const invalidateFriends = useDebouncedQueryInvalidation(friendsQueryKey, 500);

  const {
    data: friends = [],
    error,
    isFetching,
    isLoading,
    isStale,
    refetch,
  } = useQuery({
    queryKey: friendsQueryKey,
    enabled: !!currentUserId,
    queryFn: () => friendSummaryService.getHomeSummaries(currentUserId),
  });
  const loading = isLoading && friends.length === 0;
  const loadError = error ? getFetchErrorMessage(error) : null;

  useRefetchOnFocus({
    enabled: !!currentUserId,
    isFetching,
    isStale,
    refetch,
  });

  const loadFriends = useCallback(async () => {
    await refetch();
  }, [refetch]);

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
    table: 'settlement_scope_transfers',
    onChange: invalidateFriends,
    enabled: !!currentUserId,
  });
  useRealtime({
    table: 'settlements',
    filter: currentUserId ? `to_user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriends,
    enabled: !!currentUserId,
  });

  const handleFriendPress = useCallback((friend: UserWithBalance) => {
    router.push(`/friends/${friend.id}` as any);
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
    <View
      testID="friends-screen"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <View style={{ flexDirection: 'column', gap: 6 }}>
          <ThemedText style={[styles.headerLabel, { color: colors.textSecondary }]}>{balanceLabel}</ThemedText>
          <ThemedText type="header" style={{ color: balanceColor }}>{formatCurrency(Math.abs(netBalance))}</ThemedText>
        </View>
        <View style={styles.headerButtons}>
          <ThemedIconButton
            name="person.badge.plus"
            size={20}
            shape='square'
            accessibilityLabel='Add Friend'
            onPress={() => router.push('/add-friend')}
          />
        </View>
      </View>

      {loading ? (
        <FriendsListSkeleton />
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
              <EmptyState
                icon="person.2"
                title="No friends yet"
                subtitle="Add friends to start splitting expenses together"
                buttonLabel="Add Friend"
                onButtonPress={() => router.push('/add-friend')}
              />
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
                  style={[styles.accordionHeader, { backgroundColor: friendsTheme.settledSurface }]}
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

    </View>
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
  listContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 120,
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
    fontWeight: '600',
    fontSize: 14,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addButtonRect: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
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
