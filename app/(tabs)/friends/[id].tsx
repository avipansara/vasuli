import { SettleUpModal } from '@/components/friends/settle-up-modal';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { DetailSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useDebouncedQueryInvalidation } from '@/hooks/use-debounced-query-invalidation';
import { useRealtime } from '@/hooks/use-realtime';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import type { FriendActivityItem, FriendDetailData } from '@/services/friend-detail-service';
import { friendDetailService } from '@/services/friend-detail-service';
import { friendshipService } from '@/services/friendship-service';
import type { GroupDetailReadModel } from '@/services/group-detail-read-model';
import { applySettlementToGroupReadModel } from '@/services/group-detail-read-model';
import { createExpenseDeletedNotification, notificationService } from '@/services/notification-service';
import { queryKeys } from '@/services/query-keys';
import { settlementService } from '@/services/settlement-service';
import type { Expense, User } from '@/types/database';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
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

interface ExpenseWithSplit extends Expense {
  yourShare: number;
  friendShare: number;
  paidByName: string;
}

const MIN_TOUCH_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };
const SEGMENTED_CONTROL_PADDING = 3;
const SEGMENTED_CONTROL_GAP = 3;
type ActivityFilter = 'all' | 'expenses' | 'updates';

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string; icon: IconSymbolName }[] = [
  { id: 'all', label: 'All', icon: 'list.bullet' },
  { id: 'expenses', label: 'Expenses', icon: 'dollarsign.circle' },
  { id: 'updates', label: 'Updates', icon: 'clock' },
];

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gradients, colors, friendDetail: friendDetailTheme, isDark } = useThemeColors();
  const [friend, setFriend] = useState<UserWithBalance | null>(null);
  const [expenses, setExpenses] = useState<ExpenseWithSplit[]>([]);
  const [activity, setActivity] = useState<FriendActivityItem[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [segmentedWidth, setSegmentedWidth] = useState(0);
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [isRemovingFriend, setIsRemovingFriend] = useState(false);
  const [isSettlingUp, setIsSettlingUp] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);
  const friendDetailQueryKey = useMemo(() => queryKeys.friends.detail(currentUserId, id), [currentUserId, id]);
  const invalidateFriendDetail = useDebouncedQueryInvalidation(friendDetailQueryKey, 500);
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
  const tabIndicatorX = useSharedValue(0);
  const segmentWidth = segmentedWidth > 0
    ? (segmentedWidth - (SEGMENTED_CONTROL_PADDING * 2) - (SEGMENTED_CONTROL_GAP * (ACTIVITY_FILTERS.length - 1))) / ACTIVITY_FILTERS.length
    : 0;

  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorX.value }],
  }));
  const filteredActivity = activityFilter === 'expenses'
    ? activity.filter(item => item.type === 'expense')
    : activityFilter === 'updates'
      ? activity.filter(item => item.type !== 'expense')
      : activity;
  const expenseActivityCount = filteredActivity.filter(item => item.type === 'expense').length;
  const updateActivityCount = filteredActivity.length - expenseActivityCount;
  const activityCountLabel = activityFilter === 'expenses'
    ? `${expenseActivityCount} ${expenseActivityCount === 1 ? 'expense' : 'expenses'}`
    : activityFilter === 'updates'
      ? `${updateActivityCount} ${updateActivityCount === 1 ? 'update' : 'updates'}`
      : `${filteredActivity.length} items`;

  const groupedActivity = useMemo(() => {
    const groups: { monthYear: string; monthKey: string; items: FriendActivityItem[] }[] = [];
    const sorted = [...filteredActivity].sort((a, b) => b.date - a.date);

    for (const item of sorted) {
      const dateObj = new Date(item.date);
      const monthYear = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

      let group = groups.find(g => g.monthKey === monthKey);
      if (!group) {
        group = { monthYear, monthKey, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }

    return groups.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [filteredActivity]);

  const {
    data: friendDetail,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: friendDetailQueryKey,
    enabled: !!currentUserId && !!id,
    queryFn: async () => {
      return friendDetailService.getDetail(currentUserId, id);
    },
  });
  const loading = isLoading && !friend;
  const loadError = error ? getFetchErrorMessage(error) : null;

  useEffect(() => {
    if (friendDetail === undefined) return;
    if (!friendDetail) {
      Alert.alert('Error', 'Friend not found');
      router.back();
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Query data is mirrored so optimistic local mutations can update immediately.
    setFriend(friendDetail.friend);
    setExpenses(friendDetail.expenses);
    setActivity(friendDetail.activity);
  }, [friendDetail]);

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

  useRealtime({
    table: 'expenses',
    filter: currentUserId ? `paid_by=eq.${currentUserId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!id,
  });
  useRealtime({
    table: 'expenses',
    filter: id ? `paid_by=eq.${id}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!id,
  });
  useRealtime({
    table: 'expense_splits',
    filter: currentUserId ? `user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!id,
  });
  useRealtime({
    table: 'expense_splits',
    filter: id ? `user_id=eq.${id}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!id,
  });
  useRealtime({
    table: 'settlements',
    filter: currentUserId ? `from_user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!id,
  });
  useRealtime({
    table: 'settlements',
    filter: currentUserId ? `to_user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!id,
  });
  useRealtime({
    table: 'settlements',
    filter: id ? `from_user_id=eq.${id}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!id,
  });
  useRealtime({
    table: 'settlements',
    filter: id ? `to_user_id=eq.${id}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!id,
  });

  const handleSettleUp = async (friendId: string, amount: number) => {
    if (isSettlingUp) return;

    const previousFriend = friend;
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

      setFriend({
        ...friend,
        balance: normalizedOptimisticBalance,
      });
      setSettleModalVisible(false);

      const settlements = await settlementService.createPairSettlements({
        currentUserId,
        friendId,
        amount: Math.abs(amount),
        currency: 'USD',
        date: Date.now(),
      });

      try {
        for (const settlement of settlements) {
          const currentUserPaid = settlement.fromUserId === currentUserId;
          await activityService.logSettlementCreated({
            settlementId: settlement.id,
            fromUserId: settlement.fromUserId,
            fromUserName: currentUserPaid ? user.name : friend.name,
            toUserName: currentUserPaid ? friend.name : user.name,
            amount: settlement.amount,
            groupId: settlement.groupId,
          });
        }
      } catch {
        // Activity logging should not block a completed settlement.
      }

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
      if (previousFriend) {
        setFriend(previousFriend);
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
            const previousExpenses = expenses;
            const previousActivity = activity;
            const previousFriend = friend;
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

                setExpenses(current => current.filter(expense => expense.id !== expenseId));
                setActivity(current => current.filter(activityItem => (
                  activityItem.type !== 'expense' || activityItem.expense.id !== expenseId
                )));
                setFriend(currentFriend => {
                  if (!currentFriend) return currentFriend;

                  const nextBalance = currentFriend.balance + balanceDelta;

                  return {
                    ...currentFriend,
                    balance: Math.abs(nextBalance) < 0.01 ? 0 : nextBalance,
                  };
                });
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

              await expenseService.delete(expenseId, currentUserId, user?.name || 'Unknown');

              if (expenseToDelete && friend?.pushToken) {
                const notification = createExpenseDeletedNotification(
                  expenseToDelete.description,
                  expenseToDelete.amount,
                  user?.name || 'Someone'
                );
                await notificationService.sendPushNotification(friend.pushToken, notification);
              }

              queryClient.invalidateQueries({ queryKey: friendDetailQueryKey });
            } catch (error) {
              setExpenses(previousExpenses);
              setActivity(previousActivity);
              if (previousFriend) {
                setFriend(previousFriend);
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
              await friendshipService.remove(currentUserId, id);
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

      Alert.alert('Info', 'Reminder notifications will be sent when push token storage is implemented');

      if (friend.pushToken) {
        await notificationService.sendPushNotification(
          friend.pushToken,
          {
            type: 'expense_reminder',
            title: 'Payment Reminder',
            body: `${user?.name || 'Someone'} is reminding you about the outstanding balance of $${Math.abs(balance).toFixed(2)}`,
            data: { friendId: id }
          }
        );
        Alert.alert('Success', 'Reminder sent!');
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
  const balanceAccessibilityValue = `${balanceCopy}, $${Math.abs(balance).toFixed(2)}`;


  const renderSettlementActivity = (item: Extract<FriendActivityItem, { type: 'settlement' }>) => {
    const youPaid = item.direction === 'you_paid_friend';
    const title = youPaid
      ? `You paid ${friend.name.split(' ')[0]}`
      : `${friend.name.split(' ')[0]} paid you`;
    const subtitle = item.groupId
      ? `${formatDate(item.date)} • Group settlement`
      : `${formatDate(item.date)} • Settlement`;
    const amountPrefix = youPaid ? '-' : '+';
    const amountColor = youPaid ? friendDetailTheme.negative : friendDetailTheme.positive;

    return (
      <Animated.View
        key={item.id}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}, ${formatDate(item.date)}, ${youPaid ? 'you paid' : 'you received'} $${item.amount.toFixed(2)}`}
        style={[
          styles.updateRow,
          {
            backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
            borderWidth: 0,
            shadowColor: isDark ? '#000000' : '#475569',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: isDark ? 0.35 : 0.09,
            shadowRadius: 10,
            elevation: 3,
          },
        ]}>
        <View style={[styles.updateMarker, { backgroundColor: amountColor }]} />
        <View style={styles.updateInfo}>
          <ThemedText style={[styles.updateTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText style={[styles.updateMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        </View>
        <View style={styles.updateAmountBlock}>
          <ThemedText style={[styles.updateStatus, { color: colors.textSecondary }]}>
            Settled
          </ThemedText>
          <ThemedText style={[styles.updateAmount, { color: amountColor }]}>
            {amountPrefix}${item.amount.toFixed(2)}
          </ThemedText>
        </View>
        <View style={[styles.updateIcon, { backgroundColor: youPaid ? friendDetailTheme.negativeSurface : friendDetailTheme.positiveSurface }]}>
          <IconSymbol
            size={16}
            name="checkmark.circle.fill"
            color={amountColor}
          />
        </View>
      </Animated.View>
    );
  };

  const renderExpenseActivity = (item: Extract<FriendActivityItem, { type: 'expense' }>) => {
    const expense = item.expense;

    return (
      <Swipeable
        key={item.id}
        ref={(ref) => {
          if (ref) {
            swipeableRefs.current.set(expense.id, ref);
          } else {
            swipeableRefs.current.delete(expense.id);
          }
        }}
        renderLeftActions={(expense.createdBy === currentUserId || expense.paidBy === currentUserId) ? (progress, dragX) => (
          <Animated.View style={[styles.swipeActionLeft, {
            backgroundColor: friendDetailTheme.actionSurface,
            opacity: dragX.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' })
          }]}>
            <TouchableOpacity
              onPress={() => handleEditExpense(expense.id)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${expense.description}`}
              accessibilityHint="Opens the edit expense screen"
              style={styles.swipeActionButton}>
              <IconSymbol name="pencil" size={20} color={friendDetailTheme.actionIcon} />
              <ThemedText style={[styles.swipeActionText, { color: friendDetailTheme.actionIcon }]}>Edit</ThemedText>
            </TouchableOpacity>
          </Animated.View>
        ) : undefined}
        renderRightActions={(expense.createdBy === currentUserId || expense.paidBy === currentUserId) ? (progress, dragX) => (
          <Animated.View style={[styles.swipeActionRight, {
            backgroundColor: friendDetailTheme.dangerSurface,
            opacity: dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' })
          }]}>
            <TouchableOpacity
              onPress={() => handleDeleteExpense(expense.id)}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${expense.description}`}
              accessibilityHint="Deletes this expense after confirmation"
              accessibilityState={{ busy: deletingExpenseId === expense.id }}
              style={styles.swipeActionButton}>
              <IconSymbol name="trash" size={20} color={friendDetailTheme.danger} />
              <ThemedText style={[styles.swipeActionText, { color: friendDetailTheme.danger }]}>Delete</ThemedText>
            </TouchableOpacity>
          </Animated.View>
        ) : undefined}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        overshootFriction={8}
        enableTrackpadTwoFingerGesture
        containerStyle={{ overflow: 'visible' }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${expense.description}, ${formatDate(expense.date)}, ${expense.paidByName} paid $${expense.amount.toFixed(2)}, ${expense.paidBy === currentUserId ? `you are owed $${expense.friendShare.toFixed(2)}` : `you owe $${expense.yourShare.toFixed(2)}`}`}
          accessibilityHint="Opens expense details"
          activeOpacity={0.7}
          onPress={() => handleOpenExpense(expense.id)}>
          <Animated.View
            style={[
              styles.expenseCard,
              {
                backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
                borderWidth: 0,
                shadowColor: isDark ? '#000000' : '#475569',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: isDark ? 0.35 : 0.09,
                shadowRadius: 10,
                elevation: 3,
              },
            ]}>
            <View style={[
              styles.expenseIcon,
              {
                backgroundColor: expense.paidBy === currentUserId
                  ? (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(15, 76, 58, 0.08)')
                  : (isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.08)'),
              }
            ]}>
              <IconSymbol
                size={15}
                name={expense.groupId ? 'person.2.fill' : 'arrow.up.right'}
                color={expense.paidBy === currentUserId ? (isDark ? '#2DD4BF' : '#0F4C3A') : colors.error}
              />
            </View>
            <View style={styles.expenseInfo}>
              <ThemedText type="subtitle" style={[styles.expenseDescription, { color: colors.text }]} numberOfLines={1}>
                {expense.description}
              </ThemedText>
              <ThemedText style={[styles.expenseDate, { color: colors.textSecondary }]} numberOfLines={1}>
                {formatDate(expense.date)} • {expense.paidByName} paid ${expense.amount.toFixed(2)}
              </ThemedText>
            </View>
            <ThemedText
              type="subtitle"
              style={[
                styles.expenseShare,
                { color: expense.paidBy === currentUserId ? (isDark ? '#2DD4BF' : '#0F4C3A') : colors.error },
              ]}>
              {expense.paidBy === currentUserId
                ? `+$${expense.friendShare.toFixed(2)}`
                : `-$${expense.yourShare.toFixed(2)}`}
            </ThemedText>
            <IconSymbol
              size={17}
              name="chevron.right"
              color={colors.textSecondary}
              style={styles.expenseChevron}
            />
          </Animated.View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderExpenseActivityEvent = (item: Extract<FriendActivityItem, { type: 'expense_activity' }>) => {
    const isDeleted = item.isDeleted;
    const statusLabel = isDeleted ? 'Deleted' : 'Updated';
    const title = item.description.replace(/^(Deleted|Updated):\s*/i, '');
    const actorName = item.userId === currentUserId ? 'You' : item.userName || friend.name.split(' ')[0];
    const statusColor = isDeleted ? friendDetailTheme.danger : friendDetailTheme.warning;
    const iconSurface = isDeleted ? friendDetailTheme.dangerSurface : friendDetailTheme.warningSurface;
    const iconName = isDeleted ? 'trash.fill' : 'pencil';
    const amountLabel = item.amount === undefined ? null : `$${item.amount.toFixed(2)}`;

    const content = (
      <Animated.View
        style={[
          styles.updateRow,
          {
            backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
            borderWidth: 0,
            shadowColor: isDark ? '#000000' : '#475569',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: isDark ? 0.35 : 0.09,
            shadowRadius: 10,
            elevation: 3,
          },
            ]}>
        <View style={[styles.updateMarker, { backgroundColor: statusColor }]} />
        <View style={styles.updateInfo}>
          <View style={styles.activityEventTitleRow}>
            <ThemedText style={[styles.updateTitle, { color: colors.text }]} numberOfLines={1}>
              {title}
            </ThemedText>
            <View style={[styles.activityEventBadge, { backgroundColor: iconSurface }]}>
              <ThemedText style={[styles.activityEventBadgeText, { color: statusColor }]}>
                {statusLabel}
              </ThemedText>
            </View>
          </View>
          <ThemedText style={[styles.updateMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {formatDate(item.date)} • {actorName}
          </ThemedText>
        </View>
        {amountLabel && (
          <View style={styles.updateAmountBlock}>
            <ThemedText style={[styles.updateStatus, { color: colors.textSecondary }]}>
              total
            </ThemedText>
            <ThemedText style={[styles.updateAmount, { color: colors.textSecondary }]}>
              {amountLabel}
            </ThemedText>
          </View>
        )}
        <View style={[styles.updateIcon, { backgroundColor: iconSurface }]}>
          <IconSymbol
            size={16}
            name={iconName}
            color={statusColor}
          />
        </View>
      </Animated.View>
    );

    if (isDeleted) {
      return (
        <View
          key={item.id}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${statusLabel} ${title}, ${formatDate(item.date)}, by ${actorName}`}>
          {content}
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`${statusLabel} ${title}, ${formatDate(item.date)}, by ${actorName}`}
        accessibilityHint="Opens expense details"
        activeOpacity={0.7}
        onPress={() => handleOpenExpense(item.targetId)}>
        {content}
      </TouchableOpacity>
    );
  };

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
            <View
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`${friend.name}${friend.email ? `, ${friend.email}` : ''}, ${balanceAccessibilityValue}`}
              accessibilityLiveRegion="polite"
              style={[styles.summaryCard, {
                backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
                borderWidth: 0,
                shadowColor: isDark ? '#000000' : '#475569',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: isDark ? 0.35 : 0.09,
                shadowRadius: 10,
                elevation: 3,
              }]}>
              <View style={styles.summaryTopRow}>
                <View style={[styles.summaryAvatar, {
                  backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(15, 76, 58, 0.1)',
                  borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(15, 76, 58, 0.2)',
                }]}>
                  <ThemedText style={[styles.summaryAvatarText, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}>
                    {friend.name.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.summaryIdentity}>
                  <ThemedText type="title" numberOfLines={1} style={[styles.summaryName, { color: colors.text }]}>
                    {friend.name}
                  </ThemedText>
                  {friend.email && (
                    <ThemedText numberOfLines={1} style={[styles.summaryEmail, { color: colors.textSecondary }]}>
                      {friend.email}
                    </ThemedText>
                  )}
                </View>
              </View>
              <View style={styles.summaryBalanceRow}>
                <View style={[styles.balanceIndicator, { backgroundColor: balanceColor }]} />
                <ThemedText style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                  {balanceCopy}
                </ThemedText>
              </View>
              <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                ${Math.abs(balance).toFixed(2)}
              </ThemedText>
            </View>
          </Animated.View>
        </Animated.View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickActionButton, {
              opacity: balance === 0 ? 0.5 : 1,
            }]}
            accessibilityRole="button"
            accessibilityLabel={`Settle up with ${friend.name}`}
            accessibilityHint="Opens the settlement form for this balance"
            accessibilityState={{ disabled: isSettlingUp || balance === 0, busy: isSettlingUp }}
            disabled={isSettlingUp || balance === 0}
            onPress={() => setSettleModalVisible(true)}>
            <View style={[styles.quickActionSolidButton, {
              backgroundColor: isDark ? '#0D9488' : '#0F4C3A',
            }]}>
              <IconSymbol size={18} name="checkmark" color="ffffff" />
              <ThemedText style={[styles.quickActionTextSolid]}>Settle Up</ThemedText>
            </View>
          </TouchableOpacity>
        </View>

        <View
          accessibilityRole="toolbar"
          accessibilityLabel="Activity filter"
          onLayout={({ nativeEvent }) => setSegmentedWidth(nativeEvent.layout.width)}
          style={[styles.segmentedControl, {
            backgroundColor: friendDetailTheme.surface,
            borderColor: friendDetailTheme.surfaceBorder,
          }]}>
          {segmentWidth > 0 && (
            <Reanimated.View
              pointerEvents="none"
              style={[
                styles.segmentedIndicator,
                {
                  width: segmentWidth,
                  backgroundColor: isDark ? 'rgba(13, 148, 136, 0.08)' : '#ffffff',
                  borderColor: isDark ? '#0D9488' : '#0F4C3A',
                  borderWidth: 1,
                },
                tabIndicatorStyle,
              ]}
            />
          )}
          {ACTIVITY_FILTERS.map(filter => {
            const isSelected = activityFilter === filter.id;
            const activeColor = isDark ? '#0D9488' : '#0F4C3A';

            return (
              <TouchableOpacity
                key={filter.id}
                accessibilityRole="button"
                accessibilityLabel={filter.label}
                accessibilityState={{ selected: isSelected }}
                activeOpacity={0.78}
                onPress={() => handleActivityFilterChange(filter.id)}
                style={[
                  styles.segmentedOption,
                ]}>
                <IconSymbol
                  size={14}
                  name={filter.icon}
                  color={isSelected ? activeColor : colors.textSecondary}
                />
                <ThemedText
                  style={[
                    styles.segmentedLabel,
                    { color: isSelected ? activeColor : colors.textSecondary },
                  ]}>
                  {filter.label}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expense History */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Activity
            </ThemedText>
            <ThemedText style={[styles.expenseCount, { color: colors.textSecondary }]}>
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
                    <ThemedText style={[styles.monthHeaderText, { color: colors.textSecondary }]}>
                      {group.monthYear}
                    </ThemedText>
                  </View>
                  {group.items.map(item => (
                    <View key={item.id}>
                      {item.type === 'expense'
                        ? renderExpenseActivity(item)
                        : item.type === 'settlement'
                          ? renderSettlementActivity(item)
                          : renderExpenseActivityEvent(item)}
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
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryAvatar: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  summaryIdentity: {
    flex: 1,
    minWidth: 0,
  },
  summaryAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  summaryName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  summaryEmail: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  summaryBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  balanceIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
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
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  quickActionButton: {
    flex: 1,
  },
  quickActionSolidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    height: 48,
    gap: 8,
  },
  quickActionOutlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    height: 48,
    gap: 8,
  },
  quickActionTextSolid: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  quickActionTextOutline: {
    fontSize: 14,
    fontWeight: '700',
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  segmentedIndicator: {
    position: 'absolute',
    top: SEGMENTED_CONTROL_PADDING,
    bottom: SEGMENTED_CONTROL_PADDING,
    left: SEGMENTED_CONTROL_PADDING,
    borderRadius: 9,
    borderWidth: 0,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  segmentedOption: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
    zIndex: 1,
  },
  segmentedLabel: {
    fontSize: 12,
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
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 0,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 7,
    borderRadius: 10,
    borderWidth: 0,
    gap: 9,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  updateMarker: {
    width: 3,
    height: 28,
    borderRadius: 999,
  },
  expenseIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  expenseInfo: {
    flex: 1,
    minWidth: 0,
  },
  updateInfo: {
    flex: 1,
    minWidth: 0,
  },
  updateTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  updateMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  updateAmountBlock: {
    alignItems: 'flex-end',
    minWidth: 58,
  },
  updateStatus: {
    fontSize: 10,
    marginBottom: 1,
  },
  updateAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  updateIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityEventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  activityEventBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  activityEventBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  expenseDescription: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 11,
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
  expenseShare: {
    fontSize: 13,
    fontWeight: '700',
  },
  expenseChevron: {
    marginLeft: 8,
  },
  swipeActionLeft: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: 80,
    borderRadius: 12,
    marginBottom: 8,
  },
  swipeActionRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 80,
    borderRadius: 12,
    marginBottom: 8,
  },
  swipeActionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    gap: 4,
  },
  swipeActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
}) as any;
