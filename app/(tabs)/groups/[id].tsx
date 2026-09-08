import { AddMemberModal, GroupSettlementOperationActivity, MemberBilateralLines } from '@/components/groups';
import { SettlementDeleteDialogs } from '@/components/settlements/settlement-delete-dialogs';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GroupDetailSkeleton } from '@/components/ui/skeleton';
import { ThemedIconButton } from '@/components/ui/themed-icon-button';
import { useAuth } from '@/contexts/auth-context-otp';
import { useDebouncedQueryInvalidation } from '@/hooks/use-debounced-query-invalidation';
import { useSettlementDeleteFlow } from '@/hooks/use-settlement-delete-flow';
import { useRealtime } from '@/hooks/use-realtime';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { createGroupDetailTraceId, logGroupDetailDiagnostic } from '@/lib/group-detail-diagnostics';
import { areGroupBalancesSettled } from '@/services/group-balance';
import { groupDetailMutationController } from '@/services/group-detail-mutation-controller';
import type { GroupExpenseView } from '@/services/group-detail-read-model';
import { groupDetailService } from '@/services/group-detail-service';
import {
  buildGroupSettlementOperationActivity,
  canDeleteGroupOperation,
  getGroupOperationParticipants,
  getGroupSettlementDeleteRequest,
} from '@/services/group-settlement-operation-view';
import { createReactQueryCacheAdapter } from '@/services/query-cache-adapter';
import { queryKeys } from '@/services/query-keys';
import type { Expense, GroupMember, Settlement, SettlementCancellation, SettlementScopeTransfer, User } from '@/types/database';
import { formatCurrency, getPreferredCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { groupPairTotalsService, toGroupScopedLine } from '@/services/group-pair-totals-service';
import { getViewerPairBalance } from '@/utils/group-member-balance';
import { getFirstName } from '@/utils/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CATEGORY_MAP: Record<string, { icon: any, lightBg: string, darkBg: string, lightColor: string, darkColor: string }> = {
  'Food': { icon: 'fork.knife', lightBg: '#FCE7F3', darkBg: 'rgba(236, 72, 153, 0.15)', lightColor: '#BE185D', darkColor: '#F472B6' },
  'Transport': { icon: 'car.fill', lightBg: '#DCFCE7', darkBg: 'rgba(34, 197, 94, 0.15)', lightColor: '#15803D', darkColor: '#4ADE80' },
  'Travel': { icon: 'airplane', lightBg: '#E0E7FF', darkBg: 'rgba(99, 102, 241, 0.15)', lightColor: '#4338CA', darkColor: '#818CF8' },
  'Groceries': { icon: 'cart.fill', lightBg: '#FEF3C7', darkBg: 'rgba(245, 158, 11, 0.15)', lightColor: '#B45309', darkColor: '#FCD34D' },
  'Utilities': { icon: 'bolt.fill', lightBg: '#DBEAFE', darkBg: 'rgba(59, 130, 246, 0.15)', lightColor: '#1D4ED8', darkColor: '#60A5FA' },
};

const MIN_TOUCH_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };
const EMPTY_EXPENSES: GroupExpenseView[] = [];
const EMPTY_SETTLEMENTS: Settlement[] = [];
const EMPTY_SCOPE_TRANSFERS: SettlementScopeTransfer[] = [];
const EMPTY_CANCELLATIONS: SettlementCancellation[] = [];

function GroupDetailSwipeAction({
  translation,
  side,
  backgroundColor,
  iconColor,
  icon,
  label,
  onPress,
}: {
  translation: SharedValue<number>;
  side: 'left' | 'right';
  backgroundColor: string;
  iconColor: string;
  icon: 'pencil' | 'trash';
  label: string;
  onPress: () => void;
}) {
  const actionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (side === 'left' ? translation.get() : -translation.get()) / 80)),
  }));

  return (
    <Reanimated.View style={[side === 'left' ? styles.swipeActionLeft : styles.swipeActionRight, { backgroundColor }, actionStyle]}>
      <TouchableOpacity onPress={onPress} style={styles.swipeActionButton}>
        <IconSymbol name={icon} size={20} color={iconColor} />
        <ThemedText style={[styles.swipeActionText, { color: iconColor }]}>{label}</ThemedText>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

type SectionTab = 'all' | 'expenses' | 'balances';

export default function GroupDetailScreen() {
  const { friends: friendsTheme, colors, friendDetail: friendDetailTheme, settle, isDark } = useThemeColors();
  const { id, groupDetailTraceId } = useLocalSearchParams<{
    id: string;
    groupDetailTraceId?: string;
  }>();
  const [fallbackTraceId] = useState(createGroupDetailTraceId);
  const traceId = groupDetailTraceId || fallbackTraceId;
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [sectionTab, setSectionTab] = useState<SectionTab>('all');

  const expenseSwipeableRefs = useRef<Map<string, SwipeableMethods>>(new Map());
  const memberSwipeableRefs = useRef<Map<string, SwipeableMethods>>(new Map());
  const operationSwipeableRefs = useRef<Map<string, SwipeableMethods>>(new Map());

  // Scroll-driven collapsing header
  const [scrollY] = useState(() => new Animated.Value(0));
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const toggleMemberExpanded = useCallback((memberUserId: string) => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedMemberId(current => (current === memberUserId ? null : memberUserId));
  }, []);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);
  const groupDetailQueryKey = useMemo(() => queryKeys.groups.detail(currentUserId, id), [currentUserId, id]);
  const invalidateGroupDetail = useDebouncedQueryInvalidation(groupDetailQueryKey, 500);
  const queryCache = useMemo(() => createReactQueryCacheAdapter(queryClient), [queryClient]);

  const cardStyle = useMemo(
    () => (isDark ? {
      backgroundColor: '#000000',
      borderWidth: 0,
      borderColor: 'rgba(255, 255, 255, 0.08)',
      shadowColor: '#64748b',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    } : {
      backgroundColor: '#ffffff',
      borderWidth: 0,
      shadowColor: '#475569',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.09,
      shadowRadius: 0,
      elevation: 4,
    }),
    [isDark]
  );

  const tabItems = useMemo(() => [
    { type: 'tab' as const, id: 'all' as SectionTab, label: 'All', icon: 'person.3.fill' as const },
    { type: 'tab' as const, id: 'expenses' as SectionTab, label: 'Expenses', icon: 'dollarsign.circle.fill' as const },
    { type: 'tab' as const, id: 'balances' as SectionTab, label: 'Balances', icon: 'list.bullet' as const },
    { type: 'action' as const, id: 'stats', label: 'Stats', icon: 'chart.bar.fill' as const, onPress: () => router.push(`/groups/stats/${id}` as any) },
  ], [id]);

  const {
    data: groupDetail,
    error,
    isFetching,
    isLoading,
    isStale,
    refetch,
  } = useQuery({
    queryKey: groupDetailQueryKey,
    enabled: !!currentUserId && !!id,
    staleTime: 0,
    queryFn: () => groupDetailService.getDetail(currentUserId, id, traceId),
  });
  const group = groupDetail?.group ?? null;
  const expenses = groupDetail?.expenses ?? EMPTY_EXPENSES;
  const settlements = groupDetail?.settlements ?? EMPTY_SETTLEMENTS;
  const members = groupDetail?.members ?? [];
  const balances = groupDetail?.balances ?? new Map<string, number>();
  const unsettledCount = useMemo(() => {
    const mems = groupDetail?.members ?? [];
    const bals = groupDetail?.balances;
    return mems.filter(m => Math.abs(bals?.get(m.userId) || 0) >= 0.01).length;
  }, [groupDetail?.members, groupDetail?.balances]);
  const settledBadgeText = useMemo(() => {
    if (unsettledCount === 0) return 'All settled';
    if (unsettledCount === 1) return 'All settled except 1';
    return `All settled except ${unsettledCount}`;
  }, [unsettledCount]);
  const scopeTransfers = groupDetail?.scopeTransfers ?? EMPTY_SCOPE_TRANSFERS;
  const cancellations = groupDetail?.cancellations ?? EMPTY_CANCELLATIONS;
  const settlementOperations = groupDetail?.settlementOperations;
  const expenseSplits = useMemo(() => expenses.flatMap(expense => expense.splits), [expenses]);
  const availableUsers = groupDetail?.availableUsers ?? [];
  const friendshipStatus = groupDetail?.friendshipStatus ?? new Map();
  // Combined (direct + group) pair totals for the Balances tab: the full
  // bilateral truth per pair, including settled-with-flows pairs.
  const pairTotalsQueryKey = useMemo(() => queryKeys.groups.pairTotals(currentUserId, id), [currentUserId, id]);
  const {
    data: pairTotals = [],
    refetch: refetchPairTotals,
    isFetching: isFetchingPairTotals,
    isStale: isPairTotalsStale,
  } = useQuery({
    queryKey: pairTotalsQueryKey,
    enabled: !!currentUserId && !!id,
    queryFn: () => groupPairTotalsService.getByGroup(id),
  });
  const linesForMember = useCallback((memberUserId: string) => pairTotals
    .filter(total => total.fromUserId === memberUserId || total.toUserId === memberUserId)
    // Group scope only: member rows must show the group component, never
    // the combined net that folds direct-ledger debt into the group.
    .map(total => ({ ...toGroupScopedLine(total) }))
    .sort((x, y) =>
      x.fromUserId.localeCompare(y.fromUserId)
      || x.toUserId.localeCompare(y.toUserId)
      || x.currency.localeCompare(y.currency),
    ), [pairTotals]);
  const namesById = useMemo(
    () => new Map((groupDetail?.members ?? []).map(member => [member.userId, member.user?.name ?? 'Unknown'] as const)),
    [groupDetail],
  );
  const isRefreshingCachedMissingGroup = groupDetail === null && isFetching;
  const loading = (isLoading || isRefreshingCachedMissingGroup) && !group;
  const loadError = error ? getFetchErrorMessage(error) : null;
  const filteredExpenses = useMemo(() => {
    const search = expenseSearch.trim().toLocaleLowerCase();
    if (!search) return expenses;

    return expenses.filter(expense => (
      expense.description.toLocaleLowerCase().includes(search) ||
      expense.paidByUser?.name.toLocaleLowerCase().includes(search)
    ));
  }, [expenseSearch, expenses]);
  const timelineItems = useMemo(() => {
    // ADR-0001: one activity per settlement operation affecting this group.
    // Group-local cash and adjustments merge into a single entry; legacy
    // payments without an operation ID keep their existing presentation.
    // Receipt cancellations merge as cleared-balance details; cash stays
    // counted once (group-local cash only).
    const { operations, legacySettlements } = buildGroupSettlementOperationActivity({
      settlements,
      scopeTransfers,
      cancellations,
      operations: settlementOperations,
      groupId: id,
      currentUserId,
    });
    return [
      ...filteredExpenses.map(expense => ({ type: 'expense' as const, date: expense.date, expense })),
      ...operations.map(operation => ({ type: 'group_operation' as const, date: operation.originalDate, operation })),
      ...legacySettlements.map(settlement => ({ type: 'settlement' as const, date: settlement.date, settlement })),
    ].sort((a, b) => b.date - a.date);
  }, [cancellations, filteredExpenses, settlements, scopeTransfers, settlementOperations, id, currentUserId]);
  const expenseItems = useMemo(
    () => filteredExpenses.map(expense => ({ type: 'expense' as const, date: expense.date, expense })),
    [filteredExpenses],
  );
  const displayItems = sectionTab === 'all' ? timelineItems : expenseItems;
  const avatarTextColor = colors.tint;

  // Ticket 04 (ADR-0001): whole-operation Delete through the shared
  // confirmation/results flow. Copy, authorized detail loading, pending,
  // reused/stale/failure, and invalidation outcomes live in the hook; the
  // mutation boundary stays settlementModule.reverse.
  const settlementDeleteFlow = useSettlementDeleteFlow({ currentUserId, groupId: id, queryClient, refetch });
  const loadGroupData = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useRefetchOnFocus({
    enabled: !!currentUserId && !!id,
    isFetching,
    isStale,
    refetch,
  });

  useRefetchOnFocus({
    enabled: !!currentUserId && !!id,
    isFetching: isFetchingPairTotals,
    isStale: isPairTotalsStale,
    refetch: refetchPairTotals,
  });

  useEffect(() => {
    logGroupDetailDiagnostic('route', {
      traceId,
      groupId: id,
      currentUserId,
      hasNavigationTrace: !!groupDetailTraceId,
    });
  }, [currentUserId, groupDetailTraceId, id, traceId]);

  // ADR-0001 + ticket 04: whole-operation Delete from Group detail through the
  // shared confirmation/results flow. Either participant may delete; the shared
  // confirmation warns that linked adjustments outside this group are undone
  // too. Participant-only confirmation amounts load through the authorized
  // Friend read inside the flow — never from the group-local view — and every
  // Delete entry point for the operation stays disabled while pending.
  const handleDeleteGroupOperation = useCallback((operationId: string) => {
    const request = getGroupSettlementDeleteRequest({
      operationId,
      settlements,
      scopeTransfers,
      cancellations,
      operations: settlementOperations,
      groupId: id,
      currentUserId,
      namesById,
    });
    if (request) void settlementDeleteFlow.requestDelete(request);
  }, [cancellations, currentUserId, id, namesById, settlementDeleteFlow, settlementOperations, scopeTransfers, settlements]);

  useEffect(() => {
    if (groupDetail === null && !isFetching && !error) {
      Alert.alert('Error', 'Group not found');
      router.back();
    }
  }, [error, groupDetail, isFetching]);

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
  useRealtime({
    table: 'settlement_cancellations',
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
      if (!group || !user) throw new Error('Group context is unavailable');
      await groupDetailMutationController.addMembers({
        groupId: id,
        groupName: group.name,
        currentUser: { id: currentUserId, name: user.name },
        memberIds: selectedUserIds,
        users: availableUsers,
        groupDetailKey: groupDetailQueryKey,
        cache: queryCache,
      });

      setSelectedUserIds([]);
      setMemberModalVisible(false);
    } catch (error) {
      console.error('Error adding member:', error);
      Alert.alert('Error', 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  }

  async function handleAddFriend(memberUserId: string) {
    try {
      await groupDetailMutationController.sendFriendRequest({
        currentUserId,
        friendId: memberUserId,
        groupDetailKey: groupDetailQueryKey,
        cache: queryCache,
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

  function handleSettleLine(line: { fromUserId: string; toUserId: string }) {
    // Combined lines span direct + group ledgers: settle on the friend page,
    // which owns the combined flow (group settle only covers group scope).
    const otherId = line.fromUserId === currentUserId ? line.toUserId : line.fromUserId;
    router.push(`/friend-settle/${otherId}` as any);
  }

  function handleDeleteGroup() {
    if (isDeletingGroup || !group) return;

    if (!groupDetailMutationController.canDeleteGroup(balances)) {
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
              const result = await groupDetailMutationController.deleteGroup({
                groupId: id,
                currentUserId,
                balances,
                groupDetailKey: groupDetailQueryKey,
                groupListKey: queryKeys.groups.list(currentUserId),
                cache: queryCache,
              });
              if (result.status === 'blocked') {
                Alert.alert(
                  'Settle Group First',
                  'This group still has outstanding balances. Settle all expenses before deleting it.',
                );
                return;
              }
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
            try {
              setDeletingExpenseId(expenseId);
              expenseSwipeableRefs.current.get(expenseId)?.close();

              const deletedExpenseSplits = expenseToDelete
                ? expenseSplits.filter(split => split.expenseId === expenseId)
                : [];
              await groupDetailMutationController.deleteExpense({
                expenseId,
                expense: expenseToDelete,
                splits: deletedExpenseSplits,
                currentUser: { id: currentUserId, name: user?.name || 'Unknown' },
                groupName: group?.name,
                groupDetailKey: groupDetailQueryKey,
                friendsHomeKey: friendsHomeQueryKey,
                cache: queryCache,
              });
            } catch (error) {
              console.error('Error deleting expense:', error);
              Alert.alert('Error', 'Failed to delete expense');
            } finally {
              setDeletingExpenseId(null);
            }
          },
        },
      ]
    );
  }

  function renderLeftActions(_progress: SharedValue<number>, translation: SharedValue<number>, expenseId: string) {
    return (
      <GroupDetailSwipeAction
        translation={translation}
        side="left"
        backgroundColor={friendDetailTheme.actionSurface}
        iconColor={friendDetailTheme.actionIcon}
        icon="pencil"
        label="Edit"
        onPress={() => handleEditExpense(expenseId)}
      />
    );
  }

  function renderRightActions(_progress: SharedValue<number>, translation: SharedValue<number>, expenseId: string) {
    return (
      <GroupDetailSwipeAction
        translation={translation}
        side="right"
        backgroundColor={friendDetailTheme.dangerSurface}
        iconColor={friendDetailTheme.danger}
        icon="trash"
        label="Delete"
        onPress={() => handleDeleteExpense(expenseId)}
      />
    );
  }

  function renderExpense({ item }: { item: Expense & { paidByUser?: User } }) {
    const dateStr = formatDate(item.date);
    const categoryStyle = (item.category && CATEGORY_MAP[item.category])
      ? CATEGORY_MAP[item.category]
      : { icon: 'arrow.up.right', lightBg: '#F3F4F6', darkBg: 'rgba(156, 163, 175, 0.15)', lightColor: '#4B5563', darkColor: '#9CA3AF' };
    const paidByYou = item.paidBy === currentUserId;

    return (
      <ReanimatedSwipeable
        ref={(ref) => {
          if (ref) {
            expenseSwipeableRefs.current.set(item.id, ref);
          } else {
            expenseSwipeableRefs.current.delete(item.id);
          }
        }}
        renderLeftActions={item.createdBy === currentUserId || item.paidBy === currentUserId
          ? (progress, translation) => renderLeftActions(progress, translation, item.id)
          : undefined}
        renderRightActions={(item.createdBy === currentUserId || item.paidBy === currentUserId) ? (progress, translation) => renderRightActions(progress, translation, item.id) : undefined}
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
            backgroundColor: colors.card,
            borderWidth: 0,
            borderColor: colors.border,
            shadowColor: isDark ? '#64748b' : '#475569',
            shadowOffset: { width: 0, height: isDark ? 4 : 2 },
            shadowOpacity: isDark ? 0.15 : 0.09,
            shadowRadius: isDark ? 4 : 0,
            elevation: 4,
          }]}>
          <View style={[styles.expenseIcon, {
            backgroundColor: isDark ? categoryStyle.darkBg : categoryStyle.lightBg,
            borderRadius: 20,
            width: 40,
            height: 40,
          }]}>
            <IconSymbol
              size={18}
              name={categoryStyle.icon}
              color={isDark ? categoryStyle.darkColor : categoryStyle.lightColor}
            />
          </View>
          <View style={styles.expenseInfo}>
            <ThemedText type="subtitle" style={[styles.expenseDescription, { color: isDark ? '#F8FAFC' : colors.text }]} numberOfLines={1}>
              {item.description}
            </ThemedText>
            <ThemedText style={[styles.expenseDate, { color: isDark ? '#94A3B8' : colors.textSecondary }]} numberOfLines={2}>
              {paidByYou ? 'Paid by you' : `Paid by ${getFirstName(item.paidByUser?.name || 'Someone')}`}{'\n'}{dateStr}
            </ThemedText>
          </View>
          <View style={styles.amountBlock}>
            <ThemedText type="title" style={[styles.expenseAmount, { color: isDark ? '#F8FAFC' : colors.text }]}>
              {formatCurrency(item.amount, item.currency)}
            </ThemedText>
            <View style={[styles.badge, { backgroundColor: paidByYou ? friendDetailTheme.positiveSurface : friendDetailTheme.settledSurface }]}>
              <ThemedText style={[styles.badgeText, { color: paidByYou ? friendDetailTheme.positive : (isDark ? '#94A3B8' : colors.textSecondary) }]}>
                {paidByYou ? 'You paid' : 'Split'}
              </ThemedText>
            </View>
          </View>
        </TouchableOpacity>
      </ReanimatedSwipeable>
    );
  }

  function renderSettlement({ item }: { item: Settlement }) {
    const fromUserName = members.find(member => member.userId === item.fromUserId)?.user?.name || 'Someone';
    const toUserName = members.find(member => member.userId === item.toUserId)?.user?.name || 'Someone';
    const fromUser = getFirstName(fromUserName);
    const toUser = getFirstName(toUserName);
    const dateStr = formatDate(item.date);

    return (
      <View style={[styles.transferRow, cardStyle]}>
        <View style={[styles.expenseIcon, { backgroundColor: friendDetailTheme.positiveSurface }]}>
          <IconSymbol size={20} name="checkmark.circle.fill" color={friendDetailTheme.positive} />
        </View>
        <View style={styles.transferCopy}>
          <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>Settlement</ThemedText>
          <ThemedText style={{ color: colors.textSecondary }}>{fromUser} paid {toUser}{'\n'}{dateStr}</ThemedText>
        </View>
        <ThemedText type="defaultSemiBold" style={{ color: isDark ? '#6EE7B7' : '#047857' }}>
          {formatCurrency(item.amount, item.currency)}
        </ThemedText>
      </View>
    );
  }

  function renderGroupOperation(projection: import('@/services/settlement-operation-projection').SettlementOperationProjection) {
    const participants = getGroupOperationParticipants(projection, id);
    const payerName = members.find(member => member.userId === participants?.fromUserId)?.user?.name || 'Someone';
    const payeeName = members.find(member => member.userId === participants?.toUserId)?.user?.name || 'Someone';
    return (
      <GroupSettlementOperationActivity
        projection={projection}
        groupId={id}
        currentUserId={currentUserId}
        payerName={payerName}
        payeeName={payeeName}
        colors={colors as unknown as Record<string, string>}
        friendDetailTheme={friendDetailTheme as unknown as Record<string, string>}
        isDark={isDark}
        formatDate={formatDate}
        canDelete={canDeleteGroupOperation(projection, id, currentUserId) && !settlementDeleteFlow.isDeletedLocally(projection.operationId)}
        isDeleting={settlementDeleteFlow.isDeletePending(projection.operationId)}
        isDeletedOverride={settlementDeleteFlow.isDeletedLocally(projection.operationId)}
        onDelete={() => handleDeleteGroupOperation(projection.operationId)}
        swipeableRefs={operationSwipeableRefs}
      />
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
              if (!group || !user) throw new Error('Group context is unavailable');
              await groupDetailMutationController.removeMember({
                groupId: id,
                groupName: group.name,
                currentUser: { id: currentUserId, name: user.name },
                member,
                groupDetailKey: groupDetailQueryKey,
                cache: queryCache,
              });
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

  function renderMemberRightActions(_progress: SharedValue<number>, translation: SharedValue<number>, member: GroupMember & { user?: User }) {
    const currentMember = members.find(m => m.userId === currentUserId);
    const canRemove = currentMember?.role === 'admin' && member.userId !== currentUserId;

    if (!canRemove) return null;

    return (
      <GroupDetailSwipeAction
        translation={translation}
        side="right"
        backgroundColor={friendDetailTheme.dangerSurface}
        iconColor={friendDetailTheme.danger}
        icon="trash"
        label="Remove"
        onPress={() => handleRemoveMember(member)}
      />
    );
  }

  function renderMember(
    { item }: { item: GroupMember & { user?: User } },
    opts?: { chevron?: { expanded: boolean; onToggle: () => void } },
  ) {
    if (opts?.chevron) {
      const isCurrent = item.userId === currentUserId;
      const isAdmin = item.role === 'admin';
      const roleBadgeText =
        isCurrent && isAdmin
          ? 'You • Admin'
          : isCurrent
            ? 'You'
            : isAdmin
              ? 'Admin'
              : null;

      const memberBalance = balances.get(item.userId) || 0;
      let totalBalanceDisplay = `${formatCurrency(0)}`;
      let totalBalanceColor = isDark ? '#94A3B8' : '#64748B';
      let totalBalanceLabel = 'settled up';

      if (memberBalance > 0.005) {
        totalBalanceDisplay = `+${formatCurrency(memberBalance)}`;
        totalBalanceColor = isDark ? '#10B981' : '#047857';
        totalBalanceLabel = 'gets back total';
      } else if (memberBalance < -0.005) {
        totalBalanceDisplay = `-${formatCurrency(Math.abs(memberBalance))}`;
        totalBalanceColor = isDark ? '#F87171' : '#DC2626';
        totalBalanceLabel = 'owes total';
      }

      return (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={opts.chevron.onToggle}
          style={[
            styles.balanceMemberCard,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
              shadowColor: isDark ? '#000000' : '#64748B',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.2 : 0.06,
              shadowRadius: 6,
              elevation: 2,
            },
          ]}>
          {/* Avatar Circle */}
          <View
            style={[
              styles.balanceMemberAvatar,
              {
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#E6F9F0',
              },
            ]}>
            <Text
              style={[
                styles.balanceAvatarText,
                { color: isDark ? '#10B981' : '#047857' },
              ]}>
              {item.user?.name.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>

          {/* Member Info */}
          <View style={styles.balanceMemberInfo}>
            <View style={styles.balanceMemberNameRow}>
              <ThemedText
                type="defaultSemiBold"
                style={[
                  styles.balanceMemberName,
                  { color: isDark ? '#F8FAFC' : colors.text },
                ]}
                numberOfLines={1}>
                {item.user?.name || 'Unknown'}
              </ThemedText>
              {roleBadgeText && (
                <View
                  style={[
                    styles.balanceRoleBadge,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.08)'
                        : '#E5E7EB',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.balanceRoleBadgeText,
                      { color: isDark ? '#94A3B8' : '#4B5563' },
                    ]}>
                    {roleBadgeText}
                  </Text>
                </View>
              )}
            </View>
            <ThemedText
              style={[
                styles.balanceMemberSubtitle,
                { color: isDark ? '#94A3B8' : colors.textSecondary },
              ]}>
              {isCurrent ? 'Personal breakdown' : 'Member breakdown'}
            </ThemedText>
          </View>

          {/* Balance Total & Label */}
          <View style={styles.balanceAmountCol}>
            <ThemedText
              style={[
                styles.balanceTotalAmount,
                { color: totalBalanceColor },
              ]}>
              {totalBalanceDisplay}
            </ThemedText>
            <ThemedText
              style={[
                styles.balanceTotalLabel,
                { color: isDark ? '#94A3B8' : colors.textSecondary },
              ]}>
              {totalBalanceLabel}
            </ThemedText>
          </View>

          {/* Chevron Button */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              opts.chevron.expanded ? 'Collapse pair debts' : 'Expand pair debts'
            }
            accessibilityState={{ expanded: opts.chevron.expanded }}
            hitSlop={MIN_TOUCH_HIT_SLOP}
            onPress={opts.chevron.onToggle}
            style={[
              styles.balanceChevronButton,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : '#F1F5F9',
                borderColor: isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : '#E2E8F0',
              },
            ]}>
            <IconSymbol
              size={16}
              name={opts.chevron.expanded ? 'chevron.up' : 'chevron.down'}
              color={isDark ? '#94A3B8' : '#64748B'}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    const isViewerRelative = sectionTab === 'all';
    const viewerPairBalance = item.userId === currentUserId ? null : getViewerPairBalance({
      pairTotals,
      memberUserId: item.userId,
      viewerUserId: currentUserId,
      preferredCurrency: getPreferredCurrency(),
    });
    const balance = isViewerRelative
      ? viewerPairBalance?.signedAmount ?? 0
      : balances.get(item.userId) || 0;
    const hasViewerPair = isViewerRelative && item.userId !== currentUserId && viewerPairBalance !== null;
    const pairTotalsLoading = isViewerRelative && isFetchingPairTotals && pairTotals.length === 0;
    const balanceColor = isViewerRelative
      ? balance > 0
        ? friendDetailTheme.negative
        : balance < 0
          ? friendDetailTheme.positive
          : friendDetailTheme.actionIcon
      : balance > 0
        ? friendDetailTheme.positive
        : balance < 0
          ? friendDetailTheme.negative
          : friendDetailTheme.actionIcon;
    const currentMember = members.find(m => m.userId === currentUserId);
    const canRemove = currentMember?.role === 'admin' && item.userId !== currentUserId;

    return (
      <ReanimatedSwipeable
        ref={(ref) => {
          if (ref) {
            memberSwipeableRefs.current.set(item.userId, ref);
          } else {
            memberSwipeableRefs.current.delete(item.userId);
          }
        }}
        renderRightActions={canRemove ? (progress, translation) => renderMemberRightActions(progress, translation, item) : undefined}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        overshootFriction={8}
        enableTrackpadTwoFingerGesture
        containerStyle={{ overflow: 'visible' }}>
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={() => {
            if (item.userId === currentUserId) return;
            router.push({
              pathname: '/friends/[id]',
              params: { id: item.userId, returnTo: `/groups/${id}` },
            } as any);
          }}
          style={[styles.memberCard, {
            backgroundColor: colors.card,
            borderWidth: 0,
            borderColor: colors.border,
            shadowColor: isDark ? '#64748b' : '#475569',
            shadowOffset: { width: 0, height: isDark ? 4 : 2 },
            shadowOpacity: isDark ? 0.15 : 0.09,
            shadowRadius: isDark ? 4 : 0,
            elevation: 4,
          }]}>
          <View style={[styles.memberAvatar, {
            backgroundColor: isDark ? '#064e3b' : friendsTheme.avatarSurface,
            borderRadius: 12,
            width: 40,
            height: 40,
          }]}>
            <ThemedText type="title" style={[styles.avatarText, { color: isDark ? '#10b981' : avatarTextColor }]}>
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
            {isViewerRelative && item.userId === currentUserId && (
              <ThemedText style={[styles.settledLabel, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>You</ThemedText>
            )}
            {(!isViewerRelative || hasViewerPair) && balance !== 0 && (
              <>
                <ThemedText type='subtitle' style={[styles.memberBalanceAmount, { color: balanceColor }]}>
                  {formatCurrency(Math.abs(balance), viewerPairBalance?.currency)}
                </ThemedText>
                <ThemedText style={[styles.balanceLabel, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                  {isViewerRelative ? (balance > 0 ? 'You owe' : 'Owes you') : (balance > 0 ? 'gets back' : 'owes')}
                </ThemedText>
              </>
            )}
            {isViewerRelative && item.userId !== currentUserId && !hasViewerPair && pairTotalsLoading && (
              <ThemedText style={[styles.settledLabel, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>Checking balance…</ThemedText>
            )}
            {isViewerRelative && item.userId !== currentUserId && !hasViewerPair && !pairTotalsLoading && (
              <ThemedText style={[styles.settledLabel, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>No balance</ThemedText>
            )}
            {((!isViewerRelative && balance === 0) || (isViewerRelative && item.userId !== currentUserId && hasViewerPair && balance === 0)) && (
              <ThemedText style={[styles.settledLabel, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>settled</ThemedText>
            )}
          </View>
        </TouchableOpacity>
      </ReanimatedSwipeable>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedIconButton
            name="chevron.left"
            onPress={() => router.back()}
            size={20}
            shape="circle"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
            style={{
              backgroundColor: friendDetailTheme.actionSurface,
              borderColor: friendDetailTheme.actionBorder,
            }}
          />
        </View>
        <GroupDetailSkeleton />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedIconButton
            name="chevron.left"
            onPress={() => router.back()}
            size={20}
            shape="circle"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
            style={{
              backgroundColor: friendDetailTheme.actionSurface,
              borderColor: friendDetailTheme.actionBorder,
            }}
          />
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
  const balanceCopy = currentUserBalance > 0 ? 'You are owed' : currentUserBalance < 0 ? 'You owe' : 'Settled up in this group';
  const balanceAccessibilityValue = `${balanceCopy}, ${formatCurrency(Math.abs(currentUserBalance))}`;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#050914' : colors.background }]}>

      {/* Header */}
      <View style={styles.header}>
        <ThemedIconButton
          name="chevron.left"
          onPress={() => router.back()}
          size={20}
          shape="circle"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          style={{
            backgroundColor: friendDetailTheme.actionSurface,
            borderColor: friendDetailTheme.actionBorder,
          }}
        />

        {/* Floating Header Title (Group Name) */}
        <View style={styles.headerTitleContainer} pointerEvents="none">
          <ThemedText style={[styles.headerTitle, { color: isDark ? '#F8FAFC' : colors.text }]} numberOfLines={1}>
            {group.name}
          </ThemedText>
        </View>

        <View style={styles.headerActions}>
          <ThemedIconButton
            name="trash.fill"
            onPress={handleDeleteGroup}
            disabled={isDeletingGroup}
            loading={isDeletingGroup}
            size={18}
            shape="square"
            variant="danger"
            accessibilityLabel={`Delete ${group.name}`}
            accessibilityHint={groupIsSettled ? 'Deletes this group after confirmation' : 'Shows why this group needs settlement before deletion'}
            testID="delete-group-button"
            style={{
              backgroundColor: friendDetailTheme.dangerSurface,
              borderColor: friendDetailTheme.dangerBorder,
            }}
          />
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
        <View style={styles.summarySection}>
          <LinearGradient
            colors={
              isDark
                ? ['#000000', '#000000']
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
              shadowColor: isDark ? '#64748b' : '#475569',
              shadowOffset: { width: 0, height: isDark ? 4 : 8 },
              shadowOpacity: isDark ? 0.15 : 0.12,
              shadowRadius: isDark ? 4 : 18,
              elevation: isDark ? 4 : 8,
              alignItems: 'center',
              paddingVertical: 24,
              paddingHorizontal: 16,
              borderRadius: 24,
            }]}>
            <ThemedText type='defaultSemiBold' style={[styles.summaryCardTitle, { color: isDark ? (currentUserBalance < 0 ? '#ffb3b0' : currentUserBalance > 0 ? '#45dfa4' : '#94A3B8') : balanceColor }]}>
              {currentUserBalance > 0
                ? 'YOU ARE OWED'
                : currentUserBalance < 0
                  ? 'YOU OWE'
                  : 'SETTLED UP IN THIS GROUP'}
            </ThemedText>

            <ThemedText type='subtitle' style={[styles.summaryCardAmount, { color: isDark ? (currentUserBalance < 0 ? '#ffb3b0' : currentUserBalance > 0 ? '#4edea3' : '#94A3B8') : balanceColor }]}>
              {currentUserBalance < 0 ? '-' : currentUserBalance > 0 ? '+' : ''}{formatCurrency(Math.abs(currentUserBalance))}
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
        </View>

        {/* Tab / Action Tiles */}
        <View style={styles.tabTilesRow}>
          {tabItems.map(item => {
            const isTab = item.type === 'tab';
            const isSelected = isTab && sectionTab === item.id;

            return (
              <TouchableOpacity
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: isSelected }}
                activeOpacity={0.78}
                onPress={() => {
                  if (item.type === 'tab') {
                    setSectionTab(item.id);
                  } else {
                    item.onPress();
                  }
                }}
                style={[styles.tabTile, { backgroundColor: isSelected ? settle.pillBackground : colors.cardGlass }]}>
                <IconSymbol
                  size={18}
                  name={item.icon}
                  color={colors.text}
                />
                <ThemedText
                  type='subtitle'
                  style={[styles.tabTileLabel]}>
                  {item.label}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
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
            {members.map(member => (
              <View key={member.id}>
                {renderMember({ item: member })}
              </View>
            ))}
          </View>
        )}

        {/* Balances Section (Splitwise-style bilateral breakdown) */}
        {(sectionTab === 'balances') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>
                Member Balances
              </ThemedText>
              <View
                style={[
                  styles.settledBadge,
                  {
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#E6F9F0',
                    borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                  },
                ]}>
                <Text
                  style={[
                    styles.settledBadgeText,
                    { color: isDark ? '#10B981' : '#047857' },
                  ]}>
                  {settledBadgeText}
                </Text>
              </View>
            </View>
            {members.map(member => {
              const expanded = expandedMemberId === member.userId;
              const memberLines = linesForMember(member.userId);
              return (
                <View key={member.id} style={styles.balancesMemberContainer}>
                  {renderMember({ item: member }, {
                    chevron: {
                      expanded,
                      onToggle: () => toggleMemberExpanded(member.userId),
                    },
                  })}
                  {expanded && (
                    <View style={styles.expandedLines}>
                      <MemberBilateralLines
                        lines={memberLines}
                        namesById={namesById}
                        currentUserId={currentUserId}
                        memberUserId={member.userId}
                        members={members}
                        onSettle={handleSettleLine}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Expenses Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>
              {sectionTab === 'all' ? 'Activity' : 'Expenses'}
            </ThemedText>
            <ThemedText style={[styles.expenseCount, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
              {sectionTab === 'all'
                ? `${timelineItems.length} ${timelineItems.length === 1 ? 'item' : 'items'}`
                : expenseSearch.trim() ? `${filteredExpenses.length} of ${expenses.length}` : `${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`}
            </ThemedText>
          </View>
          {sectionTab === 'expenses' && <View style={[styles.searchContainer, {
            backgroundColor: colors.card,
            borderColor: colors.border,
          }]}
          >
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
          </View>}
          {(sectionTab === 'all' ? timelineItems.length === 0 : expenses.length === 0) ? (
            <View style={styles.emptySection}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: friendDetailTheme.avatarSurface }]}>
                <IconSymbol size={28} name="dollarsign.circle" color={friendDetailTheme.actionIcon} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: isDark ? '#F8FAFC' : colors.text }]}>No expenses yet</ThemedText>
              <ThemedText style={[styles.emptyText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
                Add an expense to start splitting costs
              </ThemedText>
            </View>
          ) : sectionTab === 'expenses' && filteredExpenses.length === 0 ? (
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
            displayItems.map(item => (
              <View key={item.type === 'expense' ? item.expense.id : item.type === 'group_operation' ? item.operation.operationId : item.settlement.id}>
                {item.type === 'expense'
                  ? renderExpense({ item: item.expense })
                  : item.type === 'group_operation'
                    ? renderGroupOperation(item.operation)
                    : renderSettlement({ item: item.settlement })}
              </View>
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
        submitting={isAddingMember}
      />

      <SettlementDeleteDialogs flow={settlementDeleteFlow} />

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
    flex: 1,
    marginVertical: 18,
  },
  tabTile: {
    flexDirection: 'row',
    height: 36,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 0,
    elevation: 4,
    borderColor: 'transparent',
    paddingHorizontal: 16,
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
    fontSize: 16,
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
  expandButton: {
    padding: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedLines: {
    marginBottom: 8,
  },
  balancesMemberContainer: {
    marginBottom: 8,
  },
  balanceMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  balanceMemberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  balanceAvatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  balanceMemberInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  balanceMemberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceMemberName: {
    fontSize: 16,
    fontWeight: '700',
  },
  balanceRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  balanceRoleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  balanceMemberSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  balanceAmountCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginRight: 10,
  },
  balanceTotalAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  balanceTotalLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  balanceChevronButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settledBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  settledBadgeText: {
    fontSize: 12,
    fontWeight: '600',
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
  },
  transferCopy: {
    flex: 1,
    gap: 2,
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
