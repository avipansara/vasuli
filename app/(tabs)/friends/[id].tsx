import { FriendExpenseActivity } from '@/components/friends/friend-expense-activity';
import { FriendExpenseActivityEvent } from '@/components/friends/friend-expense-activity-event';
import { FriendSettlementActivity } from '@/components/friends/friend-settlement-activity';
import { SettleUpModal } from '@/components/friends/settle-up-modal';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { DetailSkeleton } from '@/components/ui/skeleton';
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
import type { FriendDetailData } from '@/services/friend-detail-service';
import type { GroupDetailReadModel } from '@/services/group-detail-read-model';
import { applySettlementToGroupReadModel } from '@/services/group-detail-read-model';
import { queryKeys } from '@/services/query-keys';
import type { Expense, User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserWithBalance extends User {
  balance: number;
  recentExpenses?: Expense[];
}

const MIN_TOUCH_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };
const SEGMENTED_CONTROL_PADDING = 3;
const SEGMENTED_CONTROL_GAP = 3;
type ActivityFilter = FriendActivityFilter;

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string; icon: IconSymbolName }[] = [
  { id: 'all', label: 'All', icon: 'list.bullet' },
  { id: 'expenses', label: 'Expenses', icon: 'dollarsign.circle' },
  { id: 'updates', label: 'Updates', icon: 'clock' },
];

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gradients, colors, friendDetail: friendDetailTheme, isDark } = useThemeColors();
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [isRemovingFriend, setIsRemovingFriend] = useState(false);
  const [isSettlingUp, setIsSettlingUp] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  // Animations
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  // Collapsible summary card and header animation interpolations
  const summaryOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const summaryScale = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.95],
    extrapolate: 'clamp',
  });
  const summaryTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });

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

  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));
  const [scaleAnim] = useState(() => new Animated.Value(0.98));
  const {
    data: friendDetail,
    error,
    isLoading,
    refetch,
    friend,
    expenses,
    activity,
    friendDetailQueryKey,
    friendsHomeQueryKey,
    queryClient,
  } = useFriendDetailController({ currentUserId, friendId: id });
  const loading = isLoading && !friendDetail;
  const loadError = error ? getFetchErrorMessage(error) : null;

  const filteredActivity = filterFriendActivity(activity, 'all');
  const groupedActivity = groupFriendActivityByMonth(filteredActivity);
  const sharedExpensesCount = expenses.length;

  useEffect(() => {
    if (friendDetail === undefined) return;
    if (!friendDetail) {
      Alert.alert('Error', 'Friend not found');
      router.back();
      return;
    }

  }, [friendDetail]);

  const loadFriendData = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useEffect(() => {
    if (!loading && friend) {
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
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

    }
  }, [fadeAnim, friend, loading, scaleAnim, slideAnim]);

  const handleSettleUp = async (friendId: string, amount: number) => {
    if (isSettlingUp) return;

    const previousDetail = friendDetail;
    let previousHomeFriends: UserWithBalance[] | undefined;
    try {
      if (!friend || !user) return;

      if (amount <= 0 || amount > Math.abs(friend.balance)) {
        Alert.alert('Error', 'Settlement amount cannot exceed the outstanding balance.');
        return;
      }

      setIsSettlingUp(true);
      const optimisticBalance = friend.balance > 0
        ? friend.balance - amount
        : friend.balance + amount;
      const normalizedOptimisticBalance = Math.abs(optimisticBalance) < 0.01 ? 0 : optimisticBalance;

      await queryClient.cancelQueries({ queryKey: friendsHomeQueryKey });
      previousHomeFriends = queryClient.getQueryData<UserWithBalance[]>(friendsHomeQueryKey);
      queryClient.setQueryData<UserWithBalance[]>(friendsHomeQueryKey, current => current?.map(homeFriend => (
        homeFriend.id === friendId
          ? {
            ...homeFriend,
            balance: normalizedOptimisticBalance,
            recentExpenses: normalizedOptimisticBalance === 0 ? [] : homeFriend.recentExpenses,
          }
          : homeFriend
      )));

      queryClient.setQueryData<FriendDetailData | null>(friendDetailQueryKey, current => current ? {
        ...current,
        friend: { ...current.friend, balance: normalizedOptimisticBalance },
      } : current);
      setSettleModalVisible(false);

      const settlements = await friendDetailModule.settleUp({
        currentUserId,
        friendId,
        amount: Math.abs(amount),
        balance: friend.balance,
        currency: 'USD',
        date: Date.now(),
        currentUserName: user.name,
        friendName: friend.name,
      });

      const settledGroupIds = [...new Set(settlements.flatMap(settlement => settlement.groupId ? [settlement.groupId] : []))];
      for (const groupId of settledGroupIds) {
        const groupSettlements = settlements.filter(settlement => settlement.groupId === groupId);
        queryClient.setQueryData<GroupDetailReadModel | null>(
          queryKeys.groups.detail(currentUserId, groupId),
          current => groupSettlements.reduce(
            (model, settlement) => model ? applySettlementToGroupReadModel(model, settlement) : model,
            current,
          )
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: friendDetailQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.list(currentUserId) }),
        ...settledGroupIds.map(groupId => queryClient.invalidateQueries({
          queryKey: queryKeys.groups.detail(currentUserId, groupId),
        })),
      ]);
      await refetch();
    } catch (error) {
      if (previousDetail) {
        queryClient.setQueryData(friendDetailQueryKey, previousDetail);
      }
      if (previousHomeFriends) {
        queryClient.setQueryData(friendsHomeQueryKey, previousHomeFriends);
      }
      console.error('Error settling up:', error);
      Alert.alert('Error', 'Failed to settle up');
    } finally {
      setIsSettlingUp(false);
      queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey });
    }
  };

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

                queryClient.setQueryData<FriendDetailData | null>(friendDetailQueryKey, current => current ? {
                  ...current,
                  friend: {
                    ...current.friend,
                    balance: Math.abs(current.friend.balance + balanceDelta) < 0.01 ? 0 : current.friend.balance + balanceDelta,
                  },
                  expenses: current.expenses.filter(expense => expense.id !== expenseId),
                  activity: current.activity.filter(activityItem => (
                    activityItem.type !== 'expense' || activityItem.expense.id !== expenseId
                  )),
                } : current);
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
        <DetailSkeleton />
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

  const balance = friend.balance;
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
  const balanceCopy = isOwed
    ? `${friend.name.split(' ')[0]} owes you`
    : isOwing
      ? `You owe ${friend.name.split(' ')[0]}`
      : 'All settled up';
  const balanceCardTitle = isOwed
    ? `${friend.name.split(' ')[0].toUpperCase()} OWES YOU`
    : isOwing
      ? `YOU OWE ${friend.name.split(' ')[0].toUpperCase()}`
      : 'ALL SETTLED UP';
  const balanceAccessibilityValue = `${balanceCopy}, $${Math.abs(balance).toFixed(2)}`;


  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            <ThemedText style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
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

        <Animated.View style={[
          styles.summarySection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          }
        ]}>
          <Animated.View style={{
            opacity: summaryOpacity,
            transform: [
              { translateY: summaryTranslateY },
              { scale: summaryScale }
            ]
          }}>
            <LinearGradient
              colors={
                isOwing
                  ? (isDark ? ['rgba(254, 226, 226, 0.08)', 'rgba(20, 20, 25, 0.95)'] : ['#FFF2F4', '#FFFFFF'])
                  : isOwed
                    ? (isDark ? ['rgba(209, 250, 229, 0.08)', 'rgba(20, 20, 25, 0.95)'] : ['#F0FDF4', '#FFFFFF'])
                    : (isDark ? ['rgba(243, 244, 246, 0.05)', 'rgba(20, 20, 25, 0.95)'] : ['#F9FAFB', '#FFFFFF'])
              }
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`${friend.name}${friend.email ? `, ${friend.email}` : ''}, ${balanceAccessibilityValue}`}
              accessibilityLiveRegion="polite"
              style={[styles.summaryCard, {
                borderWidth: 0,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: isDark ? 0.45 : 0.12,
                shadowRadius: 20,
                elevation: 8,
                alignItems: 'center',
                paddingVertical: 24,
                paddingHorizontal: 16,
              }]}>

              <ThemedText type='defaultSemiBold' style={[styles.summaryCardTitle, { color: balanceColor }]}>
                {balanceCardTitle}
              </ThemedText>

              <ThemedText type='subtitle' style={[styles.summaryCardAmount, { color: balanceColor }]}>
                {isOwing ? '-' : isOwed ? '+' : ''}${Math.abs(balance).toFixed(2)}
              </ThemedText>

              <ThemedText style={[styles.summaryCardSubtitle, { color: colors.textSecondary }]}>
                Across {sharedExpensesCount} shared expenses
              </ThemedText>

              {balance !== 0 && (
                <View style={styles.cardQuickActions}>
                  <TouchableOpacity
                    style={[styles.cardQuickActionButton, {
                      backgroundColor: isDark ? '#0F3E3A' : '#043424', // Dark green match
                      opacity: isSettlingUp ? 0.7 : 1,
                    }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Settle up with ${friend.name}`}
                    accessibilityHint="Opens the settlement form for this balance"
                    accessibilityState={{ disabled: isSettlingUp, busy: isSettlingUp }}
                    disabled={isSettlingUp}
                    onPress={() => setSettleModalVisible(true)}>
                    <IconSymbol size={18} name="banknote" color="#ffffff" />
                    <ThemedText style={styles.cardQuickActionText}>Settle Up</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        </Animated.View>



        {/* Expense History */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Activity with {friend.name.split(' ')[0]}
            </ThemedText>
            <TouchableOpacity onPress={() => Alert.alert('Not Implemented', 'View All activity screen is coming soon!')}>
              <ThemedText style={[styles.viewAllText, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}>
                View All
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View>
            {groupedActivity.length === 0 ? (
              <View style={styles.emptyHistory}>
                <View style={[styles.emptyIconWrapper, { backgroundColor: friendDetailTheme.avatarSurface }]}>
                  <IconSymbol size={32} name="doc.text" color={friendDetailTheme.actionIcon} />
                </View>
                <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                  No expenses yet
                </ThemedText>
                <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Add an expense to start tracking with {friend.name.split(' ')[0]}
                </ThemedText>
              </View>
            ) : (
              groupedActivity.map((group) => (
                <View key={group.monthKey} style={styles.monthSection}>
                  <View style={styles.monthHeaderContainer}>
                    <ThemedText style={[styles.monthHeaderText, { color: colors.textSecondary }]}>
                      {group.monthYear}
                    </ThemedText>
                  </View>
                  {group.items.map(item => (
                    <View key={item.id}>
                      {item.type === 'expense'
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
                        />
                        : item.type === 'settlement'
                          ? <FriendSettlementActivity
                            item={item}
                            friendName={friend.name}
                            colors={colors as Record<string, string>}
                            friendDetailTheme={friendDetailTheme as Record<string, string>}
                            isDark={isDark}
                            formatDate={formatDate}
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

      <SettleUpModal
        visible={settleModalVisible}
        onClose={() => setSettleModalVisible(false)}
        friend={friend}
        onConfirm={handleSettleUp}
      />
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
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
