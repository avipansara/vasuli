import { FriendExpenseActivity } from '@/components/friends/friend-expense-activity';
import { FriendExpenseActivityEvent } from '@/components/friends/friend-expense-activity-event';
import { FriendSettlementActivity } from '@/components/friends/friend-settlement-activity';
import { FriendScopeTransferActivity } from '@/components/friends/friend-scope-transfer-activity';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { FriendDetailSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useFriendDetailController } from '@/hooks/use-friend-detail-controller';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import {
  filterFriendActivity,
  friendDetailModule,
  groupFriendActivityByMonth,
  type FriendActivityFilter,
} from '@/services/friend-detail-module';
import { settlementModule, CombinedSettlementError } from '@/services/settlement-service';
import { projectFriendRelationship, type FriendDetailData } from '@/services/friend-detail-service';
import type { GroupDetailReadModel } from '@/services/group-detail-read-model';
import { applySettlementToGroupReadModel } from '@/services/group-detail-read-model';
import { queryKeys } from '@/services/query-keys';
import type { Expense, User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserWithBalance extends User {
  balance: number;
  recentExpenses?: Expense[];
}

const MIN_TOUCH_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };
const SEGMENTED_CONTROL_PADDING = 2;
const SEGMENTED_CONTROL_GAP = 3;
type ActivityFilter = FriendActivityFilter;

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string; icon: IconSymbolName }[] = [
  { id: 'all', label: 'All', icon: 'list.bullet' },
  { id: 'expenses', label: 'Expenses', icon: 'dollarsign.circle' },
  { id: 'updates', label: 'Updates', icon: 'clock' },
];

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gradients, colors, settle, friendDetail: friendDetailTheme, isDark } = useThemeColors();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [segmentedWidth, setSegmentedWidth] = useState(0);
  const [isRemovingFriend, setIsRemovingFriend] = useState(false);
  const [isSettlingUp, setIsSettlingUp] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const swipeableRefs = useRef<Map<string, SwipeableMethods>>(new Map());

  // Animations
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerTitleOpacity = scrollY.interpolate({
    inputRange: [40, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const headerTitleTranslateY = scrollY.interpolate({
    inputRange: [40, 80],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });

  const tabIndicatorX = useSharedValue(0);
  const segmentWidth = segmentedWidth > 0
    ? (segmentedWidth - (SEGMENTED_CONTROL_PADDING * 2) - (SEGMENTED_CONTROL_GAP * (ACTIVITY_FILTERS.length - 1))) / ACTIVITY_FILTERS.length
    : 0;
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorX.value }],
  }));
  const {
    data: friendDetail,
    error,
    isLoading,
    refetch,
    friend,
    expenses,
    activity,
    groupBalances,
    relationship,
    friendDetailQueryKey,
    friendsHomeQueryKey,
    queryClient,
  } = useFriendDetailController({ currentUserId, friendId: id });
  const loading = isLoading && !friendDetail;
  const loadError = error ? getFetchErrorMessage(error) : null;

  const filteredActivity = filterFriendActivity(activity, activityFilter);
  const expenseActivityCount = filteredActivity.filter(item => item.type === 'expense' || item.type === 'group_expense').length;
  const updateActivityCount = filteredActivity.length - expenseActivityCount;
  const activityCountLabel = activityFilter === 'expenses'
    ? `${expenseActivityCount} ${expenseActivityCount === 1 ? 'expense' : 'expenses'}`
    : activityFilter === 'updates'
      ? `${updateActivityCount} ${updateActivityCount === 1 ? 'update' : 'updates'}`
      : `${filteredActivity.length} items`;
  const groupedActivity = groupFriendActivityByMonth(filteredActivity);
  const sharedExpensesCount = expenses.length;
  const outstandingGroupBalances = groupBalances.filter(summary => summary.direction !== 'settled');

  useEffect(() => {
    if (friendDetail === undefined || isLoading) return;
    if (!friendDetail) {
      Alert.alert('Error', 'Friend not found');
      router.back();
      return;
    }
  }, [friendDetail, isLoading]);

  const loadFriendData = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleActivityFilterChange = useCallback((nextFilter: ActivityFilter) => {
    if (nextFilter === activityFilter) return;
    setActivityFilter(nextFilter);
  }, [activityFilter]);

  useEffect(() => {
    if (segmentWidth <= 0) return;

    const selectedIndex = ACTIVITY_FILTERS.findIndex(filter => filter.id === activityFilter);
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutable animation refs.
    tabIndicatorX.value = withTiming(selectedIndex * (segmentWidth + SEGMENTED_CONTROL_GAP), {
      duration: 210,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
  }, [activityFilter, segmentWidth, tabIndicatorX]);

  function handleEditExpense(expenseId: string) {
    swipeableRefs.current.get(expenseId)?.close();
    router.push(`/edit-expense/${expenseId}` as any);
  }

  function handleOpenExpense(expenseId: string) {
    swipeableRefs.current.get(expenseId)?.close();
    router.push(`/expense-detail/${expenseId}` as any);
  }

  async function handleDeleteExpense(expenseId: string) {
    if (deletingExpenseId) return;

    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const expenseToDelete = expenses.find(expense => expense.id === expenseId);
            const previousDetail = friendDetail;
            let previousHomeFriends: UserWithBalance[] | undefined;
            try {
              setDeletingExpenseId(expenseId);
              swipeableRefs.current.get(expenseId)?.close();

              if (expenseToDelete) {
                await queryClient.cancelQueries({ queryKey: friendsHomeQueryKey });
                previousHomeFriends = queryClient.getQueryData<UserWithBalance[]>(friendsHomeQueryKey);

                const balanceDelta = expenseToDelete.paidBy === currentUserId
                  ? -expenseToDelete.friendShare
                  : expenseToDelete.yourShare;

                queryClient.setQueryData<UserWithBalance[]>(friendsHomeQueryKey, current => current?.map(homeFriend => {
                  if (homeFriend.id !== id) return homeFriend;

                  const nextBalance = homeFriend.balance + balanceDelta;
                  return {
                    ...homeFriend,
                    balance: Math.abs(nextBalance) < 0.01 ? 0 : nextBalance,
                    recentExpenses: homeFriend.recentExpenses?.filter(expense => expense.id !== expenseId),
                  };
                }));

                queryClient.setQueryData<FriendDetailData | null>(friendDetailQueryKey, current => {
                  if (!current) return current;
                  const nextDetail = {
                    ...current,
                    friend: {
                      ...current.friend,
                      balance: Math.abs(current.friend.balance + balanceDelta) < 0.01 ? 0 : current.friend.balance + balanceDelta,
                    },
                    expenses: current.expenses.filter(expense => expense.id !== expenseId),
                    activity: current.activity.filter(activityItem => (
                      activityItem.type !== 'expense' || activityItem.expense.id !== expenseId
                    )),
                  };
                  return {
                    ...nextDetail,
                    relationship: projectFriendRelationship(nextDetail),
                  };
                });
              }

              await friendDetailModule.deleteExpense({
                expenseId,
                currentUserId,
                currentUserName: user?.name || 'Unknown',
                description: expenseToDelete?.description,
                amount: expenseToDelete?.amount,
                friendPushToken: friend?.pushToken,
              });

              queryClient.invalidateQueries({ queryKey: friendDetailQueryKey });
            } catch (error) {
              if (previousDetail) {
                queryClient.setQueryData(friendDetailQueryKey, previousDetail);
              }
              if (previousHomeFriends) {
                queryClient.setQueryData(friendsHomeQueryKey, previousHomeFriends);
              }
              console.error('Error deleting expense:', error);
              Alert.alert('Error', 'Failed to delete expense');
            } finally {
              setDeletingExpenseId(null);
              queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey });
            }
          },
        },
      ]
    );
  }

  const handleReverseOperation = useCallback((operationId: string, currency: string) => {
    Alert.alert(
      'Reverse settlement?',
      'This restores the balances affected by the settlement operation. The original history remains visible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reverse',
          style: 'destructive',
          onPress: async () => {
            try {
              if (__DEV__) {
                console.log('[Settlement][reverse][friend-screen]', {
                  operationId,
                  currency,
                  relationshipTotals: relationship?.totalsByCurrency ?? [],
                  directBalance: relationship?.directBalance ?? null,
                  groupBalances: relationship?.groupBalances ?? [],
                });
              }
              const expectedBalance = relationship?.totalsByCurrency.find(total => total.currency === currency)?.amount;
              await settlementModule.reverse({
                operationId,
                expectedBalance: expectedBalance ?? 0,
                currentUserId,
                friendId: id,
                queryClient,
              });
              await refetch();
              Alert.alert('Settlement reversed', 'The affected balances were restored.');
            } catch (error) {
              if (error instanceof CombinedSettlementError && error.code === 'stale_balance') {
                Alert.alert('Balance changed', 'Refresh the Friend details before reversing this settlement.');
                return;
              }
              if (error instanceof CombinedSettlementError) {
                Alert.alert('Unable to reverse', error.message);
                return;
              }
              Alert.alert('Unable to reverse', 'The settlement could not be reversed.');
            }
          },
        },
      ],
    );
  }, [currentUserId, id, queryClient, refetch, relationship?.totalsByCurrency]);

  const handleReverseScopeTransfer = useCallback((item: Extract<FriendDetailData['activity'][number], { type: 'scope_transfer' }>) => {
    handleReverseOperation(item.operationId, item.currency);
  }, [handleReverseOperation]);

  const handleReverseSettlement = useCallback((item: Extract<FriendDetailData['activity'][number], { type: 'settlement' }>) => {
    if (!item.operationId) return;
    handleReverseOperation(item.operationId, item.currency);
  }, [handleReverseOperation]);

  const handleRemoveFriend = () => {
    if (isRemovingFriend) return;

    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend?.name} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsRemovingFriend(true);
              await friendDetailModule.removeFriend(currentUserId, id);
              router.back();
              Alert.alert('Success', `${friend?.name} has been removed from your friends`);
            } catch (error) {
              console.error('Error removing friend:', error);
              const errorMessage = error instanceof Error ? error.message : 'Failed to remove friend';
              Alert.alert('Cannot Remove Friend', errorMessage);
              setIsRemovingFriend(false);
            }
          },
        },
      ]
    );
  };

  const handleRemind = async () => {
    try {
      if (!friend || balance === 0) {
        Alert.alert('Info', 'No outstanding balance to remind about');
        return;
      }

      const reminderSent = await friendDetailModule.remind({
        friendId: id,
        friendName: friend.name,
        friendPushToken: friend.pushToken,
        currentUserName: user?.name || 'Someone',
        balance,
      });
      if (reminderSent) {
        Alert.alert('Success', 'Reminder sent!');
      } else {
        Alert.alert('Info', 'Reminder notifications will be sent when push token storage is implemented');
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
      Alert.alert('Error', 'Failed to send reminder');
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButtonRect, {
              backgroundColor: friendDetailTheme.actionSurface,
              borderColor: friendDetailTheme.actionBorder,
            }]}>
            <IconSymbol size={20} name="chevron.left" color={friendDetailTheme.actionIcon} />
          </TouchableOpacity>
        </View>
        <FriendDetailSkeleton />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButtonRect, {
              backgroundColor: friendDetailTheme.actionSurface,
              borderColor: friendDetailTheme.actionBorder,
            }]}>
            <IconSymbol size={20} name="chevron.left" color={friendDetailTheme.actionIcon} />
          </TouchableOpacity>
        </View>
        <AsyncErrorState
          message={loadError}
          onRetry={loadFriendData}
          title="Couldn't load friend"
        />
      </View>
    );
  }

  if (!friend) {
    return null;
  }

  if (!relationship) {
    return null;
  }

  const directBalance = relationship.directBalance;
  const combinedBalance = relationship.settleableTotal?.amount
    ?? (relationship.totalsByCurrency.length === 0 ? directBalance : 0);
  const hasCurrencyAmbiguity = Boolean(
    !relationship.settleableTotal
    && (
      relationship.directBalance !== 0
      || relationship.totalsByCurrency.filter(total => total.amount !== 0).length > 1
    )
  );
  const balance = combinedBalance;
  const canClearZeroNet = Boolean(relationship.zeroNetCurrency);
  const groupBalanceCount = groupBalances.filter(summary => summary.direction !== 'settled').length;
  const isOwed = balance > 0;
  const isOwing = balance < 0;
  const balanceColor = isOwed
    ? friendDetailTheme.positive
    : isOwing
      ? friendDetailTheme.negative
      : friendDetailTheme.actionIcon;
  const balanceSurface = isOwed
    ? friendDetailTheme.positiveSurface
    : isOwing
      ? friendDetailTheme.negativeSurface
      : friendDetailTheme.settledSurface;
  const balanceCopy = hasCurrencyAmbiguity
    ? 'Multiple currencies'
    : isOwed
    ? `${friend.name.split(' ')[0]} owes you`
    : isOwing
      ? `You owe ${friend.name.split(' ')[0]}`
      : 'All settled up';
  const balanceCardTitle = hasCurrencyAmbiguity
    ? 'MULTIPLE CURRENCIES'
    : isOwed
    ? `${friend.name.split(' ')[0].toUpperCase()} OWES YOU`
    : isOwing
      ? `YOU OWE ${friend.name.split(' ')[0].toUpperCase()}`
      : 'ALL SETTLED UP';
  const balanceAccessibilityValue = hasCurrencyAmbiguity
    ? `${balanceCopy}, choose a currency to settle`
    : `${balanceCopy}, ${relationship.settleableTotal?.currency ?? relationship.directCurrency ?? ''} ${Math.abs(balance).toFixed(2)}`;


  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#050914' : colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          hitSlop={MIN_TOUCH_HIT_SLOP}
          style={[styles.backButtonRect, {
            backgroundColor: friendDetailTheme.actionSurface,
            borderColor: friendDetailTheme.actionBorder,
          }]}>
          <IconSymbol size={20} name="chevron.left" color={friendDetailTheme.actionIcon} />
        </TouchableOpacity>

        {/* Floating Header Title (Friend Name) */}
        <View style={styles.headerTitleContainer} pointerEvents="none">
          <Animated.View style={{
            opacity: headerTitleOpacity,
            transform: [{ translateY: headerTitleTranslateY }],
          }}>
            <ThemedText style={[styles.headerTitle, { color: isDark ? '#F8FAFC' : colors.text }]} numberOfLines={1}>
              {friend?.name}
            </ThemedText>
          </Animated.View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleRemind}
            disabled={balance === 0}
            accessibilityRole="button"
            accessibilityLabel={`Remind ${friend.name}`}
            accessibilityHint="Sends a reminder about this balance"
            accessibilityState={{ disabled: balance === 0 }}
            hitSlop={MIN_TOUCH_HIT_SLOP}
            style={[styles.headerActionButton, {
              backgroundColor: friendDetailTheme.warningSurface,
              borderColor: friendDetailTheme.warningBorder,
              opacity: balance === 0 ? 0.45 : 1,
            }]}>
            <IconSymbol size={18} name="bell.fill" color={friendDetailTheme.warning} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRemoveFriend}
            disabled={isRemovingFriend}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${friend.name}`}
            accessibilityHint="Removes this person from your friends"
            accessibilityState={{ busy: isRemovingFriend, disabled: isRemovingFriend }}
            hitSlop={MIN_TOUCH_HIT_SLOP}
            style={[styles.headerActionButton, {
              backgroundColor: friendDetailTheme.dangerSurface,
              borderColor: friendDetailTheme.dangerBorder,
              opacity: isRemovingFriend ? 0.5 : 1,
            }]}>
            <IconSymbol size={18} name="trash" color={friendDetailTheme.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}>

        <View style={styles.summarySection}>
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(13, 19, 33, 0.8)', 'rgba(13, 19, 33, 0.6)']
                  : isOwing
                    ? ['#FFF2F4', '#FFFFFF']
                    : isOwed
                      ? ['#F0FDF4', '#FFFFFF']
                      : ['#F9FAFB', '#FFFFFF']
              }
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`${friend.name}${friend.email ? `, ${friend.email}` : ''}, ${balanceAccessibilityValue}`}
              accessibilityLiveRegion="polite"
              style={[styles.summaryCard, {
                borderWidth: 0,
                shadowColor: isDark ? '#000000' : '#475569',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.45 : 0.12,
                shadowRadius: 18,
                elevation: 8,
                alignItems: 'center',
                paddingVertical: 24,
                paddingHorizontal: 16,
                borderRadius: 24,
              }]}>

              <ThemedText type='defaultSemiBold' style={[styles.summaryCardTitle, { color: isDark ? (isOwing ? '#ffb3b0' : isOwed ? '#45dfa4' : '#94A3B8') : balanceColor }]}>
                {balanceCardTitle}
              </ThemedText>

              <ThemedText type='subtitle' style={[styles.summaryCardAmount, { color: isDark ? (isOwing ? '#ffb3b0' : isOwed ? '#4edea3' : '#94A3B8') : balanceColor }]}>
                {hasCurrencyAmbiguity
                  ? 'Multiple currencies'
                  : `${isOwing ? '-' : isOwed ? '+' : ''}${relationship.settleableTotal?.currency ?? relationship.directCurrency ?? ''} ${Math.abs(balance).toFixed(2)}`}
              </ThemedText>

              <ThemedText style={[styles.summaryCardSubtitle, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                {groupBalanceCount > 0
                  ? `${sharedExpensesCount} direct expenses + ${groupBalanceCount} group ${groupBalanceCount === 1 ? 'balance' : 'balances'}`
                  : `Across ${sharedExpensesCount} direct expenses`}
              </ThemedText>

              <ThemedText style={[styles.summaryCardSubtitle, { color: isDark ? '#94A3B8' : colors.textSecondary }] }>
                Direct ledger: {relationship.directCurrency ?? 'multiple currencies'} {relationship.directBalance >= 0 ? '+' : '-'}{Math.abs(relationship.directBalance).toFixed(2)}
              </ThemedText>

              {((balance !== 0 && !hasCurrencyAmbiguity) || canClearZeroNet) && (
                <View style={styles.cardQuickActions}>
                  <TouchableOpacity
                    style={[styles.cardQuickActionButton, {
                      backgroundColor: isDark ? '#10b981' : '#043424',
                      opacity: isSettlingUp ? 0.7 : 1,
                    }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Settle up with ${friend.name}`}
                    accessibilityHint="Opens the settlement form for this balance"
                    accessibilityState={{ disabled: isSettlingUp, busy: isSettlingUp }}
                    onPress={() => router.push(`/friend-settle/${id}`)}>
                    <IconSymbol size={18} name="banknote" color="#ffffff" />
                    <ThemedText style={[styles.cardQuickActionText, { color: '#ffffff' }]}>Settle Up</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </LinearGradient>
        </View>

        {outstandingGroupBalances.length > 0 && (
          <View style={styles.groupBalancesSection}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>
                Shared groups
              </ThemedText>
              <ThemedText style={[styles.expenseCount, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                {outstandingGroupBalances.length} {outstandingGroupBalances.length === 1 ? 'group' : 'groups'}
              </ThemedText>
            </View>
            <ThemedText style={[styles.groupBalancesHint, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
              Settle Up can apply payments and balance offsets across your shared ledgers.
            </ThemedText>
            {outstandingGroupBalances.map(summary => {
              const isOwedInGroup = summary.direction === 'you_are_owed';
              return (
                <TouchableOpacity
                  key={`${summary.groupId}:${summary.currency}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${summary.groupName} group balance`}
                  onPress={() => router.push(`/groups/${summary.groupId}` as any)}
                  style={[styles.groupBalanceRow, {
                    backgroundColor: friendDetailTheme.surface,
                  }]}
                >
                  <View style={[styles.groupBalanceIcon, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.12)' : '#E7F3EF' }]}>
                    <IconSymbol name="person.3.fill" size={17} color={isDark ? '#5EEAD4' : '#0F766E'} />
                  </View>
                  <View style={styles.groupBalanceCopy}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1} style={{ color: colors.text }}>
                      {summary.groupName}
                    </ThemedText>
                    <ThemedText style={{ color: isDark ? '#94A3B8' : colors.textSecondary }}>
                      {isOwedInGroup
                        ? `${friend.name.split(' ')[0]} owes you in this group`
                        : `You owe ${friend.name.split(' ')[0]} in this group`}
                    </ThemedText>
                  </View>
                  <View style={styles.groupBalanceAmount}>
                    <ThemedText type="defaultSemiBold" style={{ color: isOwedInGroup ? friendDetailTheme.positive : friendDetailTheme.negative }}>
                      {isOwedInGroup ? '+' : '-'}{summary.currency} {Math.abs(summary.amount).toFixed(2)}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View
          accessibilityRole="toolbar"
          accessibilityLabel="Activity filter"
          onLayout={({ nativeEvent }) => setSegmentedWidth(nativeEvent.layout.width)}
          style={[styles.segmentedControl]}
        >
          {segmentWidth > 0 && (
            <Reanimated.View
              pointerEvents="none"
              style={[
                styles.segmentedIndicator,
                {
                  width: segmentWidth,
                },
                tabIndicatorStyle,
              ]}
            />
          )}
          {ACTIVITY_FILTERS.map(filter => {
            const isSelected = activityFilter === filter.id;

            return (
              <TouchableOpacity
                key={filter.id}
                accessibilityRole="button"
                accessibilityLabel={filter.label}
                accessibilityState={{ selected: isSelected }}
                activeOpacity={0.78}
                onPress={() => handleActivityFilterChange(filter.id)}
                style={[styles.segmentedOption, { backgroundColor: isSelected ? settle.pillBackground : colors.cardGlass }]}>
                <IconSymbol
                  size={18}
                  name={filter.icon}
                  color={colors.text}
                />
                <ThemedText
                  type='subtitle'
                  style={[styles.segmentedLabel]}>
                  {filter.label}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expense History */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>
              Activity with {friend.name.split(' ')[0]}
            </ThemedText>
            <ThemedText style={[styles.expenseCount, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
              {activityCountLabel}
            </ThemedText>
          </View>

          <View>
            {groupedActivity.length === 0 ? (
              <View style={styles.emptyHistory}>
                <View style={[styles.emptyIconWrapper, { backgroundColor: friendDetailTheme.avatarSurface }]}>
                  <IconSymbol size={32} name="doc.text" color={friendDetailTheme.actionIcon} />
                </View>
                <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                  {activityFilter === 'updates' ? 'No updates yet' : 'No expenses yet'}
                </ThemedText>
                <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {activityFilter === 'updates'
                    ? `Changes and settlements with ${friend.name.split(' ')[0]} will show here`
                    : `Add an expense to start tracking with ${friend.name.split(' ')[0]}`}
                </ThemedText>
              </View>
            ) : (
              groupedActivity.map((group) => (
                <View key={group.monthKey} style={styles.monthSection}>
                  <View style={styles.monthHeaderContainer}>
                    <ThemedText style={[styles.monthHeaderText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                      {group.monthYear}
                    </ThemedText>
                  </View>
                  {group.items.map(item => (
                    <View key={item.id}>
                      {item.type === 'expense' || item.type === 'group_expense'
                        ? <FriendExpenseActivity
                          item={item}
                          currentUserId={currentUserId}
                          colors={colors as Record<string, string>}
                          friendDetailTheme={friendDetailTheme as Record<string, string>}
                          isDark={isDark}
                          swipeableRefs={swipeableRefs}
                          deletingExpenseId={deletingExpenseId}
                          onEditExpense={handleEditExpense}
                          onDeleteExpense={handleDeleteExpense}
                          onOpenExpense={handleOpenExpense}
                          formatDate={formatDate}
                          friendName={friend.name}
                          readOnly={item.type === 'group_expense'}
                        />
                        : item.type === 'settlement'
                          ? <FriendSettlementActivity
                            item={item}
                            friendName={friend.name}
                            colors={colors as Record<string, string>}
                            friendDetailTheme={friendDetailTheme as Record<string, string>}
                            isDark={isDark}
                            formatDate={formatDate}
                            canReverse={Boolean(item.operationId) && !item.notes?.startsWith('Reversal of settlement operation')}
                            onReverse={() => handleReverseSettlement(item)}
                          />
                          : item.type === 'scope_transfer'
                            ? <FriendScopeTransferActivity
                              item={item}
                              friendName={friend.name}
                              colors={colors as Record<string, string>}
                              isDark={isDark}
                              formatDate={formatDate}
                              canReverse={item.fromUserId === currentUserId || item.toUserId === currentUserId}
                              onReverse={() => handleReverseScopeTransfer(item)}
                            />
                            : <FriendExpenseActivityEvent
                            item={item}
                            currentUserId={currentUserId}
                            friendName={friend.name}
                            colors={colors as Record<string, string>}
                            friendDetailTheme={friendDetailTheme as Record<string, string>}
                            isDark={isDark}
                            formatDate={formatDate}
                            onOpenExpense={handleOpenExpense}
                          />}
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        </View>

      </Animated.ScrollView>

      {/* Floating Add Expense Button */}
      <View style={[styles.floatingButtonContainer, {
        bottom: Math.max(insets.bottom, 12) + 20,
        right: Math.max(insets.right, 0) + 18,
      }]}>
        <TouchableOpacity
          accessibilityLabel="Add expense"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/add-expense', params: { friendId: id } })}
          style={[styles.floatingButton, isDark ? styles.darkShadow : styles.lightShadow]}
        >
          <LinearGradient
            colors={gradients.buttonPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.floatingButtonGradient}
          >
            <IconSymbol name="doc.text.fill" size={25} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  ambientLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  ambientShape: {
    position: 'absolute',
    borderRadius: 999,
  },
  ambientTop: {
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -104,
    right: -150,
  },
  ambientMiddle: {
    width: 310,
    height: 310,
    borderRadius: 155,
    left: -170,
    top: 360,
  },
  ambientBottom: {
    width: 280,
    height: 280,
    borderRadius: 140,
    right: -150,
    top: 650,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButtonRect: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summarySection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 0,
    padding: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    padding: SEGMENTED_CONTROL_PADDING,
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  segmentedIndicator: {
    position: 'absolute',
    top: SEGMENTED_CONTROL_PADDING,
    bottom: SEGMENTED_CONTROL_PADDING,
    left: SEGMENTED_CONTROL_PADDING,
    borderRadius: 9,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  segmentedOption: {
    minHeight: 36,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    zIndex: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 0,
    elevation: 4,
  },
  segmentedLabel: {
    fontSize: 14,
  },
  summaryCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryCardAmount: {
    fontSize: 40,
    lineHeight: 50,
    marginBottom: 4,
  },
  summaryCardSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  cardQuickActions: {
    width: '100%',
    paddingHorizontal: 8,
  },
  cardQuickActionButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cardQuickActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 60,
    right: 110,
    bottom: 8,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  monthSection: {
    marginBottom: 16,
  },
  monthHeaderContainer: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  monthHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  floatingButtonContainer: {
    position: 'absolute',
    zIndex: 20,
  },
  floatingButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
  },
  floatingButtonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  darkShadow: {
    elevation: 6,
    shadowColor: '#2DD4BF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  lightShadow: {
    elevation: 6,
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 96,
  },
  historySection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  groupBalancesSection: {
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  groupBalancesHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 10,
  },
  groupBalanceRow: {
    minHeight: 68,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 0,
    elevation: 4,
  },
  groupBalanceIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  groupBalanceCopy: {
    flex: 1,
    gap: 2,
  },
  groupBalanceAmount: {
    alignItems: 'flex-end',
    gap: 3,
    marginLeft: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4
  },
  expenseCount: {
    fontSize: 13,
  },
  emptyHistory: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  expenseList: {
    paddingBottom: 100,
  },
  expenseAmounts: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 62,
  },
  expenseTotal: {
    fontSize: 11,
    marginBottom: 1,
  },
  expenseAmountPrimary: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 1,
  },
  settlementLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
}) as any;
