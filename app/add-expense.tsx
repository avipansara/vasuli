import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import { groupService } from '@/services/group-service';
import { userService } from '@/services/user-service';
import type { FriendDetailData } from '@/services/friend-detail-service';
import { calculateGroupBalances } from '@/services/group-balance';
import type { GroupDetailData } from '@/services/group-detail-service';
import { createExpenseNotification, notificationService } from '@/services/notification-service';
import { queryKeys } from '@/services/query-keys';
import type { Expense, User } from '@/types/database';
import { filterFriendsForExpenseSearch } from '@/utils/friend-search';
import { getGroupExpenseParticipant } from '@/utils/group-expense-participants';
import { normalizeCurrencyInput } from '@/utils/validation';
import { getEvenSplitValues, getSplitProgress } from '@/utils/split-validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

enum SplitType {
  GROUP = 'group',
  FRIENDS = 'friends',
}

enum SplitMethod {
  EQUAL = 'equal',
  UNEQUAL = 'unequal',
  PERCENTAGE = 'percentage',
  SHARES = 'shares',
}

const SPLIT_METHODS = [
  { id: SplitMethod.EQUAL, label: 'Equal', icon: 'divide.circle' as const, description: 'Split evenly' },
  { id: SplitMethod.UNEQUAL, label: 'Unequal', icon: 'plusminus' as const, description: 'Enter amounts' },
  { id: SplitMethod.PERCENTAGE, label: 'Percentage', icon: 'percent' as const, description: 'By percent' },
  { id: SplitMethod.SHARES, label: 'Shares', icon: 'chart.pie' as const, description: 'By shares' },
];

type HomeFriend = User & { balance: number; recentExpenses?: Expense[] };

export default function AddExpenseScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const { groupId: preselectedGroupId, friendId: preselectedFriendId } = useLocalSearchParams<{ groupId?: string; friendId?: string }>();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expenseStep, setExpenseStep] = useState<1 | 2>(preselectedGroupId || preselectedFriendId ? 2 : 1);
  const [splitType, setSplitType] = useState<SplitType>(preselectedFriendId ? SplitType.FRIENDS : (preselectedGroupId ? SplitType.GROUP : SplitType.GROUP));
  const [selectedGroupId, setSelectedGroupId] = useState(preselectedGroupId || '');
  const groupsQuery = useQuery({
    queryKey: queryKeys.expenses.formGroups(currentUserId),
    enabled: !!currentUserId,
    queryFn: () => groupService.getUserGroups(currentUserId),
  });
  const friendsQuery = useQuery({
    queryKey: queryKeys.expenses.formFriends(currentUserId),
    enabled: !!currentUserId,
    queryFn: () => userService.getUserFriends(currentUserId),
  });
  const groupMembersQuery = useQuery({
    queryKey: queryKeys.expenses.formMembers(selectedGroupId),
    enabled: !!selectedGroupId,
    queryFn: async () => {
      const members = await groupService.getMembers(selectedGroupId);
      const memberIds = members.map(member => member.userId);
      const memberUsers = await userService.getByIds(memberIds);
      return { memberIds, memberUsers };
    },
  });
  const groups = groupsQuery.data ?? [];
  const friends = useMemo(() => friendsQuery.data ?? [], [friendsQuery.data]);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>(preselectedFriendId ? [preselectedFriendId] : []);
  const [loading, setLoading] = useState(false);
  const dataLoading = groupsQuery.isLoading || friendsQuery.isLoading;
  const dataLoadError = groupsQuery.error || friendsQuery.error;
  const groupMemberIds = groupMembersQuery.data?.memberIds;
  const groupMembers = useMemo(() => groupMemberIds ?? [], [groupMemberIds]);
  const groupMemberUsers = groupMembersQuery.data?.memberUsers ?? [];
  const groupMembersLoadError = groupMembersQuery.error;
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(SplitMethod.EQUAL);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [customPercentages, setCustomPercentages] = useState<Record<string, string>>({});
  const [customShares, setCustomShares] = useState<Record<string, string>>({});

  const activeUserIds = useMemo(
    () => splitType === SplitType.GROUP ? groupMembers : [currentUserId, ...selectedFriendIds],
    [currentUserId, groupMembers, selectedFriendIds, splitType]
  );
  const activeValues = splitMethod === SplitMethod.UNEQUAL
    ? customAmounts
    : splitMethod === SplitMethod.PERCENTAGE
      ? customPercentages
      : customShares;
  const splitProgress = useMemo(
    () => getSplitProgress(activeUserIds, parseFloat(amount) || 0, splitMethod, activeValues),
    [activeUserIds, amount, splitMethod, activeValues]
  );

  const setEvenSplit = () => {
    const values = getEvenSplitValues(activeUserIds, splitMethod, parseFloat(amount) || 0);
    if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(values);
    else if (splitMethod === SplitMethod.SHARES) setCustomShares(values);
    else setCustomAmounts(values);
  };

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  // Input refs for focus management
  const amountInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  const visibleFriends = useMemo(() => {
    if (preselectedFriendId) {
      return friends.filter(friend => friend.id === preselectedFriendId);
    }

    return filterFriendsForExpenseSearch(friends, friendSearchQuery);
  }, [friends, friendSearchQuery, preselectedFriendId]);

  const displayedFriends = useMemo(() => {
    const maxVisibleFriends = friendSearchQuery.trim() ? 40 : 20;
    if (preselectedFriendId) return visibleFriends;

    const selected = visibleFriends.filter(friend => selectedFriendIds.includes(friend.id));
    const remaining = visibleFriends.filter(friend => !selectedFriendIds.includes(friend.id));
    return [...selected, ...remaining].slice(0, maxVisibleFriends);
  }, [friendSearchQuery, preselectedFriendId, selectedFriendIds, visibleFriends]);

  useEffect(() => {
    if (dataLoading) return;
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
    ]).start();
  }, [dataLoading, fadeAnim, slideAnim]);

  const loadData = useCallback(async () => {
    await Promise.all([groupsQuery.refetch(), friendsQuery.refetch()]);
  }, [friendsQuery, groupsQuery]);

  const loadGroupMembersForSelection = useCallback(async () => {
    await groupMembersQuery.refetch();
  }, [groupMembersQuery]);

  const toggleFriend = (friendId: string) => {
    if (selectedFriendIds.includes(friendId)) {
      setSelectedFriendIds(selectedFriendIds.filter(id => id !== friendId));
    } else {
      setSelectedFriendIds([...selectedFriendIds, friendId]);
    }
  };

  const isValid = description.trim() && amount.trim() && parseFloat(amount) > 0 &&
    (splitType === SplitType.GROUP ? selectedGroupId : selectedFriendIds.length > 0);
  const canContinue = splitType === SplitType.GROUP ? !!selectedGroupId : selectedFriendIds.length > 0;
  const canSubmit = !!isValid && (splitMethod === SplitMethod.EQUAL || splitProgress.isBalanced);
  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const selectedFriendNames = selectedFriendIds
    .map(friendId => friends.find(friend => friend.id === friendId)?.name)
    .filter((name): name is string => !!name);
  const formattedExpenseDate = expenseDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleHeaderBack = () => {
    if (expenseStep === 2 && !preselectedGroupId && !preselectedFriendId) {
      setExpenseStep(1);
      return;
    }
    router.back();
  };

  const handleHeaderAction = () => {
    if (expenseStep === 1) {
      if (canContinue) setExpenseStep(2);
      return;
    }
    void handleSubmit();
  };

  const updateHomeFriendsForCreatedExpense = useCallback((
    expense: Expense,
    splits: { userId: string; amount: number }[]
  ) => {
    queryClient.setQueryData<HomeFriend[]>(
      friendsHomeQueryKey,
      current => current?.map(friend => {
        const currentUserSplit = splits.find(split => split.userId === currentUserId);
        const friendSplit = splits.find(split => split.userId === friend.id);

        if (!currentUserSplit || !friendSplit) return friend;

        let balanceDelta = 0;
        if (expense.paidBy === currentUserId) {
          balanceDelta = friendSplit.amount;
        } else if (expense.paidBy === friend.id) {
          balanceDelta = -currentUserSplit.amount;
        }

        if (balanceDelta === 0) return friend;

        const nextBalance = friend.balance + balanceDelta;
        const recentExpense = {
          ...expense,
          amount: Math.abs(balanceDelta),
        };

        return {
          ...friend,
          balance: Math.abs(nextBalance) < 0.01 ? 0 : nextBalance,
          recentExpenses: [recentExpense, ...(friend.recentExpenses ?? [])]
            .filter((item, index, all) => all.findIndex(exp => exp.id === item.id) === index)
            .slice(0, 2),
        };
      })
    );
  }, [currentUserId, friendsHomeQueryKey, queryClient]);

  const replaceOptimisticHomeExpense = useCallback((optimisticId: string, savedExpense: Expense) => {
    queryClient.setQueryData<HomeFriend[]>(
      friendsHomeQueryKey,
      current => current?.map(friend => ({
        ...friend,
        recentExpenses: friend.recentExpenses?.map(expense => (
          expense.id === optimisticId
            ? { ...savedExpense, amount: expense.amount }
            : expense
        )),
      }))
    );
  }, [friendsHomeQueryKey, queryClient]);

  const buildCachedSplits = useCallback((
    expenseId: string,
    splits: { userId: string; amount: number; splitType: 'equal' | 'exact' | 'percentage' }[]
  ) => splits.map((split, index) => ({
    id: `optimistic-split:${expenseId}:${index}`,
    expenseId,
    userId: split.userId,
    amount: split.amount,
    splitType: split.splitType,
  })), []);

  const updateFriendDetailsForCreatedExpense = useCallback((
    expense: Expense,
    splits: { userId: string; amount: number }[],
    friendIds: string[]
  ) => {
    const currentUserSplit = splits.find(split => split.userId === currentUserId);
    if (!currentUserSplit) return;

    for (const friendId of friendIds) {
      const friendSplit = splits.find(split => split.userId === friendId);
      const friend = friends.find(item => item.id === friendId);
      if (!friendSplit || !friend) continue;

      const balanceDelta = expense.paidBy === currentUserId
        ? friendSplit.amount
        : -currentUserSplit.amount;
      const expenseWithSplit = {
        ...expense,
        yourShare: currentUserSplit.amount,
        friendShare: friendSplit.amount,
        paidByName: expense.paidBy === currentUserId ? 'You' : friend.name,
      };

      queryClient.setQueryData<FriendDetailData | null>(
        queryKeys.friends.detail(currentUserId, friendId),
        current => current ? {
          ...current,
          friend: {
            ...current.friend,
            balance: Math.abs(current.friend.balance + balanceDelta) < 0.01 ? 0 : current.friend.balance + balanceDelta,
          },
          expenses: [
            expenseWithSplit,
            ...current.expenses.filter(item => item.id !== expense.id),
          ],
        } : current
      );
    }
  }, [currentUserId, friends, queryClient]);

  const replaceOptimisticFriendDetailExpense = useCallback((
    optimisticId: string,
    savedExpense: Expense,
    friendIds: string[]
  ) => {
    for (const friendId of friendIds) {
      queryClient.setQueryData<FriendDetailData | null>(
        queryKeys.friends.detail(currentUserId, friendId),
        current => current ? {
          ...current,
          expenses: current.expenses.map(expense => (
            expense.id === optimisticId
              ? { ...expense, ...savedExpense }
              : expense
          )),
        } : current
      );
    }
  }, [currentUserId, queryClient]);

  const updateGroupDetailForCreatedExpense = useCallback((
    groupId: string,
    expense: Expense,
    splits: { userId: string; amount: number; splitType: 'equal' | 'exact' | 'percentage' }[]
  ) => {
    const cachedSplits = buildCachedSplits(expense.id, splits);

    queryClient.setQueryData<GroupDetailData | null>(
      queryKeys.groups.detail(currentUserId, groupId),
      current => {
        if (!current) return current;

        const nextExpenses = [
          { ...expense, paidByUser: user || undefined },
          ...current.expenses.filter(item => item.id !== expense.id),
        ];
        const nextSplits = [
          ...cachedSplits,
          ...current.splits.filter(split => split.expenseId !== expense.id),
        ];

        return {
          ...current,
          expenses: nextExpenses,
          splits: nextSplits,
          balances: calculateGroupBalances(nextExpenses, nextSplits, current.settlements),
        };
      }
    );
  }, [buildCachedSplits, currentUserId, queryClient, user]);

  const replaceOptimisticGroupDetailExpense = useCallback((
    groupId: string,
    optimisticId: string,
    savedExpense: Expense,
    splits: { userId: string; amount: number; splitType: 'equal' | 'exact' | 'percentage' }[]
  ) => {
    const cachedSplits = buildCachedSplits(savedExpense.id, splits);

    queryClient.setQueryData<GroupDetailData | null>(
      queryKeys.groups.detail(currentUserId, groupId),
      current => {
        if (!current) return current;

        const nextExpenses = current.expenses.map(expense => (
          expense.id === optimisticId
            ? { ...expense, ...savedExpense }
            : expense
        ));
        const nextSplits = [
          ...cachedSplits,
          ...current.splits.filter(split => split.expenseId !== optimisticId && split.expenseId !== savedExpense.id),
        ];

        return {
          ...current,
          expenses: nextExpenses,
          splits: nextSplits,
          balances: calculateGroupBalances(nextExpenses, nextSplits, current.settlements),
        };
      }
    );
  }, [buildCachedSplits, currentUserId, queryClient]);

  const handleSubmit = async () => {
    if (!isValid) return;

    setLoading(true);
    let previousHomeFriends: HomeFriend[] | undefined;
    let previousGroupDetail: GroupDetailData | null | undefined;
    const previousFriendDetails = new Map<string, FriendDetailData | null | undefined>();
    let optimisticExpenseId: string | null = null;
    try {
      const amountNum = parseFloat(amount);
      const trimmedDescription = description.trim();
      // eslint-disable-next-line react-hooks/purity -- This timestamp is created from a submit event for optimistic cache data.
      const createdAt = Date.now();
      const optimisticExpense: Expense = {
        id: `optimistic:${createdAt}`,
        groupId: splitType === SplitType.GROUP ? selectedGroupId : undefined,
        description: trimmedDescription,
        amount: amountNum,
        currency: 'USD',
        paidBy: currentUserId,
        date: expenseDate.getTime(),
        createdAt,
        updatedAt: createdAt,
      };

      if (splitType === SplitType.GROUP) {
        let memberIds = groupMembers;
        if (memberIds.length === 0) {
          const members = await groupService.getMembers(selectedGroupId);
          memberIds = members.map((m: { userId: string }) => m.userId);
        }
        const splits = calculateSplits(memberIds, amountNum);

        if (!splits) {
          setLoading(false);
          return;
        }

        optimisticExpenseId = optimisticExpense.id;
        const groupDetailQueryKey = queryKeys.groups.detail(currentUserId, selectedGroupId);
        await Promise.all([
          queryClient.cancelQueries({ queryKey: friendsHomeQueryKey }),
          queryClient.cancelQueries({ queryKey: groupDetailQueryKey }),
        ]);
        previousHomeFriends = queryClient.getQueryData<HomeFriend[]>(friendsHomeQueryKey);
        previousGroupDetail = queryClient.getQueryData<GroupDetailData | null>(groupDetailQueryKey);
        updateHomeFriendsForCreatedExpense(optimisticExpense, splits);
        updateGroupDetailForCreatedExpense(selectedGroupId, optimisticExpense, splits);
        router.back();

        const expense = await expenseService.create(
          {
            groupId: selectedGroupId,
            description: trimmedDescription,
            amount: amountNum,
            currency: 'USD',
            paidBy: currentUserId,
            date: expenseDate.getTime(),
          },
          splits
        );
        replaceOptimisticHomeExpense(optimisticExpenseId, expense);
        replaceOptimisticGroupDetailExpense(selectedGroupId, optimisticExpenseId, expense, splits);

        try {
          const group = groups.find(g => g.id === selectedGroupId);
          await activityService.logExpenseCreated({
            expenseId: expense.id,
            userId: currentUserId,
            userName: user?.name || 'Someone',
            description: trimmedDescription,
            amount: amountNum,
            groupId: selectedGroupId,
            groupName: group?.name,
          });

          const usersToNotify = await userService.getByIds(
            memberIds.filter(memberId => memberId !== currentUserId)
          );
          const pushTokens = usersToNotify
            .filter(u => u.pushToken)
            .map(u => u.pushToken!);
          if (pushTokens.length > 0) {
            const notification = createExpenseNotification(
              trimmedDescription,
              amountNum,
              user?.name || 'Someone',
              group?.name
            );
            await notificationService.sendNotificationToUsers(pushTokens, notification);
          }

        } catch (sideEffectError) {
          console.warn('Expense created, but follow-up work failed:', sideEffectError);
        }

        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey }),
          queryClient.invalidateQueries({ queryKey: queryKeys.groups.list(currentUserId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(currentUserId, selectedGroupId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.expenses.list(currentUserId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.activity.list(currentUserId) }),
        ]);
      } else {
        const allParticipants = [currentUserId, ...selectedFriendIds];
        const splits = calculateSplits(allParticipants, amountNum);

        if (!splits) {
          setLoading(false);
          return;
        }

        optimisticExpenseId = optimisticExpense.id;
        const friendDetailQueryKeys = selectedFriendIds.map(friendId => queryKeys.friends.detail(currentUserId, friendId));
        await Promise.all([
          queryClient.cancelQueries({ queryKey: friendsHomeQueryKey }),
          ...friendDetailQueryKeys.map(queryKey => queryClient.cancelQueries({ queryKey })),
        ]);
        previousHomeFriends = queryClient.getQueryData<HomeFriend[]>(friendsHomeQueryKey);
        for (const friendId of selectedFriendIds) {
          previousFriendDetails.set(
            friendId,
            queryClient.getQueryData<FriendDetailData | null>(queryKeys.friends.detail(currentUserId, friendId))
          );
        }
        updateHomeFriendsForCreatedExpense(optimisticExpense, splits);
        updateFriendDetailsForCreatedExpense(optimisticExpense, splits, selectedFriendIds);
        router.back();

        const expense = await expenseService.create(
          {
            description: trimmedDescription,
            amount: amountNum,
            currency: 'USD',
            paidBy: currentUserId,
            date: expenseDate.getTime(),
          },
          splits
        );
        replaceOptimisticHomeExpense(optimisticExpenseId, expense);
        replaceOptimisticFriendDetailExpense(optimisticExpenseId, expense, selectedFriendIds);

        try {
          await activityService.logExpenseCreated({
            expenseId: expense.id,
            userId: currentUserId,
            userName: user?.name || 'Someone',
            description: trimmedDescription,
            amount: amountNum,
          });

          const friendPushTokens = friends
            .filter((friend) => selectedFriendIds.includes(friend.id) && friend.pushToken)
            .map((friend) => friend.pushToken as string);
          if (friendPushTokens.length > 0) {
            const notification = createExpenseNotification(
              trimmedDescription,
              amountNum,
              user?.name || 'Someone'
            );
            await notificationService.sendNotificationToUsers(friendPushTokens, notification);
          }

        } catch (sideEffectError) {
          console.warn('Expense created, but follow-up work failed:', sideEffectError);
        }

        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey }),
          queryClient.invalidateQueries({ queryKey: queryKeys.expenses.list(currentUserId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.activity.list(currentUserId) }),
          ...selectedFriendIds.flatMap(friendId => [
            queryClient.invalidateQueries({ queryKey: queryKeys.friends.detail(currentUserId, friendId) }),
          ]),
        ]);
      }
    } catch (error) {
      if (previousHomeFriends) {
        queryClient.setQueryData(friendsHomeQueryKey, previousHomeFriends);
      }
      if (previousGroupDetail !== undefined) {
        queryClient.setQueryData(queryKeys.groups.detail(currentUserId, selectedGroupId), previousGroupDetail);
      }
      for (const [friendId, previousFriendDetail] of previousFriendDetails) {
        if (previousFriendDetail !== undefined) {
          queryClient.setQueryData(queryKeys.friends.detail(currentUserId, friendId), previousFriendDetail);
        }
      }
      if (optimisticExpenseId) {
        queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey });
      }
      console.error('Error creating expense:', error);
      Alert.alert('Error', 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  }

  const calculateSplits = (userIds: string[], totalAmount: number): { userId: string; amount: number; splitType: 'equal' | 'exact' | 'percentage' }[] | null => {
    if (splitMethod === SplitMethod.EQUAL) {
      const splitAmount = totalAmount / userIds.length;
      return userIds.map(userId => ({
        userId,
        amount: splitAmount,
        splitType: 'equal' as const,
      }));
    }

    if (splitMethod === SplitMethod.UNEQUAL) {
      const splits = userIds.map(userId => {
        const customAmount = parseFloat(customAmounts[userId] || '0');
        return { userId, amount: customAmount, splitType: 'exact' as const };
      });

      const total = splits.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(total - totalAmount) > 0.01) {
        Alert.alert('Invalid Split', `Amounts must add up to $${totalAmount.toFixed(2)}. Current total: $${total.toFixed(2)}`);
        return null;
      }

      return splits;
    }

    if (splitMethod === SplitMethod.PERCENTAGE) {
      const percentages = userIds.map(userId => parseFloat(customPercentages[userId] || '0'));
      const totalPercentage = percentages.reduce((sum, p) => sum + p, 0);

      if (Math.abs(totalPercentage - 100) > 0.01) {
        Alert.alert('Invalid Split', `Percentages must add up to 100%. Current total: ${totalPercentage.toFixed(1)}%`);
        return null;
      }

      return userIds.map((userId, index) => ({
        userId,
        amount: (totalAmount * percentages[index]) / 100,
        splitType: 'percentage' as const,
      }));
    }

    if (splitMethod === SplitMethod.SHARES) {
      const sharesData = userIds.map(userId => ({
        userId,
        shares: parseFloat(customShares[userId] || '0'),
      }));

      const totalShares = sharesData.reduce((sum, item) => sum + item.shares, 0);

      if (totalShares === 0) {
        Alert.alert('Invalid Split', 'Please enter at least one share');
        return null;
      }

      // Only include users with shares > 0
      return sharesData
        .filter(item => item.shares > 0)
        .map(item => ({
          userId: item.userId,
          amount: (totalAmount * item.shares) / totalShares,
          splitType: 'exact' as const,
        }));
    }

    return null;
  }

  if (dataLoadError && !dataLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <NavigationHeader
          title="Add Expense"
          onBack={() => router.back()}
        />
        <AsyncErrorState
          message={getFetchErrorMessage(dataLoadError)}
          onRetry={() => void loadData()}
          title="Couldn't load"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      <NavigationHeader
        title={expenseStep === 1 ? 'Choose people' : 'Add Expense'}
        onBack={handleHeaderBack}
        rightAction={
          <TouchableOpacity
            onPress={handleHeaderAction}
            disabled={expenseStep === 1 ? !canContinue : !canSubmit || loading}
            style={[
              styles.headerButton,
              {
                backgroundColor: (expenseStep === 1 ? canContinue : canSubmit && !loading)
                  ? (isDark ? '#2DD4BF' : '#22C55E')
                  : (isDark ? '#374151' : '#E5E7EB'),
              },
            ]}>
            {loading ? (
              <ThemedText style={[styles.headerButtonText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>...</ThemedText>
            ) : (
              <ThemedText style={[styles.headerButtonText, { color: (expenseStep === 1 ? canContinue : canSubmit) ? '#0A0A0F' : (isDark ? '#9CA3AF' : '#6B7280') }]}>
                {expenseStep === 1 ? 'Next' : 'Add'}
              </ThemedText>
            )}
          </TouchableOpacity>
        }
      />

      {!preselectedGroupId && !preselectedFriendId && (
        <View style={styles.stepIndicator} accessibilityLabel={`Step ${expenseStep} of 2`}>
          <View style={styles.stepperRow}>
            <View style={styles.stepItem}>
              <View style={[styles.stepBadge, { backgroundColor: isDark ? '#2DD4BF' : colors.tint }]}>
                {expenseStep === 2 ? (
                  <IconSymbol name="checkmark" size={14} color="#0A0A0F" />
                ) : (
                  <ThemedText style={styles.stepBadgeText}>1</ThemedText>
                )}
              </View>
              <ThemedText style={[styles.stepName, { color: isDark ? '#2DD4BF' : colors.tint }]}>People</ThemedText>
            </View>
            <View style={[styles.stepLine, { backgroundColor: expenseStep === 2 ? (isDark ? '#2DD4BF' : colors.tint) : colors.border }]} />
            <View style={styles.stepItem}>
              <View style={[styles.stepBadge, { backgroundColor: expenseStep === 2 ? (isDark ? '#2DD4BF' : colors.tint) : colors.border }]}>
                <ThemedText style={[styles.stepBadgeText, { color: expenseStep === 2 ? '#0A0A0F' : colors.textSecondary }]}>2</ThemedText>
              </View>
              <ThemedText style={[styles.stepName, { color: expenseStep === 2 ? colors.text : colors.textSecondary }]}>Split</ThemedText>
            </View>
          </View>
        </View>
      )}

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {expenseStep === 2 && (
            <>
          <View style={[styles.participantSummary, {
            backgroundColor: isDark ? 'rgba(20, 35, 38, 0.66)' : colors.card,
            borderColor: colors.border,
          }]}>
            <View style={[styles.participantSummaryIcon, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.14)' : 'rgba(34, 197, 94, 0.1)' }]}>
              <IconSymbol
                name={splitType === SplitType.GROUP ? 'person.3.fill' : 'person.2.fill'}
                size={18}
                color={isDark ? '#2DD4BF' : colors.tint}
              />
            </View>
            <View style={styles.participantSummaryCopy}>
              <ThemedText style={[styles.participantSummaryLabel, { color: colors.textSecondary }]}>Splitting with</ThemedText>
              <ThemedText style={[styles.participantSummaryNames, { color: colors.text }]} numberOfLines={2}>
                {splitType === SplitType.GROUP
                  ? selectedGroup?.name || 'Selected group'
                  : selectedFriendNames.join(', ')}
              </ThemedText>
            </View>
          </View>
          {/* Amount Input - Hero Style */}
          <View style={styles.amountSection}>
            <View
              style={[
                styles.amountCard,
                {
                  backgroundColor: isDark ? 'rgba(20, 35, 38, 0.72)' : colors.card,
                  borderColor: colors.border,
                },
              ]}>
              <View style={styles.amountHeader}>
                <ThemedText style={[styles.amountLabel, { color: colors.textSecondary }]}>
                  Amount
                </ThemedText>
              </View>
              <View style={styles.amountInputRow}>
                <Text style={[styles.currencySymbol, { color: isDark ? '#2DD4BF' : colors.tint }]}>$</Text>
                <TextInput
                  ref={amountInputRef}
                  style={[styles.amountInput, { color: colors.text }]}
                  value={amount}
                  onChangeText={(text) => setAmount(normalizeCurrencyInput(text))}
                  placeholder="0.00"
                  placeholderTextColor={isDark ? 'rgba(225,245,239,0.26)' : 'rgba(15,23,42,0.28)'}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => descriptionInputRef.current?.focus()}
                  blurOnSubmit={false}
                  autoFocus={expenseStep === 2}
                  testID="expense-amount-input"
                />
              </View>
            </View>
          </View>

          {/* Description Input */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Description
            </ThemedText>
            <View style={[styles.inputContainer, {
              backgroundColor: isDark ? 'rgba(20, 35, 38, 0.66)' : colors.card,
              borderColor: colors.border,
            }]}>
              <IconSymbol name="doc.text" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
              <TextInput
                ref={descriptionInputRef}
                style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Dinner, Groceries, Uber..."
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                testID="expense-description-input"
              />
            </View>
          </View>

          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Date</ThemedText>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Expense date, ${formattedExpenseDate}`}
              onPress={() => setShowDatePicker(current => !current)}
              style={[styles.inputContainer, {
                backgroundColor: isDark ? 'rgba(20, 35, 38, 0.66)' : colors.card,
                borderColor: colors.border,
              }]}>
              <IconSymbol name="calendar" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
              <ThemedText style={[styles.textInput, { color: colors.text }]}>{formattedExpenseDate}</ThemedText>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                testID="expense-date-picker"
                value={expenseDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, selectedDate) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (selectedDate) setExpenseDate(selectedDate);
                }}
              />
            )}
          </View>

            </>
          )}

          {/* Split Type Toggle - only show if not pre-selected from friend/group screen */}
          {expenseStep === 1 && !preselectedGroupId && !preselectedFriendId && (
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                Split with
              </ThemedText>
              <View
                style={[
                  styles.toggleContainer,
                  {
                    backgroundColor: isDark ? 'rgba(20, 35, 38, 0.45)' : 'rgba(241, 245, 249, 0.9)',
                    borderColor: colors.border,
                  },
                ]}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: splitType === SplitType.GROUP }}
                  style={[
                    styles.toggleButton,
                    splitType === SplitType.GROUP && styles.toggleButtonActive,
                    {
                      backgroundColor: splitType === SplitType.GROUP
                        ? (isDark ? 'rgba(45, 212, 191, 0.14)' : 'rgba(34, 197, 94, 0.08)')
                        : 'transparent',
                      borderColor: splitType === SplitType.GROUP
                        ? (isDark ? '#2DD4BF' : colors.tint)
                        : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    setFriendSearchQuery('');
                    setSplitType(SplitType.GROUP);
                  }}>
                  <IconSymbol
                    name="person.3.fill"
                    size={17}
                    color={splitType === SplitType.GROUP ? (isDark ? '#2DD4BF' : colors.tint) : colors.textSecondary}
                  />
                  <ThemedText style={[
                    styles.toggleText,
                    splitType === SplitType.GROUP && styles.toggleTextActive,
                    { color: splitType === SplitType.GROUP ? (isDark ? '#2DD4BF' : colors.tint) : colors.textSecondary },
                  ]}>
                    Group
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: splitType === SplitType.FRIENDS }}
                  style={[
                    styles.toggleButton,
                    splitType === SplitType.FRIENDS && styles.toggleButtonActive,
                    {
                      backgroundColor: splitType === SplitType.FRIENDS
                        ? (isDark ? 'rgba(45, 212, 191, 0.14)' : 'rgba(34, 197, 94, 0.08)')
                        : 'transparent',
                      borderColor: splitType === SplitType.FRIENDS
                        ? (isDark ? '#2DD4BF' : colors.tint)
                        : 'transparent',
                    },
                  ]}
                  onPress={() => setSplitType(SplitType.FRIENDS)}>
                  <IconSymbol
                    name="person.2.fill"
                    size={17}
                    color={splitType === SplitType.FRIENDS ? (isDark ? '#2DD4BF' : colors.tint) : colors.textSecondary}
                  />
                  <ThemedText style={[
                    styles.toggleText,
                    splitType === SplitType.FRIENDS && styles.toggleTextActive,
                    { color: splitType === SplitType.FRIENDS ? (isDark ? '#2DD4BF' : colors.tint) : colors.textSecondary },
                  ]}>
                    Friends
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {expenseStep === 2 && (
            <>

          {/* Split Method Selection */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Split method
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.splitMethodContainer}
              keyboardShouldPersistTaps="handled">
              {SPLIT_METHODS
                .filter(method => {
                  // Hide shares option for friends
                  if (splitType === SplitType.FRIENDS && method.id === SplitMethod.SHARES) {
                    return false;
                  }
                  return true;
                })
                .map(method => {
                  const isActive = splitMethod === method.id;
                  const compactLabel = method.id === SplitMethod.PERCENTAGE ? 'Percent' : method.label;
                  return (
                    <TouchableOpacity
                      key={method.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.splitMethodButton,
                        isActive && styles.splitMethodButtonActive,
                        {
                          backgroundColor: isActive
                            ? (isDark ? 'rgba(45, 212, 191, 0.14)' : 'rgba(34, 197, 94, 0.08)')
                            : (isDark ? 'rgba(20, 35, 38, 0.66)' : colors.card),
                          borderColor: isActive
                            ? (isDark ? '#2DD4BF' : colors.tint)
                            : colors.border,
                        },
                      ]}
                      onPress={() => setSplitMethod(method.id)}>
                      <IconSymbol
                        name={method.icon}
                        size={18}
                        color={isDark ? '#2DD4BF' : colors.tint}
                      />
                      <ThemedText
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                        style={[
                          styles.splitMethodText,
                          { color: isActive ? (isDark ? '#2DD4BF' : colors.tint) : colors.text },
                        ]}>
                        {compactLabel}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>

            </>
          )}

          {/* Selection List */}
          {expenseStep === 1 && (
          <View style={styles.selectionSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              {splitType === SplitType.GROUP ? 'Select a group' : 'Select friends'}
            </ThemedText>

            {splitType === SplitType.GROUP && selectedGroupId && groupMembersLoadError && !groupMembersQuery.isLoading && (
              <AsyncErrorState
                variant="compact"
                title="Couldn't load members"
                message={getFetchErrorMessage(groupMembersLoadError)}
                onRetry={() => void loadGroupMembersForSelection()}
              />
            )}

            {dataLoading ? (
              <View style={styles.loadingContainer}>
                <ThemedText style={{ opacity: 0.6 }}>Loading...</ThemedText>
              </View>
            ) : splitType === SplitType.GROUP ? (
              <View style={styles.optionsList}>
                {groups.length === 0 ? (
                  <View style={styles.emptyState}>
                    <IconSymbol name="person.3" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                    <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                      No groups yet
                    </ThemedText>
                  </View>
                ) : (
                  groups.map(group => {
                    // If preselected from group screen, only show that group and make it non-interactive
                    if (preselectedGroupId && group.id !== preselectedGroupId) return null;

                    return (
                      <TouchableOpacity
                        key={group.id}
                        style={[
                          styles.optionCard,
                          selectedGroupId === group.id && styles.optionCardSelected,
                          {
                            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                            borderColor: selectedGroupId === group.id
                              ? (isDark ? '#2DD4BF' : colors.tint)
                              : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                          },
                        ]}
                        onPress={() => !preselectedGroupId && setSelectedGroupId(group.id)}
                        disabled={!!preselectedGroupId}>
                        <View style={[styles.optionIcon, {
                          backgroundColor: selectedGroupId === group.id
                            ? (isDark ? '#2DD4BF' : colors.tint)
                            : (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)'),
                        }]}>
                          <IconSymbol
                            name="person.3.fill"
                            size={16}
                            color={selectedGroupId === group.id ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                          />
                        </View>
                        <ThemedText style={[styles.optionText, !isDark && { color: colors.text }]}>
                          {group.name}
                        </ThemedText>
                        {selectedGroupId === group.id && (
                          <IconSymbol name="checkmark.circle.fill" size={22} color={isDark ? '#2DD4BF' : colors.tint} />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : (
              <View style={styles.optionsList}>
                {friends.length === 0 ? (
                  <View style={styles.emptyState}>
                    <IconSymbol name="person.2" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                    <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                      No friends yet
                    </ThemedText>
                  </View>
                ) : (
                  <>
                    {!preselectedFriendId && (
                      <View style={[styles.searchContainer, {
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                        borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                      }]}>
                        <IconSymbol name="magnifyingglass" size={18} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
                        <TextInput
                          style={[styles.searchInput, { color: isDark ? '#fff' : colors.text }]}
                          value={friendSearchQuery}
                          onChangeText={setFriendSearchQuery}
                          placeholder={`Search ${friends.length} friends`}
                          placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          returnKeyType="search"
                        />
                        {friendSearchQuery.length > 0 && (
                          <TouchableOpacity
                            accessibilityLabel="Clear friend search"
                            onPress={() => setFriendSearchQuery('')}
                            style={styles.clearSearchButton}>
                            <IconSymbol name="xmark.circle.fill" size={18} color={isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)'} />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    {visibleFriends.length === 0 ? (
                      <View style={styles.emptyState}>
                        <IconSymbol name="magnifyingglass" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                        <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>No matching friends</ThemedText>
                      </View>
                    ) : (
                      <>
                        {visibleFriends.length > displayedFriends.length && (
                          <ThemedText style={[styles.friendListHint, { color: colors.textSecondary }]}>
                            {friendSearchQuery.trim()
                              ? `Showing ${displayedFriends.length} matches. Refine your search to see fewer.`
                              : `Showing ${displayedFriends.length} of ${visibleFriends.length}. Search to find someone else.`}
                          </ThemedText>
                        )}
                        {displayedFriends.map(friend => {
                            const isSelected = selectedFriendIds.includes(friend.id);
                            return (
                              <TouchableOpacity
                                key={friend.id}
                                style={[
                                  styles.optionCard,
                                  isSelected && styles.optionCardSelected,
                                  {
                                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                                    borderColor: isSelected
                                      ? (isDark ? '#2DD4BF' : colors.tint)
                                      : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                                  },
                                ]}
                                onPress={() => !preselectedFriendId && toggleFriend(friend.id)}
                                disabled={!!preselectedFriendId}>
                                <View style={[styles.optionAvatar, {
                                  backgroundColor: isSelected
                                    ? (isDark ? '#2DD4BF' : colors.tint)
                                    : (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)'),
                                }]}>
                                  <ThemedText style={[styles.avatarText, {
                                    color: isSelected ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint),
                                  }]}>
                                    {friend.name.charAt(0).toUpperCase()}
                                  </ThemedText>
                                </View>
                                <ThemedText style={[styles.optionText, !isDark && { color: colors.text }]}>
                                  {friend.name}
                                </ThemedText>
                                {isSelected && (
                                  <IconSymbol name="checkmark.circle.fill" size={22} color={isDark ? '#2DD4BF' : colors.tint} />
                                )}
                              </TouchableOpacity>
                            );
                        })}
                      </>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
          )}

          {/* Custom Split Inputs - Show when non-equal split is selected */}
          {expenseStep === 2 && splitMethod !== SplitMethod.EQUAL && (splitType === SplitType.FRIENDS ? selectedFriendIds.length > 0 : selectedGroupId) && amount && parseFloat(amount) > 0 && (() => {
            // Calculate remaining balance for unequal split
            const totalAmount = parseFloat(amount);
            const userIds = splitType === SplitType.GROUP ? groupMembers : [currentUserId, ...selectedFriendIds];
            const allocatedAmount = userIds.reduce((sum, userId) => {
              const userAmount = parseFloat(customAmounts[userId] || '0');
              return sum + userAmount;
            }, 0);
            const remaining = totalAmount - allocatedAmount;
            const isBalanced = Math.abs(remaining) < 0.01;

            return (
              <View style={styles.customSplitSection}>
                <View style={styles.customSplitHeader}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    {splitMethod === SplitMethod.UNEQUAL ? 'Enter amounts' : splitMethod === SplitMethod.PERCENTAGE ? 'Enter percentages' : 'Enter shares'}
                  </ThemedText>
                  {splitMethod === SplitMethod.UNEQUAL && (
                    <View style={[styles.remainingBadge, {
                      backgroundColor: isBalanced
                        ? (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)')
                        : remaining > 0
                          ? (isDark ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.2)')
                          : (isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                    }]}>
                      <ThemedText style={[styles.remainingText, {
                        color: isBalanced
                          ? (isDark ? '#2DD4BF' : '#22c55e')
                          : remaining > 0
                            ? (isDark ? '#fbbf24' : '#f59e0b')
                            : (isDark ? '#ef4444' : '#dc2626'),
                      }]}>
                        {isBalanced ? '✓ Balanced' : `${remaining > 0 ? 'Remaining' : 'Over'}: $${Math.abs(remaining).toFixed(2)}`}
                      </ThemedText>
                    </View>
                  )}
                </View>

                <View style={[styles.splitSummary, {
                  backgroundColor: isDark ? 'rgba(20, 35, 38, 0.72)' : colors.card,
                  borderColor: splitProgress.isBalanced
                    ? (isDark ? 'rgba(45, 212, 191, 0.32)' : 'rgba(34, 197, 94, 0.28)')
                    : (isDark ? 'rgba(251, 191, 36, 0.32)' : 'rgba(245, 158, 11, 0.28)'),
                }]}
                  accessibilityLabel={`Split total $${splitProgress.allocated.toFixed(2)} of $${totalAmount.toFixed(2)}`}>
                  <View style={styles.splitSummaryTopline}>
                    <View>
                      <ThemedText style={[styles.splitSummaryLabel, { color: colors.textSecondary }]}>Live split total</ThemedText>
                      <View style={styles.splitSummaryTotalRow}>
                        <ThemedText style={[styles.splitSummaryTotal, { color: colors.text }]}>{`$${splitProgress.allocated.toFixed(2)}`}</ThemedText>
                        <ThemedText style={[styles.splitSummaryTotalContext, { color: colors.textSecondary }]}>{`of $${totalAmount.toFixed(2)}`}</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={[styles.splitSummaryStatus, { color: splitProgress.isBalanced ? (isDark ? '#2DD4BF' : '#16A34A') : (isDark ? '#FBBF24' : '#B45309') }]}>
                      {splitProgress.isBalanced ? 'Ready to add' : `${splitProgress.remaining > 0 ? '$' + splitProgress.remaining.toFixed(2) + ' left' : '$' + Math.abs(splitProgress.remaining).toFixed(2) + ' over'}`}
                    </ThemedText>
                  </View>
                  {splitProgress.people.map(person => {
                    const personName = person.userId === currentUserId
                      ? 'You'
                      : friends.find(friend => friend.id === person.userId)?.name
                        || groupMemberUsers.find(member => member.id === person.userId)?.name
                        || 'Member';
                    return (
                      <View key={person.userId} style={styles.splitSummaryRow}>
                        <ThemedText style={[styles.splitSummaryPerson, { color: colors.textSecondary }]}>{personName}</ThemedText>
                        <ThemedText style={[styles.splitSummaryAmount, { color: colors.text }]}>${person.amount.toFixed(2)}</ThemedText>
                      </View>
                    );
                  })}
                  {!splitProgress.isBalanced && (
                    <TouchableOpacity
                      onPress={setEvenSplit}
                      accessibilityRole="button"
                      accessibilityLabel="Set equal amounts for everyone"
                      style={[styles.balanceButton, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.16)' : 'rgba(34, 197, 94, 0.12)' }]}>
                      <IconSymbol name="arrow.triangle.2.circlepath" size={16} color={isDark ? '#2DD4BF' : colors.tint} />
                      <ThemedText style={[styles.balanceButtonText, { color: isDark ? '#2DD4BF' : colors.tint }]}>Set equal amounts</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Current User */}
                <View style={[styles.customSplitCard, {
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                  borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                }]}>
                  <View style={[styles.customSplitAvatar, {
                    backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                  }]}>
                    <ThemedText style={{ color: isDark ? '#2DD4BF' : colors.tint, fontWeight: '600' }}>
                      You
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                    You (payer)
                  </ThemedText>
                  <TextInput
                    style={[styles.customSplitInput, {
                      backgroundColor: isDark ? 'rgba(20, 35, 38, 0.8)' : 'rgba(255,255,255,0.9)',
                      color: isDark ? '#fff' : colors.text,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                    }]}
                    value={splitMethod === SplitMethod.UNEQUAL ? customAmounts[currentUserId] : splitMethod === SplitMethod.PERCENTAGE ? customPercentages[currentUserId] : customShares[currentUserId]}
                    onChangeText={(text) => {
                      if (splitMethod === SplitMethod.UNEQUAL) setCustomAmounts(prev => ({ ...prev, [currentUserId]: normalizeCurrencyInput(text) }));
                      else if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(prev => ({ ...prev, [currentUserId]: text }));
                      else setCustomShares(prev => ({ ...prev, [currentUserId]: text }));
                    }}
                    placeholder="0"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                    keyboardType="decimal-pad"
                  />
                  <ThemedText style={[styles.customSplitSuffix, { color: colors.textSecondary }]}>
                    {splitMethod === SplitMethod.UNEQUAL ? '$' : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                  </ThemedText>
                  {(splitMethod === SplitMethod.PERCENTAGE || splitMethod === SplitMethod.SHARES) && (() => {
                    let calculatedAmount = 0;
                    if (splitMethod === SplitMethod.PERCENTAGE) {
                      const percentage = parseFloat(customPercentages[currentUserId] || '0');
                      calculatedAmount = (totalAmount * percentage) / 100;
                    } else {
                      const shares = parseFloat(customShares[currentUserId] || '0');
                      const totalShares = userIds.reduce((sum, uid) => sum + parseFloat(customShares[uid] || '0'), 0);
                      calculatedAmount = totalShares > 0 ? (totalAmount * shares) / totalShares : 0;
                    }
                    return (
                      <ThemedText style={[styles.calculatedAmount, { color: colors.textSecondary }]}>
                        ${calculatedAmount.toFixed(2)}
                      </ThemedText>
                    );
                  })()}
                </View>

                {/* Selected Friends */}
                {splitType === SplitType.FRIENDS && selectedFriendIds.map(friendId => {
                  const friend = friends.find(f => f.id === friendId);
                  if (!friend) return null;
                  return (
                    <View key={friendId} style={[styles.customSplitCard, {
                      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                      borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                    }]}>
                      <View style={[styles.customSplitAvatar, {
                        backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                      }]}>
                        <ThemedText style={{ color: isDark ? '#2DD4BF' : colors.tint, fontWeight: '600' }}>
                          {friend.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                        {friend.name}
                      </ThemedText>
                      <TextInput
                        style={[styles.customSplitInput, {
                          backgroundColor: isDark ? 'rgba(20, 35, 38, 0.8)' : 'rgba(255,255,255,0.9)',
                          color: isDark ? '#fff' : colors.text,
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                        }]}
                        value={splitMethod === SplitMethod.UNEQUAL ? customAmounts[friendId] : splitMethod === SplitMethod.PERCENTAGE ? customPercentages[friendId] : customShares[friendId]}
                        onChangeText={(text) => {
                          if (splitMethod === SplitMethod.UNEQUAL) setCustomAmounts(prev => ({ ...prev, [friendId]: normalizeCurrencyInput(text) }));
                          else if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(prev => ({ ...prev, [friendId]: text }));
                          else setCustomShares(prev => ({ ...prev, [friendId]: text }));
                        }}
                        placeholder="0"
                        placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                        keyboardType="decimal-pad"
                      />
                      <ThemedText style={[styles.customSplitSuffix, { color: colors.textSecondary }]}>
                        {splitMethod === SplitMethod.UNEQUAL ? '$' : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                      </ThemedText>
                      {(splitMethod === SplitMethod.PERCENTAGE || splitMethod === SplitMethod.SHARES) && (() => {
                        let calculatedAmount = 0;
                        if (splitMethod === SplitMethod.PERCENTAGE) {
                          const percentage = parseFloat(customPercentages[friendId] || '0');
                          calculatedAmount = (totalAmount * percentage) / 100;
                        } else {
                          const shares = parseFloat(customShares[friendId] || '0');
                          const totalShares = userIds.reduce((sum, uid) => sum + parseFloat(customShares[uid] || '0'), 0);
                          calculatedAmount = totalShares > 0 ? (totalAmount * shares) / totalShares : 0;
                        }
                        return (
                          <ThemedText style={[styles.calculatedAmount, { color: colors.textSecondary }]}>
                            ${calculatedAmount.toFixed(2)}
                          </ThemedText>
                        );
                      })()}
                    </View>
                  );
                })}

                {/* Group Members */}
                {splitType === SplitType.GROUP && groupMembers.filter(memberId => memberId !== currentUserId).map(memberId => {
                  const member = getGroupExpenseParticipant(memberId, groupMemberUsers, friends);
                  if (!member) return null;
                  return (
                    <View key={memberId} style={[styles.customSplitCard, {
                      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                      borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                    }]}>
                      <View style={[styles.customSplitAvatar, {
                        backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                      }]}>
                        <ThemedText style={{ color: isDark ? '#2DD4BF' : colors.tint, fontWeight: '600' }}>
                          {member.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                        {member.name}
                      </ThemedText>
                      <TextInput
                        style={[styles.customSplitInput, {
                          backgroundColor: isDark ? 'rgba(20, 35, 38, 0.8)' : 'rgba(255,255,255,0.9)',
                          color: isDark ? '#fff' : colors.text,
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                        }]}
                        value={splitMethod === SplitMethod.UNEQUAL ? customAmounts[memberId] : splitMethod === SplitMethod.PERCENTAGE ? customPercentages[memberId] : customShares[memberId]}
                        onChangeText={(text) => {
                          if (splitMethod === SplitMethod.UNEQUAL) setCustomAmounts(prev => ({ ...prev, [memberId]: normalizeCurrencyInput(text) }));
                          else if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(prev => ({ ...prev, [memberId]: text }));
                          else setCustomShares(prev => ({ ...prev, [memberId]: text }));
                        }}
                        placeholder="0"
                        placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                        keyboardType="decimal-pad"
                      />
                      <ThemedText style={[styles.customSplitSuffix, { color: colors.textSecondary }]}>
                        {splitMethod === SplitMethod.UNEQUAL ? '$' : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                      </ThemedText>
                      {(splitMethod === SplitMethod.PERCENTAGE || splitMethod === SplitMethod.SHARES) && (() => {
                        let calculatedAmount = 0;
                        if (splitMethod === SplitMethod.PERCENTAGE) {
                          const percentage = parseFloat(customPercentages[memberId] || '0');
                          calculatedAmount = (totalAmount * percentage) / 100;
                        } else {
                          const shares = parseFloat(customShares[memberId] || '0');
                          const totalShares = userIds.reduce((sum, uid) => sum + parseFloat(customShares[uid] || '0'), 0);
                          calculatedAmount = totalShares > 0 ? (totalAmount * shares) / totalShares : 0;
                        }
                        return (
                          <ThemedText style={[styles.calculatedAmount, { color: colors.textSecondary }]}>
                            ${calculatedAmount.toFixed(2)}
                          </ThemedText>
                        );
                      })()}
                    </View>
                  );
                })}
              </View>
            );
          })()}

        </Animated.View>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 44,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  stepIndicator: {
    marginHorizontal: 18,
    marginBottom: 8,
    paddingHorizontal: 18,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  stepBadgeText: {
    color: '#0A0A0F',
    fontSize: 13,
    fontWeight: '800',
  },
  stepName: {
    fontSize: 16,
    fontWeight: '700',
  },
  participantSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 22,
  },
  participantSummaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantSummaryCopy: {
    flex: 1,
    gap: 2,
  },
  participantSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  participantSummaryNames: {
    fontSize: 15,
    fontWeight: '700',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  content: {
    flex: 1,
  },
  amountSection: {
    marginBottom: 22,
  },
  amountCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  amountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  amountLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 44,
    fontWeight: '700',
    marginRight: 4,
  },
  amountInput: {
    flexShrink: 1,
    fontSize: 44,
    fontWeight: '700',
    minWidth: 120,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleButtonActive: {
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#fff',
  },
  toggleTextActive: {
    color: '#2DD4BF',
  },
  splitMethodContainer: {
    gap: 8,
    paddingRight: 18,
  },
  splitMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  splitMethodButtonActive: {
    borderWidth: 1.5,
  },
  splitMethodText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#fff',
  },
  customSplitSection: {
    marginBottom: 16,
  },
  splitSummary: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    paddingBottom: 16,
    gap: 8,
    marginBottom: 14,
  },
  splitSummaryTopline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 4,
  },
  splitSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  splitSummaryTotal: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  splitSummaryTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  splitSummaryTotalContext: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  splitSummaryStatus: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    paddingTop: 4,
  },
  splitSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
    paddingTop: 4,
  },
  splitSummaryPerson: {
    fontSize: 13,
    lineHeight: 22,
    includeFontPadding: true,
  },
  splitSummaryAmount: {
    fontSize: 13,
    lineHeight: 22,
    includeFontPadding: true,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  balanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 10,
    marginTop: 6,
  },
  balanceButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  customSplitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  remainingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  remainingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customSplitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  customSplitAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customSplitName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  customSplitInput: {
    width: 80,
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  customSplitSuffix: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  calculatedAmount: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  selectionSection: {
    marginBottom: 24,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  optionsList: {
    gap: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 46,
    fontSize: 15,
  },
  friendListHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  clearSearchButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 14,
  },
  optionCardSelected: {
    borderWidth: 2,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
