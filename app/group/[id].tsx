import { AddMemberModal } from '@/components/group';
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
import { expenseService } from '@/services/expense-service';
import { groupDetailService } from '@/services/group-detail-service';
import { groupService } from '@/services/group-service';
import { userService } from '@/services/user-service';
import { friendshipService } from '@/services/friendship-service';
import type { GroupDetailData } from '@/services/group-detail-service';
import { areGroupBalancesSettled, calculateGroupBalances } from '@/services/group-balance';
import {
  createExpenseDeletedNotification,
  createMemberAddedNotification,
  notificationService,
} from '@/services/notification-service';
import { queryKeys } from '@/services/query-keys';
import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, User } from '@/types/database';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';

const MIN_TOUCH_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };

export default function GroupDetailScreen() {
  const { gradients, colors, friendDetail: friendDetailTheme, isDark } = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<(Expense & { paidByUser?: User })[]>([]);
  const [members, setMembers] = useState<(GroupMember & { user?: User })[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [expenseSplits, setExpenseSplits] = useState<ExpenseSplit[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const expenseSwipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const memberSwipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));
  const [scaleAnim] = useState(() => new Animated.Value(0.95));
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [friendshipStatus, setFriendshipStatus] = useState<Map<string, 'none' | 'pending_sent' | 'pending_received' | 'accepted'>>(new Map());
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);
  const groupDetailQueryKey = useMemo(() => queryKeys.groups.detail(currentUserId, id), [currentUserId, id]);
  const invalidateGroupDetail = useDebouncedQueryInvalidation(groupDetailQueryKey, 500);

  const {
    data: groupDetail,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: groupDetailQueryKey,
    enabled: !!currentUserId && !!id,
    queryFn: () => groupDetailService.getDetail(currentUserId, id),
  });
  const loading = isLoading && !group;
  const loadError = error ? getFetchErrorMessage(error) : null;
  const filteredExpenses = useMemo(() => {
    const search = expenseSearch.trim().toLocaleLowerCase();
    if (!search) return expenses;

    return expenses.filter(expense => (
      expense.description.toLocaleLowerCase().includes(search) ||
      expense.paidByUser?.name.toLocaleLowerCase().includes(search)
    ));
  }, [expenseSearch, expenses]);

  useEffect(() => {
    if (groupDetail === undefined) return;
    if (!groupDetail) {
      Alert.alert('Error', 'Group not found');
      router.back();
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Query data is mirrored so optimistic local mutations can update immediately.
    setGroup(groupDetail.group);
    setExpenses(groupDetail.expenses);
    setMembers(groupDetail.members);
    setBalances(groupDetail.balances);
    setAvailableUsers(groupDetail.availableUsers);
    setFriendshipStatus(groupDetail.friendshipStatus);
    setExpenseSplits(groupDetail.splits);
    setSettlements(groupDetail.settlements);
  }, [groupDetail]);

  const loadGroupData = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useRealtime({
    table: 'groups',
    filter: id ? `id=eq.${id}` : undefined,
    onChange: invalidateGroupDetail,
    enabled: !!id,
  });
  useRealtime({
    table: 'group_members',
    filter: id ? `group_id=eq.${id}` : undefined,
    onChange: invalidateGroupDetail,
    enabled: !!id,
  });
  useRealtime({
    table: 'expenses',
    filter: id ? `group_id=eq.${id}` : undefined,
    onChange: invalidateGroupDetail,
    enabled: !!id,
  });
  useRealtime({
    table: 'settlements',
    filter: id ? `group_id=eq.${id}` : undefined,
    onChange: invalidateGroupDetail,
    enabled: !!id,
  });

  const addMember = async () => {
    if (isAddingMember) return;

    if (selectedUserIds.length === 0) {
      Alert.alert('Error', 'Please select at least one friend');
      return;
    }

    try {
      setIsAddingMember(true);
      await Promise.all(selectedUserIds.map(userId => groupService.addMember(id, userId)));

      if (group && user) {
        await Promise.all(selectedUserIds.map(async userId => {
          const newMember = availableUsers.find(u => u.id === userId);
          return activityService.logMemberAdded({
            groupId: id,
            userId: currentUserId,
            userName: user.name,
            memberName: newMember?.name || 'Someone',
            groupName: group.name,
          });
        }));

        // Notify each newly added member individually so the message can use
        // their name. Push failures must not turn a successful membership add
        // into a failed group operation.
        try {
          const usersToNotify = await userService.getByIds(selectedUserIds);

          await Promise.all(
            usersToNotify
              .filter((newMember): newMember is User => !!newMember.pushToken)
              .map(newMember => notificationService.sendPushNotification(
                newMember.pushToken!,
                createMemberAddedNotification(
                  group.name,
                  user.name,
                  newMember.name,
                  id,
                ),
              ))
          );
        } catch (notificationError) {
          console.error('Error sending group member notifications:', notificationError);
        }
      }

      setSelectedUserIds([]);
      setMemberModalVisible(false);
      loadGroupData();
    } catch (error) {
      console.error('Error adding member:', error);
      Alert.alert('Error', 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  }

  async function handleAddFriend(memberUserId: string) {
    try {
      await friendshipService.create(currentUserId, memberUserId);

      setFriendshipStatus(prev => {
        const newMap = new Map(prev);
        newMap.set(memberUserId, 'pending_sent');
        return newMap;
      });

      Alert.alert('Success', 'Friend request sent');
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request');
    }
  }

  function handleSettleUp() {
    router.push(`/group/settle/${id}`);
  }

  function handleDeleteGroup() {
    if (isDeletingGroup || !group) return;

    if (!areGroupBalancesSettled(balances)) {
      Alert.alert(
        'Settle Group First',
        'This group still has outstanding balances. Settle all expenses before deleting it.'
      );
      return;
    }

    Alert.alert(
      'Delete Group',
      `Delete "${group.name}"? This will remove the group and its expenses for everyone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingGroup(true);
              await groupService.delete(id);
              router.replace('/groups' as any);
            } catch (error) {
              console.error('Error deleting group:', error);
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete group');
            } finally {
              setIsDeletingGroup(false);
            }
          },
        },
      ]
    );
  }

  function handleEditExpense(expenseId: string) {
    expenseSwipeableRefs.current.get(expenseId)?.close();
    router.push(`/edit-expense/${expenseId}` as any);
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
            const previousBalances = balances;
            const previousSplits = expenseSplits;
            let previousHomeFriends: (User & { balance: number; recentExpenses?: Expense[] })[] | undefined;
            try {
              setDeletingExpenseId(expenseId);
              expenseSwipeableRefs.current.get(expenseId)?.close();

              const nextExpenses = expenses.filter(expense => expense.id !== expenseId);
              const nextSplits = expenseSplits.filter(split => split.expenseId !== expenseId);
              const nextBalances = calculateGroupBalances(nextExpenses, nextSplits, settlements);
              setExpenses(nextExpenses);
              setExpenseSplits(nextSplits);
              setBalances(nextBalances);
              queryClient.setQueryData<GroupDetailData | null>(groupDetailQueryKey, current => current ? {
                ...current,
                expenses: nextExpenses,
                splits: nextSplits,
                balances: nextBalances,
              } : current);

              if (expenseToDelete) {
                const deletedExpenseSplits = expenseSplits.filter(split => split.expenseId === expenseId);
                const currentUserSplit = deletedExpenseSplits.find(split => split.userId === currentUserId);

                if (currentUserSplit) {
                  await queryClient.cancelQueries({ queryKey: friendsHomeQueryKey });
                  previousHomeFriends = queryClient.getQueryData(friendsHomeQueryKey);
                  queryClient.setQueryData<(User & { balance: number; recentExpenses?: Expense[] })[]>(
                    friendsHomeQueryKey,
                    current => current?.map(friend => {
                      const friendSplit = deletedExpenseSplits.find(split => split.userId === friend.id);
                      if (!friendSplit) return friend;

                      let balanceDelta = 0;
                      if (expenseToDelete.paidBy === currentUserId) {
                        balanceDelta = -friendSplit.amount;
                      } else if (expenseToDelete.paidBy === friend.id) {
                        balanceDelta = currentUserSplit.amount;
                      }

                      if (balanceDelta === 0) return friend;

                      const nextBalance = friend.balance + balanceDelta;
                      return {
                        ...friend,
                        balance: Math.abs(nextBalance) < 0.01 ? 0 : nextBalance,
                        recentExpenses: friend.recentExpenses?.filter(expense => expense.id !== expenseId),
                      };
                    })
                  );
                }
              }

              await expenseService.delete(expenseId, currentUserId, user?.name || 'Unknown');
              if (expenseToDelete) {
                const deletedExpenseSplits = expenseSplits.filter(split => split.expenseId === expenseId);
                const usersToNotify = await userService.getByIds(
                  deletedExpenseSplits
                    .map(split => split.userId)
                    .filter(userId => userId !== currentUserId)
                );
                const pushTokens = usersToNotify
                  .filter((u) => u && u.pushToken)
                  .map((u) => u!.pushToken!);
                if (pushTokens.length > 0) {
                  const notification = createExpenseDeletedNotification(
                    expenseToDelete.description,
                    expenseToDelete.amount,
                    user?.name || 'Someone',
                    group?.name
                  );
                  await notificationService.sendNotificationToUsers(pushTokens, notification);
                }
              }
              queryClient.invalidateQueries({ queryKey: groupDetailQueryKey });
            } catch (error) {
              setExpenses(previousExpenses);
              setBalances(previousBalances);
              setExpenseSplits(previousSplits);
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

  function renderLeftActions(progress: any, dragX: any, expenseId: string) {
    const trans = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.swipeActionLeft, {
        backgroundColor: friendDetailTheme.actionSurface,
        opacity: trans,
      }]}>
        <TouchableOpacity
          onPress={() => handleEditExpense(expenseId)}
          style={styles.swipeActionButton}>
          <IconSymbol name="pencil" size={20} color={friendDetailTheme.actionIcon} />
          <ThemedText style={[styles.swipeActionText, { color: friendDetailTheme.actionIcon }]}>Edit</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderRightActions(progress: any, dragX: any, expenseId: string) {
    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.swipeActionRight, {
        backgroundColor: friendDetailTheme.dangerSurface,
        opacity: trans,
      }]}>
        <TouchableOpacity
          onPress={() => handleDeleteExpense(expenseId)}
          style={styles.swipeActionButton}>
          <IconSymbol name="trash" size={20} color={friendDetailTheme.danger} />
          <ThemedText style={[styles.swipeActionText, { color: friendDetailTheme.danger }]}>Delete</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderExpense({ item }: { item: Expense & { paidByUser?: User } }) {
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            expenseSwipeableRefs.current.set(item.id, ref);
          } else {
            expenseSwipeableRefs.current.delete(item.id);
          }
        }}
        renderLeftActions={item.createdBy === currentUserId || item.paidBy === currentUserId
          ? (progress, dragX) => renderLeftActions(progress, dragX, item.id)
          : undefined}
        renderRightActions={(item.createdBy === currentUserId || item.paidBy === currentUserId) ? (progress, dragX) => renderRightActions(progress, dragX, item.id) : undefined}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        overshootFriction={8}
        enableTrackpadTwoFingerGesture
        containerStyle={{ overflow: 'visible' }}>
        <TouchableOpacity
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${item.description}`}
          accessibilityHint="Opens the expense details"
          onPress={() => router.push(`/expense-detail/${item.id}` as any)}
          style={[styles.expenseCard, {
            backgroundColor: friendDetailTheme.surface,
            borderColor: friendDetailTheme.surfaceBorder,
          }]}>
          <View style={[styles.expenseIcon, { backgroundColor: item.paidBy === currentUserId ? friendDetailTheme.positiveSurface : friendDetailTheme.mutedSurface }]}>
            <IconSymbol
              size={18}
              name={item.paidBy === currentUserId ? 'arrow.up.right' : 'dollarsign.circle.fill'}
              color={item.paidBy === currentUserId ? friendDetailTheme.positive : friendDetailTheme.actionIcon}
            />
          </View>
          <View style={styles.expenseInfo}>
            <ThemedText type="defaultSemiBold" style={{ color: colors.text }} numberOfLines={1}>
              {item.description}
            </ThemedText>
            <ThemedText style={[styles.expenseDate, { color: colors.textSecondary }]} numberOfLines={1}>
              {dateStr} • Paid by {item.paidByUser?.name || 'Unknown'}
            </ThemedText>
          </View>
          <ThemedText style={[styles.expenseAmount, { color: colors.text }]}>${item.amount.toFixed(2)}</ThemedText>
          <IconSymbol
            size={17}
            name="chevron.right"
            color={colors.textSecondary}
            style={styles.expenseChevron}
          />
        </TouchableOpacity>
      </Swipeable>
    );
  }

  function handleRemoveMember(member: GroupMember & { user?: User }) {
    if (removingMemberId) return;

    // Don't allow removing yourself or if you're not an admin
    const currentMember = members.find(m => m.userId === currentUserId);
    if (member.userId === currentUserId) {
      Alert.alert('Cannot Remove', 'You cannot remove yourself from the group.');
      return;
    }
    if (currentMember?.role !== 'admin') {
      Alert.alert('Permission Denied', 'Only admins can remove members.');
      return;
    }

    const balance = balances.get(member.userId) || 0;
    if (Math.abs(balance) >= 0.01) {
      Alert.alert(
        'Settle Balance First',
        `${member.user?.name || 'This member'} has an outstanding group balance. Record the settlement before removing them.`,
      );
      return;
    }

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.user?.name || 'this member'} from the group?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingMemberId(member.userId);
              await groupService.removeMember(id, member.userId);

              // Log activity
              if (group && user) {
                await activityService.logMemberRemoved({
                  groupId: id,
                  userId: currentUserId,
                  userName: user.name,
                  memberName: member.user?.name || 'Someone',
                  groupName: group.name,
                });
              }

              loadGroupData();
            } catch (error) {
              console.error('Error removing member:', error);
              Alert.alert('Error', 'Failed to remove member');
            } finally {
              setRemovingMemberId(null);
            }
          },
        },
      ]
    );
  }

  function renderMemberRightActions(progress: any, dragX: any, member: GroupMember & { user?: User }) {
    const currentMember = members.find(m => m.userId === currentUserId);
    const canRemove = currentMember?.role === 'admin' && member.userId !== currentUserId;

    if (!canRemove) return null;

    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.swipeActionRight, {
        backgroundColor: friendDetailTheme.dangerSurface,
        opacity: trans,
      }]}>
        <TouchableOpacity
          onPress={() => handleRemoveMember(member)}
          style={styles.swipeActionButton}>
          <IconSymbol name="trash" size={20} color={friendDetailTheme.danger} />
          <ThemedText style={[styles.swipeActionText, { color: friendDetailTheme.danger }]}>Remove</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderMember({ item }: { item: GroupMember & { user?: User } }) {
    const balance = balances.get(item.userId) || 0;
    const balanceColor = balance > 0
      ? friendDetailTheme.positive
      : balance < 0
        ? friendDetailTheme.negative
        : friendDetailTheme.actionIcon;
    const currentMember = members.find(m => m.userId === currentUserId);
    const canRemove = currentMember?.role === 'admin' && item.userId !== currentUserId;

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            memberSwipeableRefs.current.set(item.userId, ref);
          } else {
            memberSwipeableRefs.current.delete(item.userId);
          }
        }}
        renderRightActions={canRemove ? (progress, dragX) => renderMemberRightActions(progress, dragX, item) : undefined}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        overshootFriction={8}
        enableTrackpadTwoFingerGesture
        containerStyle={{ overflow: 'visible' }}>
        <View style={[styles.memberCard, {
          backgroundColor: friendDetailTheme.surface,
          borderColor: friendDetailTheme.surfaceBorder,
        }]}>
          <View style={[styles.memberAvatar, { backgroundColor: friendDetailTheme.avatarSurface }]}>
            <ThemedText style={[styles.avatarText, { color: friendDetailTheme.actionIcon }]}>
              {item.user?.name.charAt(0).toUpperCase() || '?'}
            </ThemedText>
          </View>
          <View style={styles.memberInfo}>
            <View style={styles.memberNameRow}>
              <ThemedText type="defaultSemiBold" style={!isDark ? { color: colors.text } : undefined} numberOfLines={1}>
                {item.user?.name || 'Unknown'}
              </ThemedText>
              {item.userId !== currentUserId && (
                (() => {
                  const status = friendshipStatus.get(item.userId) || 'none';
                  if (status === 'accepted') return null;

                  const isPending = status === 'pending_sent';
                  const isReceived = status === 'pending_received';

                  return (
                    <TouchableOpacity
                      onPress={() => status === 'none' ? handleAddFriend(item.userId) : null}
                      activeOpacity={status === 'none' ? 0.7 : 1}
                      style={[
                        styles.friendBadge,
                        isPending && styles.friendBadgePending,
                        isReceived && styles.friendBadgeReceived,
                        { backgroundColor: friendDetailTheme.actionSurface }
                      ]}
                    >
                      <IconSymbol
                        name={status === 'none' ? "person.badge.plus" : "clock"}
                        size={12}
                        color={friendDetailTheme.actionIcon}
                      />
                      <ThemedText style={[styles.friendBadgeText, { color: friendDetailTheme.actionIcon }]}>
                        {status === 'none' ? 'Add friend' : isPending ? 'Request sent' : 'Request received'}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })()
              )}
            </View>
            {item.role === 'admin' && (
              <ThemedText style={[styles.roleLabel, { color: friendDetailTheme.actionIcon }]}>Admin</ThemedText>
            )}
          </View>
          <View style={styles.balanceInfo}>
            {balance !== 0 && (
              <>
                <ThemedText style={[styles.memberBalanceAmount, { color: balanceColor }]}>
                  ${Math.abs(balance).toFixed(2)}
                </ThemedText>
                <ThemedText style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
                  {balance > 0 ? 'gets back' : 'owes'}
                </ThemedText>
              </>
            )}
            {balance === 0 && (
              <ThemedText style={[styles.settledLabel, { color: colors.textSecondary }]}>settled</ThemedText>
            )}
          </View>
        </View>
      </Swipeable>
    );
  }

  // Start animations when data loads
  useEffect(() => {
    if (!loading && group) {
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
  }, [fadeAnim, group, loading, scaleAnim, slideAnim]);

  if (loading) {
    return <LoadingState message="Loading group details..." />;
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
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
          <View style={styles.headerSpacer} />
        </View>
        <AsyncErrorState
          message={loadError}
          onRetry={() => loadGroupData()}
          title="Couldn't load group"
        />
      </View>
    );
  }

  if (!group) {
    return null;
  }

  const currentUserBalance = balances.get(currentUserId) || 0;
  const groupIsSettled = areGroupBalancesSettled(balances);
  const balanceColor = currentUserBalance > 0
    ? friendDetailTheme.positive
    : currentUserBalance < 0
      ? friendDetailTheme.negative
      : friendDetailTheme.actionIcon;
  const balanceSurface = currentUserBalance > 0
    ? friendDetailTheme.positiveSurface
    : currentUserBalance < 0
      ? friendDetailTheme.negativeSurface
      : friendDetailTheme.settledSurface;
  const balanceCopy = currentUserBalance > 0 ? 'You are owed' : currentUserBalance < 0 ? 'You owe' : 'All settled up';
  const balanceAccessibilityValue = `${balanceCopy}, $${Math.abs(currentUserBalance).toFixed(2)}`;

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
            onPress={handleDeleteGroup}
            disabled={isDeletingGroup}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${group.name}`}
            accessibilityHint={groupIsSettled ? 'Deletes this group after confirmation' : 'Shows why this group needs settlement before deletion'}
            accessibilityState={{ busy: isDeletingGroup, disabled: isDeletingGroup }}
            hitSlop={MIN_TOUCH_HIT_SLOP}
            testID="delete-group-button"
            style={[styles.headerActionButton, {
              backgroundColor: friendDetailTheme.dangerSurface,
              borderColor: friendDetailTheme.dangerBorder,
              opacity: isDeletingGroup ? 0.5 : 1,
            }]}>
            <IconSymbol size={18} name="trash" color={friendDetailTheme.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* Group Hero */}
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
            accessibilityLabel={`${group.name}, ${members.length} ${members.length === 1 ? 'member' : 'members'}`}
            style={styles.groupIconWrapper}>
            <LinearGradient
              colors={gradients.buttonPrimary}
              style={styles.groupIconGlow}
            />
            <View style={[styles.groupIcon, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]}>
              <View style={[styles.groupIconInner, { backgroundColor: friendDetailTheme.actionSurface }]}>
                <IconSymbol size={26} name="person.3.fill" color={friendDetailTheme.actionIcon} />
              </View>
            </View>
          </View>
          <View style={styles.groupTitleBlock}>
            <ThemedText type="title" style={[styles.groupName, !isDark && { color: colors.text }]} numberOfLines={2}>
              {group.name}
            </ThemedText>
            <ThemedText style={[styles.memberCount, !isDark && { color: colors.textSecondary }]}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </ThemedText>
          </View>
        </Animated.View>

        {/* Balance Card with glassmorphism */}
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
            <View style={styles.balanceContent}>
              {currentUserBalance !== 0 ? (
                <>
                  <View style={styles.balanceHeader}>
                    <View style={[styles.balanceIndicator, { backgroundColor: balanceColor }]} />
                    <ThemedText style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                      {balanceCopy}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                    ${Math.abs(currentUserBalance).toFixed(2)}
                  </ThemedText>
                </>
              ) : (
                <View style={styles.settledContainer}>
                  <View style={styles.settledIconWrapper}>
                    <View style={[styles.settledIcon, { backgroundColor: friendDetailTheme.actionSurface, borderColor: friendDetailTheme.actionBorder }]}>
                      <IconSymbol size={22} name="checkmark" color={friendDetailTheme.actionIcon} />
                    </View>
                  </View>
                  <ThemedText style={[styles.settledText, { color: colors.text }]}>
                    {balanceCopy}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            accessibilityRole="button"
            accessibilityLabel={`Add expense to ${group.name}`}
            accessibilityHint="Opens the add expense screen for this group"
            onPress={() => router.push(`/add-expense?groupId=${id}`)}>
            <LinearGradient
              colors={gradients.buttonPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickActionGradient}>
              <IconSymbol size={18} name="plus.circle.fill" color={friendDetailTheme.onPrimary} />
              <ThemedText style={[styles.quickActionText, { color: friendDetailTheme.onPrimary }]}>Add Expense</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.quickActionButton,
              styles.secondaryQuickActionButton,
              {
                backgroundColor: friendDetailTheme.positiveSurface,
                borderColor: friendDetailTheme.positiveBorder,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Settle up in ${group.name}`}
            accessibilityHint="Opens the group settlement screen"
            onPress={handleSettleUp}>
            <IconSymbol size={18} name="checkmark.circle.fill" color={friendDetailTheme.positive} />
            <ThemedText style={[styles.quickActionText, { color: friendDetailTheme.positive }]}>Settle Up</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.quickActionButton,
              styles.secondaryQuickActionButton,
              {
                backgroundColor: friendDetailTheme.actionSurface,
                borderColor: friendDetailTheme.actionBorder,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`View stats for ${group.name}`}
            accessibilityHint="Opens spending and balance statistics for this group"
            onPress={() => router.push(`/group/stats/${id}`)}>
            <IconSymbol size={18} name="chart.bar.fill" color={friendDetailTheme.actionIcon} />
            <ThemedText style={[styles.quickActionText, { color: friendDetailTheme.actionIcon }]}>Stats</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
              Members
            </ThemedText>
            <TouchableOpacity
              style={[styles.addButton, {
                backgroundColor: friendDetailTheme.actionSurface,
                borderColor: friendDetailTheme.actionBorder,
              }]}
              accessibilityRole="button"
              accessibilityLabel={`Add member to ${group.name}`}
              accessibilityHint="Opens the add member sheet"
              hitSlop={MIN_TOUCH_HIT_SLOP}
              onPress={() => setMemberModalVisible(true)}>
              <IconSymbol size={16} name="plus" color={friendDetailTheme.actionIcon} />
            </TouchableOpacity>
          </View>
          {members.map((member, index) => (
            <Animated.View
              key={member.id}
              style={{
                opacity: fadeAnim,
                transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value((index + 1) * 0.15)) }],
              }}>
              {renderMember({ item: member })}
            </Animated.View>
          ))}
        </View>

        {/* Expenses Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
              Expenses
            </ThemedText>
            <ThemedText style={[styles.expenseCount, !isDark && { color: colors.textSecondary }]}>
              {expenseSearch.trim() ? `${filteredExpenses.length} of ${expenses.length}` : `${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`}
            </ThemedText>
          </View>
          <View style={[styles.searchContainer, {
            backgroundColor: friendDetailTheme.surface,
            borderColor: friendDetailTheme.surfaceBorder,
          }]}>
            <IconSymbol
              name="magnifyingglass"
              size={17}
              color={friendDetailTheme.actionIcon}
            />
            <TextInput
              accessibilityLabel={`Search expenses in ${group.name}`}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setExpenseSearch}
              placeholder="Search expenses or people"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.text }]}
              value={expenseSearch}
            />
            {expenseSearch.length > 0 && (
              <TouchableOpacity
                accessibilityLabel="Clear group expense search"
                hitSlop={8}
                onPress={() => setExpenseSearch('')}
                style={styles.clearSearchButton}>
                <IconSymbol name="xmark.circle.fill" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {expenses.length === 0 ? (
            <View style={styles.emptySection}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: friendDetailTheme.avatarSurface }]}>
                <IconSymbol size={28} name="dollarsign.circle" color={friendDetailTheme.actionIcon} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No expenses yet</ThemedText>
              <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                Add an expense to start splitting costs
              </ThemedText>
            </View>
          ) : filteredExpenses.length === 0 ? (
            <View style={styles.emptySection}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: friendDetailTheme.avatarSurface }]}>
                <IconSymbol size={28} name="magnifyingglass" color={friendDetailTheme.actionIcon} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No matching expenses</ThemedText>
              <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                Try a different description or person
              </ThemedText>
            </View>
          ) : (
            filteredExpenses.map((expense, index) => (
              <Animated.View
                key={expense.id}
                style={{
                  opacity: fadeAnim,
                  transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value((index + 1) * 0.1)) }],
                }}>
                {renderExpense({ item: expense })}
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>

      <AddMemberModal
        visible={memberModalVisible}
        onClose={() => setMemberModalVisible(false)}
        availableUsers={availableUsers}
        selectedUserIds={selectedUserIds}
        setSelectedUserIds={setSelectedUserIds}
        onSubmit={addMember}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
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
  headerSpacer: {
    width: 40,
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
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 84,
  },
  heroSection: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 12,
  },
  groupIconWrapper: {
    position: 'relative',
  },
  groupIconGlow: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 16,
    opacity: 0.25,
    top: -3,
    left: -3,
  },
  groupIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  groupIconInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupTitleBlock: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    fontSize: 22,
    color: '#fff',
    lineHeight: 26,
  },
  memberCount: {
    fontSize: 14,
    opacity: 0.6,
  },
  balanceCardWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  balanceCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  balanceContent: {
    minHeight: 96,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 14,
    opacity: 0.8,
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
  },
  memberBalanceAmount: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  settledContainer: {
    alignItems: 'center',
  },
  settledIconWrapper: {
    marginBottom: 8,
  },
  settledIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settledText: {
    fontSize: 16,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  secondaryQuickActionButton: {
    minHeight: 44,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  quickActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 10,
    gap: 6,
  },
  quickActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 18,
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
    color: '#fff',
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseCount: {
    fontSize: 13,
    opacity: 0.6,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(20, 35, 38, 0.4)',
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  friendBadgePending: {
    opacity: 0.7,
  },
  friendBadgeReceived: {
    opacity: 0.7,
  },
  friendBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  settledLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  expenseIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDate: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchButton: {
    padding: 2,
  },
  expenseChevron: {
    marginLeft: 8,
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
  },
  swipeActionLeft: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: 80,
    borderRadius: 12,
    marginBottom: 6,
  },
  swipeActionRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 80,
    borderRadius: 12,
    marginBottom: 6,
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
