import { SettleUpModal } from '@/components/friends/settle-up-modal';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useDebouncedQueryInvalidation } from '@/hooks/use-debounced-query-invalidation';
import { useRealtime } from '@/hooks/use-realtime';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { expenseService, friendDetailService, initDatabase, settlementService } from '@/services/api';
import type { FriendDetailData } from '@/services/friend-detail-service';
import { applySettlementsToGroupDetailData, type GroupDetailData } from '@/services/group-detail-service';
import { friendshipService } from '@/services/friendship-service';
import { createExpenseDeletedNotification, notificationService } from '@/services/notification-service';
import { queryKeys } from '@/services/query-keys';
import type { Expense, User } from '@/types/database';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';

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

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gradients, colors, friendDetail: friendDetailTheme } = useThemeColors();
  const [friend, setFriend] = useState<UserWithBalance | null>(null);
  const [expenses, setExpenses] = useState<ExpenseWithSplit[]>([]);
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
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));
  const [scaleAnim] = useState(() => new Animated.Value(0.98));

  const {
    data: friendDetail,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: friendDetailQueryKey,
    enabled: !!currentUserId && !!id,
    queryFn: async () => {
      await initDatabase();
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

    setFriend(friendDetail.friend);
    setExpenses(friendDetail.expenses);
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
        queryClient.setQueryData<GroupDetailData | null>(
          queryKeys.groups.detail(currentUserId, groupId),
          current => current ? applySettlementsToGroupDetailData(current, groupSettlements) : current
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
    return <LoadingState message="Loading friend details..." />;
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

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.ambientLayer}>
        <View style={[styles.ambientShape, styles.ambientTop, { backgroundColor: friendDetailTheme.backgroundAccentTop }]} />
        <View style={[styles.ambientShape, styles.ambientMiddle, { backgroundColor: friendDetailTheme.backgroundAccentMiddle }]} />
        <View style={[styles.ambientShape, styles.ambientBottom, { backgroundColor: friendDetailTheme.backgroundAccentBottom }]} />
      </View>

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

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        <Animated.View style={[
          styles.heroSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          }
        ]}>
          <View
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`${friend.name}${friend.email ? `, ${friend.email}` : ''}`}
            style={[styles.profileCard, {
              backgroundColor: friendDetailTheme.surface,
              borderColor: friendDetailTheme.surfaceBorder,
            }]}>
            <View style={[styles.avatar, {
              backgroundColor: friendDetailTheme.avatarSurface,
              borderColor: friendDetailTheme.avatarBorder,
            }]}>
              <ThemedText style={[styles.avatarText, { color: friendDetailTheme.actionIcon }]}>
                {friend.name.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.profileInfo}>
              <ThemedText type="title" numberOfLines={1} style={[styles.friendName, { color: colors.text }]}>
                {friend.name}
              </ThemedText>
              {friend.email && (
                <ThemedText numberOfLines={1} style={[styles.friendEmail, { color: colors.textSecondary }]}>
                  {friend.email}
                </ThemedText>
              )}
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[
          styles.balanceCardWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }
        ]}>
          <View
            accessible
            accessibilityRole="summary"
            accessibilityLabel={balanceAccessibilityValue}
            accessibilityLiveRegion="polite"
            style={[styles.balanceCard, {
              backgroundColor: balanceSurface,
              borderColor: friendDetailTheme.surfaceBorder,
            }]}>
            <View style={styles.balanceHeader}>
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

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            accessibilityRole="button"
            accessibilityLabel={`Add expense with ${friend.name}`}
            accessibilityHint="Opens the add expense screen for this friend"
            onPress={() => router.push({ pathname: '/add-expense', params: { friendId: id } })}>
            <LinearGradient
              colors={gradients.buttonPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickActionGradient}>
              <IconSymbol size={18} name="plus.circle.fill" color={friendDetailTheme.onPrimary} />
              <ThemedText style={[styles.quickActionTextDark, { color: friendDetailTheme.onPrimary }]}>Add Expense</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
          {balance !== 0 && (
            <TouchableOpacity
              style={[styles.quickActionButton, styles.secondaryQuickActionButton, {
                backgroundColor: friendDetailTheme.positiveSurface,
                borderColor: friendDetailTheme.positiveBorder,
              }]}
              accessibilityRole="button"
              accessibilityLabel={`Settle up with ${friend.name}`}
              accessibilityHint="Opens the settlement form for this balance"
              accessibilityState={{ disabled: isSettlingUp, busy: isSettlingUp }}
              disabled={isSettlingUp}
              onPress={() => setSettleModalVisible(true)}>
              <IconSymbol size={18} name="checkmark.circle.fill" color={friendDetailTheme.positive} />
              <ThemedText style={[styles.quickActionTextDark, { color: friendDetailTheme.positive }]}>Settle Up</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Expense History */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Activity
            </ThemedText>
            <ThemedText style={[styles.expenseCount, { color: colors.textSecondary }]}>
              {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
            </ThemedText>
          </View>

          {expenses.length === 0 ? (
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
            expenses.map((item, index) => (
              <Swipeable
                key={item.id}
                ref={(ref) => {
                  if (ref) {
                    swipeableRefs.current.set(item.id, ref);
                  } else {
                    swipeableRefs.current.delete(item.id);
                  }
                }}
                renderLeftActions={(progress, dragX) => (
                  <Animated.View style={[styles.swipeActionLeft, {
                    backgroundColor: friendDetailTheme.actionSurface,
                    opacity: dragX.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' })
                  }]}>
                    <TouchableOpacity
                      onPress={() => handleEditExpense(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.description}`}
                      accessibilityHint="Opens the edit expense screen"
                      style={styles.swipeActionButton}>
                      <IconSymbol name="pencil" size={20} color={friendDetailTheme.actionIcon} />
                      <ThemedText style={[styles.swipeActionText, { color: friendDetailTheme.actionIcon }]}>Edit</ThemedText>
                    </TouchableOpacity>
                  </Animated.View>
                )}
                renderRightActions={item.paidBy === currentUserId ? (progress, dragX) => (
                  <Animated.View style={[styles.swipeActionRight, {
                    backgroundColor: friendDetailTheme.dangerSurface,
                    opacity: dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' })
                  }]}>
                    <TouchableOpacity
                      onPress={() => handleDeleteExpense(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.description}`}
                      accessibilityHint="Deletes this expense after confirmation"
                      accessibilityState={{ busy: deletingExpenseId === item.id }}
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
                  accessibilityLabel={`${item.description}, ${formatDate(item.date)}, ${item.paidByName} paid $${item.amount.toFixed(2)}, ${item.paidBy === currentUserId ? `you are owed $${item.friendShare.toFixed(2)}` : `you owe $${item.yourShare.toFixed(2)}`}`}
                  accessibilityHint="Opens expense details"
                  activeOpacity={0.7}
                  onPress={() => handleOpenExpense(item.id)}>
                  <Animated.View
                    style={[
                      styles.expenseCard,
                      {
                        backgroundColor: friendDetailTheme.surface,
                        borderColor: friendDetailTheme.surfaceBorder,
                      },
                      {
                        opacity: fadeAnim,
                        transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value((index + 1) * 0.2)) }],
                      }
                    ]}>
                    <View style={[
                      styles.expenseIcon,
                      { backgroundColor: item.paidBy === currentUserId ? friendDetailTheme.positiveSurface : friendDetailTheme.negativeSurface }
                    ]}>
                      <IconSymbol
                        size={18}
                        name={item.paidBy === currentUserId ? 'arrow.up.right' : 'arrow.down.left'}
                        color={item.paidBy === currentUserId ? friendDetailTheme.positive : friendDetailTheme.negative}
                      />
                    </View>
                    <View style={styles.expenseInfo}>
                      <ThemedText style={[styles.expenseDescription, { color: colors.text }]} numberOfLines={1}>
                        {item.description}
                      </ThemedText>
                      <ThemedText style={[styles.expenseDate, { color: colors.textSecondary }]} numberOfLines={1}>
                        {formatDate(item.date)} • {item.paidByName} paid
                      </ThemedText>
                    </View>
                    <View style={styles.expenseAmounts}>
                      <ThemedText style={[styles.expenseTotal, { color: colors.textSecondary }]}>
                        ${item.amount.toFixed(2)}
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.expenseShare,
                          { color: item.paidBy === currentUserId ? friendDetailTheme.positive : friendDetailTheme.negative },
                        ]}>
                        {item.paidBy === currentUserId
                          ? `+$${item.friendShare.toFixed(2)}`
                          : `-$${item.yourShare.toFixed(2)}`}
                      </ThemedText>
                    </View>
                  </Animated.View>
                </TouchableOpacity>
              </Swipeable>
            ))
          )}
        </View>

      </ScrollView>

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
  heroSection: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  friendName: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
  },
  friendEmail: {
    fontSize: 14,
    lineHeight: 18,
    marginTop: 2,
  },
  balanceCardWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  balanceCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  balanceIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 18,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  secondaryQuickActionButton: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  quickActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  quickActionTextDark: {
    fontWeight: '600',
    fontSize: 14,
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
    marginBottom: 12,
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
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  expenseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  expenseDate: {
    fontSize: 12,
  },
  expenseAmounts: {
    alignItems: 'flex-end',
  },
  expenseTotal: {
    fontSize: 12,
    marginBottom: 2,
  },
  expenseShare: {
    fontSize: 16,
    fontWeight: '700',
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
});
