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
import { BlurView } from 'expo-blur';
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

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gradients, colors, isDark } = useThemeColors();
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
  const [scaleAnim] = useState(() => new Animated.Value(0.9));
  const [pulseAnim] = useState(() => new Animated.Value(1));

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

      if (friend.balance !== 0) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.05,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    }
  }, [fadeAnim, friend, loading, pulseAnim, scaleAnim, slideAnim]);

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
              backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)'
            }]}>
            <IconSymbol size={20} name="chevron.left" color={isDark ? '#2DD4BF' : colors.tint} />
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
  const balanceColor = balance > 0 ? '#10b981' : balance < 0 ? '#ef4444' : '#2DD4BF';
  const balanceGradient = balance > 0
    ? ['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.05)']
    : balance < 0
      ? ['rgba(239, 68, 68, 0.2)', 'rgba(239, 68, 68, 0.05)']
      : ['rgba(45, 212, 191, 0.2)', 'rgba(45, 212, 191, 0.05)'];

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      {/* Animated background orbs */}
      <View style={styles.orbContainer}>
        <Animated.View style={[styles.orb, styles.orb1, { transform: [{ scale: pulseAnim }] }]} />
        <Animated.View style={[styles.orb, styles.orb2]} />
        <View style={[styles.orb, styles.orb3]} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButtonRect, {
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
            borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)'
          }]}>
          <IconSymbol size={20} name="chevron.left" color={isDark ? '#2DD4BF' : colors.tint} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleRemind}
            style={[styles.headerActionButton, {
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(251, 191, 36, 0.15)',
              borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(251, 191, 36, 0.3)'
            }]}>
            <IconSymbol size={18} name="bell.fill" color="#f59e0b" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRemoveFriend}
            style={[styles.headerActionButton, {
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderColor: 'rgba(239, 68, 68, 0.3)'
            }]}>
            <IconSymbol size={18} name="trash" color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* Profile Hero Section */}
        <Animated.View style={[
          styles.heroSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          }
        ]}>
          {/* Large Avatar with glow effect */}
          <View style={styles.avatarWrapper}>
            <LinearGradient
              colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
              style={styles.avatarGlow}
            />
            <View style={[styles.avatar, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]}>
              <LinearGradient
                colors={isDark ? ['rgba(45, 212, 191, 0.3)', 'rgba(45, 212, 191, 0.1)'] : ['rgba(34, 197, 94, 0.3)', 'rgba(34, 197, 94, 0.1)']}
                style={styles.avatarInner}>
                <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                  {friend.name.charAt(0).toUpperCase()}
                </ThemedText>
              </LinearGradient>
            </View>
          </View>

          {/* Name and email */}
          <ThemedText type="title" style={[styles.friendName, !isDark && { color: colors.text }]}>
            {friend.name}
          </ThemedText>
          {friend.email && (
            <ThemedText style={[styles.friendEmail, !isDark && { color: colors.textSecondary }]}>
              {friend.email}
            </ThemedText>
          )}
        </Animated.View>

        {/* Balance Card with glassmorphism */}
        <Animated.View style={[
          styles.balanceCardWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }
        ]}>
          <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.balanceCard}>
            <LinearGradient
              colors={balanceGradient as [string, string]}
              style={styles.balanceGradientOverlay}
            />
            <View style={styles.balanceContent}>
              {balance !== 0 ? (
                <>
                  <View style={styles.balanceHeader}>
                    <View style={[styles.balanceIndicator, { backgroundColor: balanceColor }]} />
                    <ThemedText style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
                      {balance > 0 ? `${friend.name.split(' ')[0]} owes you` : `You owe ${friend.name.split(' ')[0]}`}
                    </ThemedText>
                  </View>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                      ${Math.abs(balance).toFixed(2)}
                    </ThemedText>
                  </Animated.View>
                </>
              ) : (
                <View style={styles.settledContainer}>
                  <View style={styles.settledIconWrapper}>
                    <LinearGradient
                      colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
                      style={styles.settledIcon}>
                      <IconSymbol size={28} name="checkmark" color="#fff" />
                    </LinearGradient>
                  </View>
                  <ThemedText style={[styles.settledText, !isDark && { color: colors.text }]}>
                    All settled up!
                  </ThemedText>
                  <ThemedText style={[styles.settledSubtext, !isDark && { color: colors.textSecondary }]}>
                    No outstanding balance with {friend.name.split(' ')[0]}
                  </ThemedText>
                </View>
              )}
            </View>
          </BlurView>
        </Animated.View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push({ pathname: '/add-expense', params: { friendId: id } })}>
            <LinearGradient
              colors={gradients.buttonPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickActionGradient}>
              <IconSymbol size={20} name="plus.circle.fill" color="#0A0A0F" />
              <ThemedText style={[styles.quickActionTextDark, { color: '#0A0A0F' }]}>Add Expense</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
          {balance !== 0 && (
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => setSettleModalVisible(true)}>
              <LinearGradient
                colors={['#10b981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickActionGradient}>
                <IconSymbol size={20} name="checkmark.circle.fill" color="#fff" />
                <ThemedText style={styles.quickActionTextDark}>Settle Up</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Expense History */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
              Activity
            </ThemedText>
            <ThemedText style={[styles.expenseCount, !isDark && { color: colors.textSecondary }]}>
              {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
            </ThemedText>
          </View>

          {expenses.length === 0 ? (
            <View style={styles.emptyHistory}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
                <IconSymbol size={32} name="doc.text" color={isDark ? '#2DD4BF' : colors.tint} />
              </View>
              <ThemedText style={[styles.emptyTitle, !isDark && { color: colors.text }]}>
                No expenses yet
              </ThemedText>
              <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
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
                  <Animated.View style={[styles.swipeActionLeft, { opacity: dragX.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
                    <TouchableOpacity onPress={() => handleEditExpense(item.id)} style={styles.swipeActionButton}>
                      <IconSymbol name="pencil" size={20} color="#fff" />
                      <ThemedText style={styles.swipeActionText}>Edit</ThemedText>
                    </TouchableOpacity>
                  </Animated.View>
                )}
                renderRightActions={item.paidBy === currentUserId ? (progress, dragX) => (
                  <Animated.View style={[styles.swipeActionRight, { opacity: dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
                    <TouchableOpacity onPress={() => handleDeleteExpense(item.id)} style={styles.swipeActionButton}>
                      <IconSymbol name="trash" size={20} color="#fff" />
                      <ThemedText style={styles.swipeActionText}>Delete</ThemedText>
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
                  activeOpacity={0.7}
                  onPress={() => handleOpenExpense(item.id)}>
                  <Animated.View
                    style={[
                      styles.expenseCard,
                      !isDark && { backgroundColor: colors.card },
                      {
                        opacity: fadeAnim,
                        transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value((index + 1) * 0.2)) }],
                      }
                    ]}>
                    <View style={[
                      styles.expenseIcon,
                      { backgroundColor: item.paidBy === currentUserId ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }
                    ]}>
                      <IconSymbol
                        size={18}
                        name={item.paidBy === currentUserId ? 'arrow.up.right' : 'arrow.down.left'}
                        color={item.paidBy === currentUserId ? '#10b981' : '#ef4444'}
                      />
                    </View>
                    <View style={styles.expenseInfo}>
                      <ThemedText style={[styles.expenseDescription, !isDark && { color: colors.text }]}>
                        {item.description}
                      </ThemedText>
                      <ThemedText style={[styles.expenseDate, !isDark && { color: colors.textSecondary }]}>
                        {formatDate(item.date)} • {item.paidByName} paid
                      </ThemedText>
                    </View>
                    <View style={styles.expenseAmounts}>
                      <ThemedText style={[styles.expenseTotal, !isDark && { color: colors.textSecondary }]}>
                        ${item.amount.toFixed(2)}
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.expenseShare,
                          { color: item.paidBy === currentUserId ? '#10b981' : '#ef4444' },
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
  orbContainer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    top: -100,
    right: -100,
  },
  orb2: {
    width: 200,
    height: 200,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    bottom: 200,
    left: -50,
  },
  orb3: {
    width: 150,
    height: 150,
    backgroundColor: 'rgba(45, 212, 191, 0.08)',
    bottom: 50,
    right: -30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSpinner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 20,
    opacity: 0.3,
    top: -4,
    left: -4,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 42,
  },
  friendName: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 4,
  },
  friendEmail: {
    fontSize: 14,
  },
  balanceCardWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  balanceCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  balanceGradientOverlay: {
    ...StyleSheet.absoluteFill,
  },
  balanceContent: {
    padding: 24,
    alignItems: 'center',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  balanceLabel: {
    fontSize: 14,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 56,
    marginBottom: 20,
  },
  settleButtonContainer: {
    width: '100%',
  },
  settleButton: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settleButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  settledContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  settledIconWrapper: {
    marginBottom: 12,
  },
  settledIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settledText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  settledSubtext: {
    fontSize: 14,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  quickActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  quickActionTextDark: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
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
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
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
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: 80,
    borderRadius: 14,
    marginBottom: 10,
  },
  swipeActionRight: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 80,
    borderRadius: 14,
    marginBottom: 10,
  },
  swipeActionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    gap: 4,
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
