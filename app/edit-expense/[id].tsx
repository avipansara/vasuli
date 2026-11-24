import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useAnalytics } from '@/contexts/analytics-context';
import { useCurrency } from '@/contexts/currency-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useRecurringExpenseRule } from '@/hooks/use-recurring-expense-queries';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import { groupService } from '@/services/group-service';
import { userService } from '@/services/user-service';
import { createExpenseUpdatedNotification, notificationService } from '@/services/notification-service';
import { queryKeys } from '@/services/query-keys';
import type { Expense, ExpenseSplit, User } from '@/types/database';
import { normalizeCurrencyInput } from '@/utils/validation';
import { getCurrencySymbol, normalizeBalance } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { dateOnlyToLocalDate, getExpenseDateUpdate } from '@/utils/expense-date';
import { getGroupExpenseParticipant } from '@/utils/group-expense-participants';
import { resolveExpenseSplits } from '@/utils/split-validation';
import { getSavedExpenseSplit, hasSameAllocation } from '@/utils/saved-expense-split';
import { trackExpenseUpdated } from '@/lib/analytics/track';
import { ExpenseSplitField } from '@/components/expenses/expense-split-field';
import type { ExpenseSplitDraft } from '@/components/expenses/expense-split-types';
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
  type TextInputInstance,
  TouchableOpacity,
  View,
} from 'react-native';

type HomeFriend = User & { balance: number; recentExpenses?: Expense[] };
type EditableSplit = Pick<ExpenseSplit, 'userId' | 'amount' | 'splitType' | 'percentage'>;

export default function EditExpenseScreen() {
  const { gradients, colors, settle, isDark, recurring } = useThemeColors();
  const { user } = useAuth();
  const { currency: preferredCurrency, currencySymbol } = useCurrency();
  const { service: analytics } = useAnalytics();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadedExpenseId = useRef<string | null>(null);
  const [editedSplit, setEditedSplit] = useState<ExpenseSplitDraft | null>(null);
  const [originalExpense, setOriginalExpense] = useState<Expense | null>(null);
  const [originalSplits, setOriginalSplits] = useState<ExpenseSplit[]>([]);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  // Input refs
  const amountInputRef = useRef<TextInputInstance>(null);
  const descriptionInputRef = useRef<TextInputInstance>(null);
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
      const savedPeople = await userService.getByIds([...new Set([expense.paidBy, ...splits.map(split => split.userId)])]);
      return { expense, groups, friends, splits, savedPeople };
    },
  });
  const selectedGroupId = originalExpense?.groupId ?? '';
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
  const groups = useMemo(() => editFormQuery.data?.groups ?? [], [editFormQuery.data?.groups]);
  const friends = useMemo(() => editFormQuery.data?.friends ?? [], [editFormQuery.data?.friends]);
  const recurringRuleId = editFormQuery.data?.expense?.recurringRuleId;
  const recurringRuleQuery = useRecurringExpenseRule(currentUserId, recurringRuleId ?? '');
  const groupMembers = useMemo(() => groupMembersQuery.data?.memberIds ?? [], [groupMembersQuery.data?.memberIds]);
  const groupMemberUsers = useMemo(() => groupMembersQuery.data?.memberUsers ?? [], [groupMembersQuery.data?.memberUsers]);
  const dataLoading = editFormQuery.isLoading;
  const loadError = editFormQuery.error;
  const groupMembersLoadError = groupMembersQuery.error;

  useEffect(() => {
    const formData = editFormQuery.data;
    if (!formData || formData.expense.id === loadedExpenseId.current) return;
    loadedExpenseId.current = formData.expense.id;

    if (formData.expense.deletedAt) {
      Alert.alert('Expense deleted', 'Deleted expenses cannot be edited or restored.');
      router.back();
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Query data hydrates the editable form state once the server record is available.
    setDescription(formData.expense.description);
    setAmount(formData.expense.amount.toString());
    setExpenseDate(formData.expense.effectiveDate
      ? dateOnlyToLocalDate(formData.expense.effectiveDate)
      : new Date(formData.expense.date));
    setOriginalExpense(formData.expense);
    setEditedSplit(null);
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

  const initialSplit = originalExpense && {
    payerId: originalExpense.paidBy,
    ...getSavedExpenseSplit(originalSplits),
  };
  const splitDraft = editedSplit ?? initialSplit;
  const total = parseFloat(amount) || 0;
  const unchangedSplit = total === originalExpense?.amount &&
    (!editedSplit || (!!initialSplit && hasSameAllocation(initialSplit, editedSplit)));
  const splits = unchangedSplit ? originalSplits : splitDraft && resolveExpenseSplits(
    splitDraft.participantIds, total, splitDraft.method,
    { amounts: splitDraft.values, percentages: splitDraft.values, shares: splitDraft.values },
  ).splits;
  const canSubmit = !!description.trim() && total > 0 && !!splits?.length;
  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const people = [...new Set([
    ...originalSplits.map(split => split.userId),
    ...(originalExpense ? [originalExpense.paidBy] : []),
    ...groupMembers,
  ])].map(personId => ({
    id: personId,
    name: personId === currentUserId ? 'You'
      : getGroupExpenseParticipant(personId, groupMemberUsers, friends)?.name
        ?? editFormQuery.data?.savedPeople.find(person => person.id === personId)?.name ?? 'Member',
  }));

  const getHomeBalanceDelta = useCallback((expense: Expense, splits: EditableSplit[], friendId: string) => {
    const currentUserSplit = splits.find(split => split.userId === currentUserId);
    const friendSplit = splits.find(split => split.userId === friendId);

    if (expense.paidBy === currentUserId) return friendSplit?.amount ?? 0;
    if (expense.paidBy === friendId) return -(currentUserSplit?.amount ?? 0);
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
          balance: normalizeBalance(nextBalance),
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

  const handleSubmit = async () => {
    if (!canSubmit || !originalExpense || !splitDraft || !splits || loading) return;

    setLoading(true);
    let previousHomeFriends: HomeFriend[] | undefined;
    let didOptimisticallyUpdate = false;
    try {
      const newAmount = parseFloat(amount);
      const trimmedDescription = description.trim();
      const dateChange = getExpenseDateUpdate(originalExpense, expenseDate);
      const updatedExpense: Expense = {
        ...originalExpense,
        description: trimmedDescription,
        amount: newAmount,
        ...dateChange,
        paidBy: splitDraft.payerId,
        updatedAt: Date.now(),
      };

      await queryClient.cancelQueries({ queryKey: friendsHomeQueryKey });
      previousHomeFriends = queryClient.getQueryData<HomeFriend[]>(friendsHomeQueryKey);
      updateHomeFriendsForEditedExpense(originalExpense, originalSplits, updatedExpense, splits);
      didOptimisticallyUpdate = true;
      router.back();

      await expenseService.update(id, {
        description: trimmedDescription,
        amount: newAmount,
        ...dateChange,
        ...(splitDraft.payerId !== originalExpense.paidBy ? { paidBy: splitDraft.payerId } : {}),
      }, unchangedSplit ? undefined : splits);
      trackExpenseUpdated(analytics, {
        groupId: updatedExpense.groupId,
        currency: updatedExpense.currency,
      });

      const affectedFriendIds = Array.from(new Set([
        originalExpense.paidBy,
        updatedExpense.paidBy,
        ...originalSplits.map(split => split.userId),
        ...splits.map(split => split.userId),
      ].filter(userId => userId !== currentUserId)));
      const affectedGroupIds = Array.from(new Set([
        originalExpense.groupId,
        updatedExpense.groupId,
      ].filter((groupId): groupId is string => !!groupId)));

      // Refresh visible surfaces before the slow side effects below so
      // updated balances and amounts appear without waiting on push
      // notifications.
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.list(currentUserId) }),
        ...(originalExpense.recurringRuleId
          ? [
            queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses.detail(currentUserId, originalExpense.recurringRuleId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses.occurrences(currentUserId, originalExpense.recurringRuleId) }),
          ]
          : []),
        ...affectedFriendIds.flatMap(friendId => [
          queryClient.invalidateQueries({ queryKey: queryKeys.friends.detail(currentUserId, friendId) }),
        ]),
        ...affectedGroupIds.flatMap(groupId => [
          queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(currentUserId, groupId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.groups.pairTotals(currentUserId, groupId) }),
        ]),
        queryClient.invalidateQueries({ queryKey: queryKeys.friends.detailScope(currentUserId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.list(currentUserId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity.listScope(currentUserId) }),
      ]);

      try {
        const group = selectedGroup;
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
        queryClient.invalidateQueries({ queryKey: queryKeys.activity.list(currentUserId) });

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
      />

      <KeyboardAwareScroll
        contentContainerStyle={styles.scrollContent}
        footer={(
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit || loading, busy: loading }}
              onPress={handleSubmit}
              disabled={!canSubmit || loading}
              testID="edit-expense-save-button"
              style={[
                styles.headerButton, styles.footerButton,
                {
                  backgroundColor: (canSubmit && !loading)
                    ? settle.buttonBackground
                    : (colors.border),
                },
              ]}>
              {loading ? (
                <ActivityIndicator size="small" color={settle.buttonText} />
              ) : (
                <ThemedText style={[styles.headerButtonText, { color: canSubmit ? settle.buttonText : (isDark ? '#bbcabf' : '#6B7280') }]}>
                  Save changes
                </ThemedText>
              )}
            </TouchableOpacity>
        )}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {editFormQuery.data?.expense?.recurringRuleId && (
            <View
              testID="edit-expense-recurring-banner"
              style={[
                styles.recurringNoticeBanner,
                {
                  backgroundColor: recurring.noticeBackground,
                  borderColor: recurring.noticeBorder,
                },
              ]}
            >
              <View style={styles.recurringNoticeHeader}>
                <IconSymbol name="info.circle" size={16} color={recurring.noticeText} />
                <ThemedText style={[styles.recurringNoticeTitle, { color: recurring.noticeText }]}>
                  Changes to this expense only
                </ThemedText>
              </View>
              <ThemedText style={[styles.recurringNoticeText, { color: colors.textSecondary }]}>
                Changes made here only apply to this single expense. Future scheduled expenses and rule templates will not be affected.
              </ThemedText>
              {recurringRuleQuery.data?.ownerId === currentUserId && recurringRuleId && (
                <TouchableOpacity
                  testID="edit-future-rule-from-expense-button"
                  accessibilityRole="button"
                  accessibilityLabel="Edit future recurring expenses"
                  onPress={() => router.push(`/recurring-expenses/edit/${recurringRuleId}` as any)}
                  style={[
                    styles.recurringNoticeAction,
                    {
                      backgroundColor: recurring.buttonBackground,
                      borderColor: recurring.buttonBorder,
                    },
                  ]}
                >
                  <ThemedText style={[styles.recurringNoticeActionText, { color: colors.tint }]}>
                    Edit future expenses
                  </ThemedText>
                  <IconSymbol name="chevron.right" size={12} color={colors.tint} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {!!selectedGroup && (
            <View style={[styles.context, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <IconSymbol name="person.3.fill" size={16} color={colors.tint} />
              <ThemedText>{selectedGroup.name}</ThemedText>
            </View>
          )}

          {/* Amount Input */}
          <View style={styles.amountSection}>
            <ThemedText style={[styles.amountLabel, !isDark && { color: colors.textSecondary }]}>
              How much?
            </ThemedText>
            <View style={styles.amountInputRow}>
              <Text style={[styles.currencySymbol, { color: settle.accentText }]}>{editFormQuery.data?.expense?.currency ? getCurrencySymbol(editFormQuery.data.expense.currency) : currencySymbol}</Text>
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
                testID="edit-expense-amount-input"
              />
            </View>
          </View>

          {/* Description Input */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
              What was it for?
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
                testID="edit-expense-description-input"
              />
            </View>
          </View>

          {selectedGroupId && groupMembersLoadError ? (
            <AsyncErrorState variant="compact" title="Couldn't load members"
              message={getFetchErrorMessage(groupMembersLoadError)} onRetry={() => void groupMembersQuery.refetch()} />
          ) : selectedGroupId && groupMembersQuery.isPending ? (
            <Skeleton height={64} borderRadius={12} />
          ) : splitDraft && originalExpense && (
            <ExpenseSplitField
              value={splitDraft}
              onApply={setEditedSplit}
              canEditPayer={originalExpense.createdBy === currentUserId}
              savedSplits={unchangedSplit ? originalSplits : undefined}
              group={!!selectedGroupId}
              people={people}
              currentUserId={currentUserId}
              amount={total}
              currency={originalExpense.currency ?? preferredCurrency}
              description={description}
              previous={{ payerId: originalExpense.paidBy, splits: originalSplits }}
            />
          )}

          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>Date</ThemedText>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Expense date, ${formatDate(expenseDate)}`}
              onPress={() => setShowDatePicker(current => !current)}
              style={[styles.inputContainer, {
                backgroundColor: colors.card,
                borderColor: colors.border,
              }]}>
              <IconSymbol name="calendar" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
              <ThemedText style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}>
                {formatDate(expenseDate)}
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

        </Animated.View>
      </KeyboardAwareScroll>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  footerButton: { minHeight: 48, justifyContent: 'center' },
  context: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 16, padding: 10 },
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
    paddingBottom: 115,
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
  recurringNoticeBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  recurringNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recurringNoticeTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  recurringNoticeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  recurringNoticeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  recurringNoticeActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
