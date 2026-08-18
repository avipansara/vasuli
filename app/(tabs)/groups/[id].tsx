import { AddMemberModal } from '@/components/group';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GroupDetailSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useDebouncedQueryInvalidation } from '@/hooks/use-debounced-query-invalidation';
import { useRealtime } from '@/hooks/use-realtime';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { CombinedSettlementError } from '@/services/combined-settlement-errors';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import { friendshipService } from '@/services/friendship-service';
import { areGroupBalancesSettled } from '@/services/group-balance';
import type { GroupDetailReadModel, GroupExpenseView } from '@/services/group-detail-read-model';
import { removeExpenseFromGroupReadModel, removeExpenseFromHomeFriends } from '@/services/group-detail-read-model';
import { groupDetailService } from '@/services/group-detail-service';
import { groupService } from '@/services/group-service';
import { friendDetailModule } from '@/services/friend-detail-module';
import { settlementService } from '@/services/settlement-service';
import {
  createExpenseDeletedNotification,
  createMemberAddedNotification,
  notificationService,
} from '@/services/notification-service';
import type { QueryCacheSnapshot } from '@/services/query-cache-adapter';
import { createReactQueryCacheAdapter } from '@/services/query-cache-adapter';
import { queryKeys } from '@/services/query-keys';
import { userService } from '@/services/user-service';
import type { Expense, GroupMember, User } from '@/types/database';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Swipeable from 'react-native-gesture-handler/Swipeable';

const CATEGORY_MAP: Record<string, { icon: any, lightBg: string, darkBg: string, lightColor: string, darkColor: string }> = {
  'Food': { icon: 'fork.knife', lightBg: '#FCE7F3', darkBg: 'rgba(236, 72, 153, 0.15)', lightColor: '#BE185D', darkColor: '#F472B6' },
  'Transport': { icon: 'car.fill', lightBg: '#DCFCE7', darkBg: 'rgba(34, 197, 94, 0.15)', lightColor: '#15803D', darkColor: '#4ADE80' },
  'Travel': { icon: 'airplane', lightBg: '#E0E7FF', darkBg: 'rgba(99, 102, 241, 0.15)', lightColor: '#4338CA', darkColor: '#818CF8' },
  'Groceries': { icon: 'cart.fill', lightBg: '#FEF3C7', darkBg: 'rgba(245, 158, 11, 0.15)', lightColor: '#B45309', darkColor: '#FCD34D' },
  'Utilities': { icon: 'bolt.fill', lightBg: '#DBEAFE', darkBg: 'rgba(59, 130, 246, 0.15)', lightColor: '#1D4ED8', darkColor: '#60A5FA' },
};

const MIN_TOUCH_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };
const EMPTY_EXPENSES: GroupExpenseView[] = [];

type SectionTab = 'all' | 'expenses';

const SECTION_TABS: { id: SectionTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expenses', label: 'Expenses' },
];

export default function GroupDetailScreen() {
  const { gradients, colors, friendDetail: friendDetailTheme, isDark } = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [sectionTab, setSectionTab] = useState<SectionTab>('all');

  const expenseSwipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const memberSwipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  // Scroll-driven collapsing header
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

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));
  const [scaleAnim] = useState(() => new Animated.Value(0.95));
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);
  const groupDetailQueryKey = useMemo(() => queryKeys.groups.detail(currentUserId, id), [currentUserId, id]);
  const invalidateGroupDetail = useDebouncedQueryInvalidation(groupDetailQueryKey, 500);
  const queryCache = useMemo(() => createReactQueryCacheAdapter(queryClient), [queryClient]);

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
  const group = groupDetail?.group ?? null;
  const expenses = groupDetail?.expenses ?? EMPTY_EXPENSES;
  const members = groupDetail?.members ?? [];
  const balances = groupDetail?.balances ?? new Map<string, number>();
  const scopeTransfers = groupDetail?.scopeTransfers ?? [];
  const expenseSplits = useMemo(() => expenses.flatMap(expense => expense.splits), [expenses]);
  const availableUsers = groupDetail?.availableUsers ?? [];
  const friendshipStatus = groupDetail?.friendshipStatus ?? new Map();
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

  const loadGroupData = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleReverseTransfer = useCallback((transfer: NonNullable<GroupDetailReadModel['scopeTransfers']>[number]) => {
    if (transfer.isReversal || (transfer.fromUserId !== currentUserId && transfer.toUserId !== currentUserId)) return;

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
              const otherUserId = transfer.fromUserId === currentUserId ? transfer.toUserId : transfer.fromUserId;
              const friendDetail = await friendDetailModule.getDetail(currentUserId, otherUserId);
              const expectedBalance = friendDetail?.relationship.totalsByCurrency.find(total => total.currency === transfer.currency)?.amount;
              if (expectedBalance === undefined) throw new Error('Refresh the Friend details and try again.');
              await settlementService.reverse(transfer.operationId, expectedBalance);
              await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey })]);
              Alert.alert('Settlement reversed', 'The affected balances were restored.');
            } catch (error) {
              Alert.alert(
                error instanceof CombinedSettlementError ? 'Unable to reverse' : 'Settlement reversal failed',
                error instanceof Error ? error.message : 'The settlement could not be reversed.',
              );
            }
          },
        },
      ],
    );
  }, [currentUserId, friendsHomeQueryKey, queryClient, refetch]);

  useEffect(() => {
    if (groupDetail === null) {
      Alert.alert('Error', 'Group not found');
      router.back();
    }
  }, [groupDetail]);

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
  useRealtime({
    table: 'settlement_scope_transfers',
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

      queryClient.setQueryData<GroupDetailReadModel | null>(groupDetailQueryKey, current => {
        if (!current) return null;
        const friendshipStatus = new Map(current.friendshipStatus);
        friendshipStatus.set(memberUserId, 'pending_sent');
        return { ...current, friendshipStatus };
      });

      Alert.alert('Success', 'Friend request sent');
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request');
    }
  }

  function handleSettleUp() {
    router.push(`/groups/settle/${id}`);
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
      `Delete "${group.name}"? The group will be hidden for everyone, but its expenses and payment history will be preserved.`,
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
              await groupService.delete(id, currentUserId);
              await queryClient.invalidateQueries({
                queryKey: queryKeys.groups.list(currentUserId),
                refetchType: 'all',
              });
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
            let cacheSnapshot: QueryCacheSnapshot | undefined;
            try {
              setDeletingExpenseId(expenseId);
              expenseSwipeableRefs.current.get(expenseId)?.close();

              const deletedExpenseSplits = expenseToDelete
                ? expenseSplits.filter(split => split.expenseId === expenseId)
                : [];
              const currentUserSplit = deletedExpenseSplits.find(split => split.userId === currentUserId);
              cacheSnapshot = await queryCache.capture([
                groupDetailQueryKey,
                ...(currentUserSplit ? [friendsHomeQueryKey] : []),
              ]);

              queryClient.setQueryData<GroupDetailReadModel | null>(groupDetailQueryKey, current => current
                ? removeExpenseFromGroupReadModel(current, expenseId)
                : null);

              if (currentUserSplit && expenseToDelete) {
                queryClient.setQueryData<(User & { balance: number; recentExpenses?: Expense[] })[]>(
                  friendsHomeQueryKey,
                  current => removeExpenseFromHomeFriends(current, expenseToDelete, deletedExpenseSplits, currentUserId)
                );
              }

              await expenseService.delete(expenseId, currentUserId, user?.name || 'Unknown');
              if (expenseToDelete) {
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
                    expenseToDelete.id,
                    expenseToDelete.description,
                    expenseToDelete.amount,
                    user?.name || 'Someone',
                    group?.name,
                    id
                  );
                  await notificationService.sendNotificationToUsers(pushTokens, notification);
                }
              }
              queryClient.invalidateQueries({ queryKey: groupDetailQueryKey });
            } catch (error) {
              if (cacheSnapshot) {
                await queryCache.restore(cacheSnapshot);
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
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const categoryStyle = (item.category && CATEGORY_MAP[item.category])
      ? CATEGORY_MAP[item.category]
      : { icon: 'arrow.up.right', lightBg: '#F3F4F6', darkBg: 'rgba(156, 163, 175, 0.15)', lightColor: '#4B5563', darkColor: '#9CA3AF' };
    const paidByYou = item.paidBy === currentUserId;

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
            backgroundColor: isDark ? '#0d1321' : '#ffffff',
            borderWidth: 0,
            shadowColor: isDark ? '#000000' : '#475569',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.4 : 0.06,
            shadowRadius: 12,
            elevation: 4,
          }]}>
          <View style={[styles.expenseIcon, {
            backgroundColor: isDark ? categoryStyle.darkBg : categoryStyle.lightBg,
            borderRadius: 24,
            width: 48,
            height: 48,
          }]}>
            <IconSymbol
              size={20}
              name={categoryStyle.icon}
              color={isDark ? categoryStyle.darkColor : categoryStyle.lightColor}
            />
          </View>
          <View style={styles.expenseInfo}>
            <ThemedText type="subtitle" style={[styles.expenseDescription, { color: isDark ? '#F8FAFC' : colors.text }]} numberOfLines={1}>
              {item.description}
            </ThemedText>
            <ThemedText style={[styles.expenseDate, { color: isDark ? '#94A3B8' : colors.textSecondary }]} numberOfLines={2}>
              {paidByYou ? 'Paid by you' : `Paid by ${item.paidByUser?.name.split(' ')[0] || 'Someone'}`}{'\n'}{dateStr}
            </ThemedText>
          </View>
          <View style={styles.amountBlock}>
            <ThemedText type="title" style={[styles.expenseAmount, { color: isDark ? '#F8FAFC' : colors.text }]}>
              ${item.amount.toFixed(2)}
            </ThemedText>
            <View style={[styles.badge, { backgroundColor: paidByYou ? friendDetailTheme.positiveSurface : friendDetailTheme.settledSurface }]}>
              <ThemedText style={[styles.badgeText, { color: paidByYou ? friendDetailTheme.positive : (isDark ? '#94A3B8' : colors.textSecondary) }]}>
                {paidByYou ? 'You paid' : 'Split'}
              </ThemedText>
            </View>
          </View>
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
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={() => item.userId !== currentUserId && router.push(`/friends/${item.userId}` as any)}
          style={[styles.memberCard, {
            backgroundColor: isDark ? '#0d1321' : '#ffffff',
            borderWidth: 0,
            shadowColor: isDark ? '#000000' : '#475569',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.4 : 0.06,
            shadowRadius: 12,
            elevation: 4,
          }]}>
          <View style={[styles.memberAvatar, {
            backgroundColor: isDark ? '#1e293b' : 'rgba(15, 76, 58, 0.1)',
            borderRadius: 24,
            width: 48,
            height: 48,
          }]}>
            <ThemedText style={[styles.avatarText, { color: isDark ? '#10b981' : '#0F4C3A' }]}>
              {item.user?.name.charAt(0).toUpperCase() || '?'}
            </ThemedText>
          </View>
          <View style={styles.memberInfo}>
            <View style={styles.memberNameRow}>
              <ThemedText type="subtitle" style={{ color: isDark ? '#F8FAFC' : colors.text }} numberOfLines={1}>
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
              <ThemedText type='defaultSemiBold' style={[styles.roleLabel, { color: isDark ? '#94A3B8' : colors.text }]}>Admin</ThemedText>
            )}
          </View>
          <View style={styles.balanceInfo}>
            {balance !== 0 && (
              <>
                <ThemedText type='subtitle' style={[styles.memberBalanceAmount, { color: balanceColor }]}>
                  ${Math.abs(balance).toFixed(2)}
                </ThemedText>
                <ThemedText style={[styles.balanceLabel, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                  {balance > 0 ? 'gets back' : 'owes'}
                </ThemedText>
              </>
            )}
            {balance === 0 && (
              <ThemedText style={[styles.settledLabel, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>settled</ThemedText>
            )}
          </View>
        </TouchableOpacity>
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
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        </View>
        <GroupDetailSkeleton />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
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

  if (groupDetail === null) {
    return (
      <View style={styles.container}>
        <AsyncErrorState
          message="This group could not be found."
          onRetry={() => loadGroupData()}
          title="Group not found"
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

        {/* Floating Header Title (Group Name) */}
        <View style={styles.headerTitleContainer} pointerEvents="none">
          <Animated.View style={{
            opacity: headerTitleOpacity,
            transform: [{ translateY: headerTitleTranslateY }],
          }}>
            <ThemedText style={[styles.headerTitle, { color: isDark ? '#F8FAFC' : colors.text }]} numberOfLines={1}>
              {group.name}
            </ThemedText>
          </Animated.View>
        </View>

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

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}>

        {/* Summary Card */}
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
                isDark
                  ? ['rgba(13, 19, 33, 0.8)', 'rgba(13, 19, 33, 0.6)']
                  : currentUserBalance < 0
                    ? ['#FFF2F4', '#FFFFFF']
                    : currentUserBalance > 0
                      ? ['#F0FDF4', '#FFFFFF']
                      : ['#F9FAFB', '#FFFFFF']
              }
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`${group.name}, ${members.length} members, ${balanceAccessibilityValue}`}
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
              
              <ThemedText type='title' style={[styles.summaryCardGroupName, { color: isDark ? '#F8FAFC' : colors.text }]}>
                {group.name}
              </ThemedText>

              <ThemedText type='defaultSemiBold' style={[styles.summaryCardTitle, { color: isDark ? (currentUserBalance < 0 ? '#ffb3b0' : currentUserBalance > 0 ? '#45dfa4' : '#94A3B8') : balanceColor }]}>
                {currentUserBalance > 0 
                  ? 'YOU ARE OWED' 
                  : currentUserBalance < 0 
                    ? 'YOU OWE' 
                    : 'ALL SETTLED UP'}
              </ThemedText>
              
              <ThemedText type='subtitle' style={[styles.summaryCardAmount, { color: isDark ? (currentUserBalance < 0 ? '#ffb3b0' : currentUserBalance > 0 ? '#4edea3' : '#94A3B8') : balanceColor }]}>
                {currentUserBalance < 0 ? '-' : currentUserBalance > 0 ? '+' : ''}${Math.abs(currentUserBalance).toFixed(2)}
              </ThemedText>

              <ThemedText style={[styles.summaryCardSubtitle, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                Across {members.length} members
              </ThemedText>

              {!groupIsSettled && currentUserBalance !== 0 && (
                <View style={styles.cardQuickActions}>
                  <TouchableOpacity
                    style={[styles.cardQuickActionButton, {
                      backgroundColor: isDark ? '#10b981' : '#043424',
                    }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Settle up in ${group.name}`}
                    accessibilityHint="Opens the settlement form"
                    onPress={handleSettleUp}>
                    <IconSymbol size={18} name="banknote" color="#ffffff" />
                    <ThemedText style={[styles.cardQuickActionText, { color: '#ffffff' }]}>Settle Up</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        </Animated.View>

        {/* Tab / Action Tiles */}
        <View style={styles.tabTilesRow}>
          <TouchableOpacity 
            style={[
              styles.tabTile, 
              sectionTab === 'all' && [styles.tabTileActive, { borderColor: isDark ? '#10b981' : '#0F4C3A', borderWidth: 1 }], 
              { backgroundColor: isDark ? '#0d1321' : '#ffffff' }
            ]}
            onPress={() => setSectionTab('all')}>
            <IconSymbol size={20} name="person.3.fill" color={sectionTab === 'all' ? (isDark ? '#10b981' : '#0F4C3A') : (isDark ? '#94A3B8' : colors.textSecondary)} />
            <ThemedText style={[styles.tabTileLabel, { color: sectionTab === 'all' ? (isDark ? '#10b981' : '#0F4C3A') : (isDark ? '#94A3B8' : colors.textSecondary), fontWeight: sectionTab === 'all' ? '700' : '500' }]}>
              All
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.tabTile, 
              sectionTab === 'expenses' && [styles.tabTileActive, { borderColor: isDark ? '#10b981' : '#0F4C3A', borderWidth: 1 }], 
              { backgroundColor: isDark ? '#0d1321' : '#ffffff' }
            ]}
            onPress={() => setSectionTab('expenses')}>
            <IconSymbol size={20} name="dollarsign.circle.fill" color={sectionTab === 'expenses' ? (isDark ? '#10b981' : '#0F4C3A') : (isDark ? '#94A3B8' : colors.textSecondary)} />
            <ThemedText style={[styles.tabTileLabel, { color: sectionTab === 'expenses' ? (isDark ? '#10b981' : '#0F4C3A') : (isDark ? '#94A3B8' : colors.textSecondary), fontWeight: sectionTab === 'expenses' ? '700' : '500' }]}>
              Expenses
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.tabTile, 
              { backgroundColor: isDark ? '#0d1321' : '#ffffff' }
            ]}
            onPress={() => router.push(`/groups/stats/${id}`)}>
            <IconSymbol size={20} name="chart.bar.fill" color={isDark ? '#94A3B8' : colors.textSecondary} />
            <ThemedText style={[styles.tabTileLabel, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
              Stats
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Members Section */}
        {(sectionTab === 'all') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>
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
        )}

        {/* Expenses Section */}
        {scopeTransfers.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>Balance changes</ThemedText>
              <ThemedText style={[styles.expenseCount, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>{scopeTransfers.length}</ThemedText>
            </View>
            {scopeTransfers.map(transfer => {
              const movedToFriendship = transfer.fromUserId === currentUserId;
              return (
                <View key={transfer.id} style={[styles.transferRow, { backgroundColor: friendDetailTheme.surface, borderColor: friendDetailTheme.surfaceBorder }]}>
                  <IconSymbol name="arrow.left.arrow.right" size={17} color={friendDetailTheme.actionIcon} />
                  <View style={styles.transferCopy}>
                    <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>{transfer.isReversal ? 'Reversed balance offset' : movedToFriendship ? 'Moved to friendship balance' : 'Moved from friendship balance'}</ThemedText>
                    <ThemedText style={{ color: colors.textSecondary }}>{transfer.currency} {Math.abs(transfer.signedGroupBalanceDelta).toFixed(2)}</ThemedText>
                  </View>
                  {!transfer.isReversal && (transfer.fromUserId === currentUserId || transfer.toUserId === currentUserId) ? (
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reverse settlement" hitSlop={8} onPress={() => handleReverseTransfer(transfer)}>
                      <ThemedText style={{ color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 12, fontWeight: '700' }}>Reverse</ThemedText>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {/* Expenses Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>
              Expenses
            </ThemedText>
            <ThemedText style={[styles.expenseCount, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
              {expenseSearch.trim() ? `${filteredExpenses.length} of ${expenses.length}` : `${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`}
            </ThemedText>
          </View>
          <View style={[styles.searchContainer, {
            backgroundColor: isDark ? '#0d1321' : friendDetailTheme.surface,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : friendDetailTheme.surfaceBorder,
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
              placeholderTextColor={isDark ? '#94A3B8' : colors.textSecondary}
              style={[styles.searchInput, { color: isDark ? '#F8FAFC' : colors.text }]}
              value={expenseSearch}
            />
            {expenseSearch.length > 0 && (
              <TouchableOpacity
                accessibilityLabel="Clear group expense search"
                hitSlop={8}
                onPress={() => setExpenseSearch('')}
                style={styles.clearSearchButton}>
                <IconSymbol name="xmark.circle.fill" size={18} color={isDark ? '#94A3B8' : colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {expenses.length === 0 ? (
            <View style={styles.emptySection}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: friendDetailTheme.avatarSurface }]}>
                <IconSymbol size={28} name="dollarsign.circle" color={friendDetailTheme.actionIcon} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>No expenses yet</ThemedText>
              <ThemedText style={[styles.emptyText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                Add an expense to start splitting costs
              </ThemedText>
            </View>
          ) : filteredExpenses.length === 0 ? (
            <View style={styles.emptySection}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: friendDetailTheme.avatarSurface }]}>
                <IconSymbol size={28} name="magnifyingglass" color={friendDetailTheme.actionIcon} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>No matching expenses</ThemedText>
              <ThemedText style={[styles.emptyText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
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
      </Animated.ScrollView>

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
    fontSize: 13,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
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
  summaryCardGroupName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
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
  tabTilesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginVertical: 18,
  },
  tabTile: {
    flex: 1,
    height: 72,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabTileActive: {
    elevation: 3,
    shadowOpacity: 0.08,
  },
  tabTileLabel: {
    fontSize: 12,
  },
  amountBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 16,
    marginVertical: 18,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  transferCopy: {
    flex: 1,
    gap: 2,
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
  expenseDate: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  expenseDescription: {
    flexShrink: 1,
    fontSize: 16,
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
