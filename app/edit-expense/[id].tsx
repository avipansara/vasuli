import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import { groupService } from '@/services/group-service';
import { userService } from '@/services/user-service';
import { createExpenseUpdatedNotification, notificationService } from '@/services/notification-service';
import { queryKeys } from '@/services/query-keys';
import type { Expense, ExpenseSplit, User } from '@/types/database';
import { normalizeCurrencyInput } from '@/utils/validation';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { getGroupExpenseParticipant } from '@/utils/group-expense-participants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
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
type EditableSplit = Pick<ExpenseSplit, 'userId' | 'amount' | 'splitType' | 'percentage'>;

export default function EditExpenseScreen() {
  const { gradients, colors, settle, isDark } = useThemeColors();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [splitType, setSplitType] = useState<SplitType>(SplitType.GROUP);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(SplitMethod.EQUAL);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [customPercentages, setCustomPercentages] = useState<Record<string, string>>({});
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [originalExpense, setOriginalExpense] = useState<Expense | null>(null);
  const [originalSplits, setOriginalSplits] = useState<ExpenseSplit[]>([]);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  // Input refs
  const amountInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const editFormQuery = useQuery({
    queryKey: queryKeys.expenses.editForm(currentUserId, id),
    enabled: !!currentUserId && !!id,
    queryFn: async () => {
      const expense = await expenseService.getById(id);
      if (!expense) return null;

      const [groups, friends, splits] = await Promise.all([
        groupService.getUserGroups(currentUserId),
        userService.getUserFriends(currentUserId),
        expenseService.getSplits(id),
      ]);
      return { expense, groups, friends, splits };
    },
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
  const groups = editFormQuery.data?.groups ?? [];
  const friends = editFormQuery.data?.friends ?? [];
  const groupMembers = groupMembersQuery.data?.memberIds ?? [];
  const groupMemberUsers = groupMembersQuery.data?.memberUsers ?? [];
  const dataLoading = editFormQuery.isLoading;
  const loadError = editFormQuery.error;
  const groupMembersLoadError = groupMembersQuery.error;

  useEffect(() => {
    const formData = editFormQuery.data;
    if (!formData) return;

    if (formData.expense.deletedAt) {
      Alert.alert('Expense deleted', 'Deleted expenses cannot be edited or restored.');
      router.back();
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Query data hydrates the editable form state once the server record is available.
    setDescription(formData.expense.description);
    setAmount(formData.expense.amount.toString());
    setExpenseDate(new Date(formData.expense.date));
    setOriginalExpense(formData.expense);
    setSplitType(formData.expense.groupId ? SplitType.GROUP : SplitType.FRIENDS);
    setSelectedGroupId(formData.expense.groupId || '');
    setSelectedFriendIds(formData.splits.map(split => split.userId).filter(userId => userId !== currentUserId));
    setOriginalSplits(formData.splits);

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
  }, [currentUserId, editFormQuery.data, fadeAnim, slideAnim]);

  const loadData = useCallback(async () => {
    await editFormQuery.refetch();
  }, [editFormQuery]);

  const loadGroupMembersForSelection = useCallback(async () => {
    await groupMembersQuery.refetch();
  }, [groupMembersQuery]);

  const isValid =
    description.trim().length > 0 &&
    amount.trim().length > 0 &&
    !isNaN(parseFloat(amount)) &&
    parseFloat(amount) > 0 &&
    (splitType === SplitType.GROUP ? selectedGroupId !== '' : selectedFriendIds.length > 0);

  const getHomeBalanceDelta = useCallback((expense: Expense, splits: EditableSplit[], friendId: string) => {
    const currentUserSplit = splits.find(split => split.userId === currentUserId);
    const friendSplit = splits.find(split => split.userId === friendId);

    if (!currentUserSplit || !friendSplit) return 0;
    if (expense.paidBy === currentUserId) return friendSplit.amount;
    if (expense.paidBy === friendId) return -currentUserSplit.amount;
    return 0;
  }, [currentUserId]);

  const updateHomeFriendsForEditedExpense = useCallback((
    previousExpense: Expense,
    previousSplits: EditableSplit[],
    nextExpense: Expense,
    nextSplits: EditableSplit[]
  ) => {
    queryClient.setQueryData<HomeFriend[]>(
      friendsHomeQueryKey,
      current => current?.map(friend => {
        const removePreviousDelta = -getHomeBalanceDelta(previousExpense, previousSplits, friend.id);
        const addNextDelta = getHomeBalanceDelta(nextExpense, nextSplits, friend.id);
        const netDelta = removePreviousDelta + addNextDelta;
        const nextBalance = friend.balance + netDelta;
        const recentExpenses = friend.recentExpenses?.filter(expense => expense.id !== previousExpense.id) ?? [];

        return {
          ...friend,
          balance: Math.abs(nextBalance) < 0.01 ? 0 : nextBalance,
          recentExpenses: addNextDelta === 0
            ? recentExpenses
            : [
              { ...nextExpense, amount: Math.abs(addNextDelta) },
              ...recentExpenses,
            ].slice(0, 2),
        };
      })
    );
  }, [friendsHomeQueryKey, getHomeBalanceDelta, queryClient]);

  function calculateSplits(userIds: string[], totalAmount: number): { userId: string; amount: number; splitType: 'equal' | 'exact' | 'percentage' }[] | null {
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
        Alert.alert('Invalid Split', `Amounts must add up to ${formatCurrency(totalAmount, editFormQuery.data?.expense?.currency)}. Current total: ${formatCurrency(total, editFormQuery.data?.expense?.currency)}`);
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

  const handleSubmit = async () => {
    if (!isValid) return;
    if (!originalExpense) {
      Alert.alert('Error', 'Expense not loaded yet');
      return;
    }

    setLoading(true);
    let previousHomeFriends: HomeFriend[] | undefined;
    let didOptimisticallyUpdate = false;
    try {
      const newAmount = parseFloat(amount);
      const trimmedDescription = description.trim();
      const updatedExpense: Expense = {
        ...originalExpense,
        description: trimmedDescription,
        amount: newAmount,
        date: expenseDate.getTime(),
        groupId: splitType === SplitType.GROUP ? selectedGroupId : undefined,
        updatedAt: Date.now(),
      };

      // Calculate splits based on split type and method
      let splits: { userId: string; amount: number; splitType: 'equal' | 'exact' | 'percentage' }[] | null = null;

      if (splitType === SplitType.FRIENDS) {
        const allParticipants = [currentUserId, ...selectedFriendIds];
        splits = calculateSplits(allParticipants, newAmount);
      } else {
        let memberIds = groupMembers;
        if (memberIds.length === 0) {
          const members = await groupService.getMembers(selectedGroupId);
          memberIds = members.map((m: { userId: string }) => m.userId);
        }
        splits = calculateSplits(memberIds, newAmount);
      }

      if (!splits) {
        setLoading(false);
        return;
      }

      await queryClient.cancelQueries({ queryKey: friendsHomeQueryKey });
      previousHomeFriends = queryClient.getQueryData<HomeFriend[]>(friendsHomeQueryKey);
      updateHomeFriendsForEditedExpense(originalExpense, originalSplits, updatedExpense, splits);
      didOptimisticallyUpdate = true;
      router.back();

      await expenseService.update(id, {
        description: trimmedDescription,
        amount: newAmount,
        date: expenseDate.getTime(),
        groupId: splitType === SplitType.GROUP ? selectedGroupId : undefined,
      }, splits);

      try {
        const group = splitType === SplitType.GROUP ? groups.find(g => g.id === selectedGroupId) : undefined;
        const participantIds = Array.from(new Set([
          ...originalSplits.map(split => split.userId),
          ...splits.map(split => split.userId),
        ]));
        await activityService.logExpenseUpdated({
          expenseId: id,
          userId: currentUserId,
          userName: user?.name || 'Someone',
          description: trimmedDescription,
          amount: newAmount,
          groupId: group?.id,
          groupName: group?.name,
          participantIds,
        });

        const usersToNotify = await userService.getByIds(
          participantIds.filter(userId => userId !== currentUserId)
        );
        const pushTokens = usersToNotify
          .filter(u => u.pushToken)
          .map(u => u.pushToken!);
        if (pushTokens.length > 0) {
          const notification = createExpenseUpdatedNotification(
            id,
            trimmedDescription,
            newAmount,
            user?.name || 'Someone',
            group?.name,
            group?.id
          );
          await notificationService.sendNotificationToUsers(pushTokens, notification);
        }
      } catch (sideEffectError) {
        console.warn('Expense updated, but follow-up work failed:', sideEffectError);
      }

      const affectedFriendIds = Array.from(new Set([
        ...originalSplits.map(split => split.userId),
        ...splits.map(split => split.userId),
      ].filter(userId => userId !== currentUserId)));
      const affectedGroupIds = Array.from(new Set([
        originalExpense.groupId,
        updatedExpense.groupId,
      ].filter((groupId): groupId is string => !!groupId)));

      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.list(currentUserId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity.list(currentUserId) }),
        ...affectedFriendIds.flatMap(friendId => [
          queryClient.invalidateQueries({ queryKey: queryKeys.friends.detail(currentUserId, friendId) }),
        ]),
        ...affectedGroupIds.flatMap(groupId => [
          queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(currentUserId, groupId) }),
        ]),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.list(currentUserId) }),
      ]);
    } catch (error) {
      if (previousHomeFriends) {
        queryClient.setQueryData(friendsHomeQueryKey, previousHomeFriends);
      }
      if (didOptimisticallyUpdate) {
        queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey });
      }
      console.error('Error updating expense:', error);
      Alert.alert('Error', 'Failed to update expense');
    } finally {
      setLoading(false);
    }
  }

  if (dataLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <NavigationHeader
          title="Edit Expense"
          onBack={() => router.back()}
        />
        <View style={styles.scrollContent}>
          {/* Amount Section Skeleton */}
          <View style={[styles.amountSection, { marginTop: 24, alignItems: 'center' }]}>
            <Skeleton width={120} height={18} style={{ marginBottom: 12 }} />
            <Skeleton width={180} height={48} borderRadius={16} />
          </View>

          {/* Description Section Skeleton */}
          <View style={[styles.inputSection, { marginTop: 24 }]}>
            <Skeleton width={100} height={16} style={{ marginBottom: 8 }} />
            <Skeleton height={50} borderRadius={12} />
          </View>

          {/* Date Section Skeleton */}
          <View style={[styles.inputSection, { marginTop: 24 }]}>
            <Skeleton width={80} height={16} style={{ marginBottom: 8 }} />
            <Skeleton height={50} borderRadius={12} />
          </View>
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <NavigationHeader
          title="Edit Expense"
          onBack={() => router.back()}
        />
        <AsyncErrorState
          message={getFetchErrorMessage(loadError)}
          onRetry={() => void loadData()}
          title="Couldn't load expense"
        />
      </View>
    );
  }

  if (editFormQuery.data === null) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <AsyncErrorState
          message="This expense is no longer available."
          onRetry={() => void loadData()}
          title="Couldn't load expense"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      <NavigationHeader
        title="Edit Expense"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!isValid || loading}
            style={[
              styles.headerButton,
              {
                backgroundColor: (isValid && !loading)
                  ? settle.buttonBackground
                  : (colors.border),
              },
            ]}>
            {loading ? (
              <ActivityIndicator size="small" color={isDark ? '#003824' : '#ffffff'} />
            ) : (
              <ThemedText style={[styles.headerButtonText, { color: isValid ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#bbcabf' : '#6B7280') }]}>
                Save
              </ThemedText>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Amount Input */}
          <View style={styles.amountSection}>
            <ThemedText style={[styles.amountLabel, !isDark && { color: colors.textSecondary }]}>
              How much?
            </ThemedText>
            <View style={styles.amountInputRow}>
              <Text style={[styles.currencySymbol, { color: settle.accentText }]}>{getCurrencySymbol(editFormQuery.data?.expense?.currency)}</Text>
              <TextInput
                ref={amountInputRef}
                style={[styles.amountInput, { color: isDark ? '#fff' : colors.text }]}
                value={amount}
                onChangeText={(text) => setAmount(normalizeCurrencyInput(text))}
                placeholder="0.00"
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => descriptionInputRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          {/* Description Input */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
              Description *
            </ThemedText>
            <View style={[styles.inputContainer, {
              backgroundColor: colors.card,
              borderColor: colors.border,
            }]}>
              <IconSymbol name="text.alignleft" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
              <TextInput
                ref={descriptionInputRef}
                style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g., Dinner, Groceries"
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>
          </View>

          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>Date</ThemedText>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Expense date, ${expenseDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
              onPress={() => setShowDatePicker(current => !current)}
              style={[styles.inputContainer, {
                backgroundColor: colors.card,
                borderColor: colors.border,
              }]}>
              <IconSymbol name="calendar" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
              <ThemedText style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}>
                {expenseDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </ThemedText>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                testID="edit-expense-date-picker"
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

          {/* Split Method Selection */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
              How to split?
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
                      style={[
                        styles.splitMethodButton,
                        isActive && styles.splitMethodButtonActive,
                        {
                          backgroundColor: isActive ? (settle.buttonBackground) : settle.pillBackground,
                          borderColor: isActive ? (settle.buttonBackground) : (colors.border),
                        },
                      ]}
                      onPress={() => setSplitMethod(method.id)}>
                      <IconSymbol
                        name={method.icon}
                        size={16}
                        color={isActive ? (isDark ? '#003824' : '#ffffff') : (colors.text)}
                      />
                      <ThemedText style={[
                        styles.splitMethodText,
                        { color: isActive ? (isDark ? '#003824' : '#ffffff') : (colors.text) },
                      ]}>
                        {compactLabel}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>

          {/* Group/Friend Selection - locked to original type */}
          {splitType === SplitType.GROUP ? (
            <View style={styles.selectionSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Select Group *
              </ThemedText>
              {selectedGroupId && groupMembersLoadError && (
                <AsyncErrorState
                  variant="compact"
                  title="Couldn't load members"
                  message={getFetchErrorMessage(groupMembersLoadError)}
                  onRetry={() => void loadGroupMembersForSelection()}
                />
              )}
              {groups.length === 0 ? (
                <View style={[styles.emptyState, !isDark && { backgroundColor: colors.card }]}>
                  <IconSymbol name="person.3.fill" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                  <ThemedText style={[styles.emptyStateText, !isDark && { color: colors.textSecondary }]}>
                    No groups yet
                  </ThemedText>
                </View>
              ) : (
                groups.map(group => {
                  const isSelected = selectedGroupId === group.id;
                  return (
                    <TouchableOpacity
                      key={group.id}
                      onPress={() => setSelectedGroupId(group.id)}
                      style={styles.selectionCard}>
                      <View style={[styles.selectionIcon, {
                        backgroundColor: isSelected
                          ? (settle.buttonBackground)
                          : (settle.avatarUnselectedBackground),
                      }]}>
                        <IconSymbol
                          name="person.3.fill"
                          size={20}
                          color={isSelected ? (isDark ? '#003824' : '#ffffff') : (colors.text)}
                        />
                      </View>
                      <View style={styles.selectionTextContainer}>
                        <ThemedText
                          style={[
                            styles.selectionCardText,
                            { color: isSelected ? (settle.buttonBackground) : (colors.text) }
                          ]}>
                          {group.name}
                        </ThemedText>
                      </View>
                      {isSelected && (
                        <IconSymbol name="checkmark.circle.fill" size={22} color={settle.buttonBackground} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ) : (
            <View style={styles.selectionSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Select Friends *
              </ThemedText>
              {friends.length === 0 ? (
                <View style={[styles.emptyState, !isDark && { backgroundColor: colors.card }]}>
                  <IconSymbol name="person.2.fill" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                  <ThemedText style={[styles.emptyStateText, !isDark && { color: colors.textSecondary }]}>
                    No friends yet
                  </ThemedText>
                </View>
              ) : (
                friends.map(friend => {
                  const isSelected = selectedFriendIds.includes(friend.id);
                  return (
                    <TouchableOpacity
                      key={friend.id}
                      onPress={() => {
                        setSelectedFriendIds(prev =>
                          prev.includes(friend.id)
                            ? prev.filter(id => id !== friend.id)
                            : [...prev, friend.id]
                        );
                      }}
                      style={styles.selectionCard}>
                      <View style={[styles.selectionIcon, {
                        backgroundColor: isSelected
                          ? (settle.buttonBackground)
                          : (settle.avatarUnselectedBackground),
                      }]}>
                        <IconSymbol
                          name="person.fill"
                          size={20}
                          color={isSelected ? (isDark ? '#003824' : '#ffffff') : (colors.text)}
                        />
                      </View>
                      <View style={styles.selectionTextContainer}>
                        <ThemedText
                          style={[
                            styles.selectionCardText,
                            { color: isSelected ? (settle.buttonBackground) : (colors.text) }
                          ]}>
                          {friend.name}
                        </ThemedText>
                      </View>
                      {isSelected && (
                        <IconSymbol name="checkmark.circle.fill" size={22} color={settle.buttonBackground} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* Custom Split Inputs - Show when non-equal split is selected */}
          {splitMethod !== SplitMethod.EQUAL && (splitType === SplitType.FRIENDS ? selectedFriendIds.length > 0 : selectedGroupId) && amount && parseFloat(amount) > 0 && (() => {
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
                  <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
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
                        {isBalanced ? '✓ Balanced' : `${remaining > 0 ? 'Remaining' : 'Over'}: ${formatCurrency(Math.abs(remaining), editFormQuery.data?.expense?.currency)}`}
                      </ThemedText>
                    </View>
                  )}
                </View>

                {/* Current User */}
                <View style={[styles.customSplitCard, {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }]}>
                  <View style={[styles.customSplitAvatar, {
                    backgroundColor: settle.avatarUnselectedBackground,
                  }]}>
                    <ThemedText style={{ color: colors.text, fontWeight: '600' }}>
                      You
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                    You (payer)
                  </ThemedText>
                  <TextInput
                    style={[styles.customSplitInput, {
                      backgroundColor: isDark ? '#05080e' : 'rgba(255,255,255,0.9)',
                      color: isDark ? '#fff' : colors.text,
                      borderWidth: 1,
                      borderColor: colors.border,
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
                  <ThemedText style={[styles.customSplitSuffix, !isDark && { color: colors.textSecondary }]}>
                    {splitMethod === SplitMethod.UNEQUAL ? getCurrencySymbol(editFormQuery.data?.expense?.currency) : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                  </ThemedText>
                  {(splitMethod === SplitMethod.PERCENTAGE || splitMethod === SplitMethod.SHARES) && (() => {
                    const totalAmount = parseFloat(amount);
                    const userIds = splitType === SplitType.GROUP ? groupMembers : [currentUserId, ...selectedFriendIds];
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
                      <ThemedText style={[styles.calculatedAmount, !isDark && { color: colors.textSecondary }]}>
                        {formatCurrency(calculatedAmount, editFormQuery.data?.expense?.currency)}
                      </ThemedText>
                    );
                  })()}
                </View>

                {/* Other participants */}
                {(splitType === SplitType.FRIENDS ? selectedFriendIds : groupMembers.filter(m => m !== currentUserId)).map(userId => {
                  const participant = getGroupExpenseParticipant(userId, groupMemberUsers, friends);
                  if (!participant) return null;
                  return (
                    <View key={userId} style={[styles.customSplitCard, {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    }]}>
                      <View style={[styles.customSplitAvatar, {
                        backgroundColor: settle.avatarUnselectedBackground,
                      }]}>
                        <ThemedText style={{ color: colors.text, fontWeight: '600' }}>
                          {participant.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                        {participant.name}
                      </ThemedText>
                      <TextInput
                        style={[styles.customSplitInput, {
                          backgroundColor: isDark ? '#05080e' : 'rgba(255,255,255,0.9)',
                          color: isDark ? '#fff' : colors.text,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }]}
                        value={splitMethod === SplitMethod.UNEQUAL ? customAmounts[userId] : splitMethod === SplitMethod.PERCENTAGE ? customPercentages[userId] : customShares[userId]}
                        onChangeText={(text) => {
                          if (splitMethod === SplitMethod.UNEQUAL) setCustomAmounts(prev => ({ ...prev, [userId]: normalizeCurrencyInput(text) }));
                          else if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(prev => ({ ...prev, [userId]: text }));
                          else setCustomShares(prev => ({ ...prev, [userId]: text }));
                        }}
                        placeholder="0"
                        placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                        keyboardType="decimal-pad"
                      />
                      <ThemedText style={[styles.customSplitSuffix, !isDark && { color: colors.textSecondary }]}>
                        {splitMethod === SplitMethod.UNEQUAL ? getCurrencySymbol(editFormQuery.data?.expense?.currency) : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                      </ThemedText>
                      {(splitMethod === SplitMethod.PERCENTAGE || splitMethod === SplitMethod.SHARES) && (() => {
                        const totalAmount = parseFloat(amount);
                        const userIds = splitType === SplitType.GROUP ? groupMembers : [currentUserId, ...selectedFriendIds];
                        let calculatedAmount = 0;
                        if (splitMethod === SplitMethod.PERCENTAGE) {
                          const percentage = parseFloat(customPercentages[userId] || '0');
                          calculatedAmount = (totalAmount * percentage) / 100;
                        } else {
                          const shares = parseFloat(customShares[userId] || '0');
                          const totalShares = userIds.reduce((sum, uid) => sum + parseFloat(customShares[uid] || '0'), 0);
                          calculatedAmount = totalShares > 0 ? (totalAmount * shares) / totalShares : 0;
                        }
                        return (
                          <ThemedText style={[styles.calculatedAmount, !isDark && { color: colors.textSecondary }]}>
                            {formatCurrency(calculatedAmount, editFormQuery.data?.expense?.currency)}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  content: {
    gap: 24,
  },
  amountSection: {
    gap: 8,
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
    textAlign: 'center',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '700',
  },
  amountInput: {
    minWidth: 50,
    fontSize: 48,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  inputSection: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
  },
  toggleSection: {
    gap: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleButtonActive: {},
  toggleButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  selectionSection: {
    gap: 0,
  },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginHorizontal: -18,
    gap: 14,
  },
  selectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  selectionCardText: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderRadius: 12,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 14,
    opacity: 0.6,
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
  splitMethodTextActive: {
    color: '#0A0A0F',
  },
  customSplitSection: {
    marginBottom: 16,
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
    opacity: 0.7,
  },
});
