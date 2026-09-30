import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useAnalytics } from '@/contexts/analytics-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { submitExpense } from '@/services/expense-intake';
import { expenseService } from '@/services/expense-service';
import { createRecurringExpenseSubmission, waitForRecurringOccurrence } from '@/services/recurring-expense-submission';
import { recurringExpenseService } from '@/services/recurring-expense-service';
import { groupService } from '@/services/group-service';
import { createExpenseNotification, notificationService } from '@/services/notification-service';
import {
  trackExpenseCreated,
  trackExpenseCreationFailed,
  trackExpenseStarted,
} from '@/lib/analytics/track';
import { createReactQueryCacheAdapter } from '@/services/query-cache-adapter';
import { queryKeys } from '@/services/query-keys';
import { userService } from '@/services/user-service';
import { useCurrency } from '@/contexts/currency-context';
import { useRecurringExpenseMutations } from '@/hooks/use-recurring-expense-mutations';
import { useRecurringExpenseRule } from '@/hooks/use-recurring-expense-queries';
import type { RecurringExpenseCadence, RecurringExpenseRuleInput } from '@/types/database';
import { formatDate } from '@/utils/date';
import { filterFriendsForExpenseSearch } from '@/utils/friend-search';
import { getGroupExpenseParticipant } from '@/utils/group-expense-participants';
import { getEvenSplitValues, getSplitProgress, resolveExpenseSplits } from '@/utils/split-validation';
import { normalizeCurrencyInput } from '@/utils/validation';
import { getInitialPostingState } from '@/utils/recurring-schedule';
import { getRecurringSplitFormValues } from '@/utils/recurring-edit-form';
import { getCurrencySymbol } from '@/utils/currency';
import {
  CustomSplitBreakdown,
  ExpenseParticipant,
  SplitMethod,
  SplitMethodSelector,
  SplitType,
} from '@/components/expenses';
import DateTimePicker from '@react-native-community/datetimepicker';
import NetInfo from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';


export default function AddExpenseScreen() {
  const { colors, recurring, settle, isDark } = useThemeColors();
  const { user } = useAuth();
  const { currency: preferredCurrency } = useCurrency();
  const { service: analytics } = useAnalytics();
  const { groupId: preselectedGroupId, friendId: preselectedFriendId, prefillRuleId } = useLocalSearchParams<{
    groupId?: string;
    friendId?: string;
    prefillRuleId?: string;
  }>();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const recurringMutations = useRecurringExpenseMutations(currentUserId);
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);

  const prefillRuleQuery = useRecurringExpenseRule(currentUserId, prefillRuleId || '');
  const prefillAppliedRef = useRef(false);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<string>(preferredCurrency);
  const formCurrencySymbol = getCurrencySymbol(formCurrency);
  const [expenseDate, setExpenseDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [repeatCadence, setRepeatCadence] = useState<'none' | RecurringExpenseCadence>('none');
  const [lastDueDate, setLastDueDate] = useState<Date | null>(null);
  const [showLastDuePicker, setShowLastDuePicker] = useState(false);
  const [showRecurringReview, setShowRecurringReview] = useState(false);
  const [recurringError, setRecurringError] = useState('');
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [postingCheckMessage, setPostingCheckMessage] = useState('');
  const recurringSaveLockRef = useRef(false);
  const [recurringSuccess, setRecurringSuccess] = useState<{ ruleId: string; state: string; cadence: RecurringExpenseCadence; nextDueOn?: string; scheduledFor: string } | null>(null);
  const [expenseStep, setExpenseStep] = useState<1 | 2>(preselectedGroupId || preselectedFriendId ? 2 : 1);
  const [splitType, setSplitType] = useState<SplitType>(preselectedFriendId ? SplitType.FRIENDS : (preselectedGroupId ? SplitType.GROUP : SplitType.GROUP));
  const [selectedGroupId, setSelectedGroupId] = useState(preselectedGroupId || '');
  const [prefilledGroupParticipants, setPrefilledGroupParticipants] = useState<{ groupId: string; participantIds: string[] } | null>(null);
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
  const [selectedPayerId, setSelectedPayerId] = useState(currentUserId);
  const [loading, setLoading] = useState(false);
  const dataLoading = groupsQuery.isLoading || friendsQuery.isLoading;
  const dataLoadError = groupsQuery.error || friendsQuery.error;
  const groupMemberIds = groupMembersQuery.data?.memberIds;
  const groupMembers = useMemo(() => groupMemberIds ?? [], [groupMemberIds]);
  const groupMemberUsers = useMemo(() => groupMembersQuery.data?.memberUsers ?? [], [groupMembersQuery.data?.memberUsers]);
  const groupMembersLoadError = groupMembersQuery.error;
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(SplitMethod.EQUAL);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [customPercentages, setCustomPercentages] = useState<Record<string, string>>({});
  const [customShares, setCustomShares] = useState<Record<string, string>>({});

  useEffect(() => {
    const rule = prefillRuleQuery.data;
    if (rule && !prefillAppliedRef.current) {
      prefillAppliedRef.current = true;
      setDescription(rule.description);
      setAmount(rule.amount.toString());
      setFormCurrency(rule.currency);
      setRepeatCadence(rule.cadence);
      setExpenseStep(2);
      if (rule.scopeType === 'group' && rule.groupId) {
        setSplitType(SplitType.GROUP);
        setSelectedGroupId(rule.groupId);
        setPrefilledGroupParticipants({ groupId: rule.groupId, participantIds: rule.participants.map(p => p.userId) });
      } else {
        setSplitType(SplitType.FRIENDS);
        const friendIds = rule.participants
          .map(p => p.userId)
          .filter(id => id !== currentUserId);
        setSelectedFriendIds(friendIds);
      }
      let method = SplitMethod.EQUAL;
      if (rule.splitMethod === 'unequal') method = SplitMethod.UNEQUAL;
      else if (rule.splitMethod === 'percentage') method = SplitMethod.PERCENTAGE;
      else if (rule.splitMethod === 'shares') method = SplitMethod.SHARES;
      setSplitMethod(method);

      const formValues = getRecurringSplitFormValues(rule.participants);
      setCustomAmounts(formValues.amounts);
      setCustomPercentages(formValues.percentages);
      setCustomShares(formValues.shares);
    }
  }, [prefillRuleQuery.data, currentUserId, preferredCurrency]);

  const activeUserIds = useMemo(
    () => splitType === SplitType.GROUP
      ? (prefilledGroupParticipants?.groupId === selectedGroupId ? prefilledGroupParticipants.participantIds : groupMembers)
      : [currentUserId, ...selectedFriendIds],
    [currentUserId, groupMembers, prefilledGroupParticipants, selectedFriendIds, selectedGroupId, splitType]
  );

  const participants = useMemo<ExpenseParticipant[]>(() => {
    const list: ExpenseParticipant[] = [];
    if (splitType === SplitType.FRIENDS) {
      activeUserIds.forEach(id => {
        if (id === currentUserId) { list.push({ id, name: 'You', isCurrentUser: true }); return; }
        const friend = friends.find(f => f.id === id);
        if (friend) list.push({ id, name: friend.name });
        else list.push({ id, name: 'Friend' });
      });
    } else {
      activeUserIds.forEach(id => {
        if (id === currentUserId) { list.push({ id, name: 'You', isCurrentUser: true }); return; }
        const member = getGroupExpenseParticipant(id, groupMemberUsers, friends);
        list.push({ id, name: member?.name || 'Member' });
      });
    }
    return list;
  }, [currentUserId, friends, groupMemberUsers, activeUserIds, splitType]);
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

  // One `expense started` per form attempt (mount): renders, focus changes,
  // validation retries, and picker returns do not start new attempts.
  const expenseStartedRef = useRef(false);
  useEffect(() => {
    if (dataLoading || dataLoadError || expenseStartedRef.current) return;
    expenseStartedRef.current = true;
    const groupId = splitType === SplitType.GROUP ? selectedGroupId || undefined : undefined;
    trackExpenseStarted(analytics, { groupId });
  }, [analytics, dataLoading, dataLoadError, selectedGroupId, splitType]);

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
  const isRecurring = repeatCadence !== 'none';
  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const selectedFriendNames = selectedFriendIds
    .map(friendId => friends.find(friend => friend.id === friendId)?.name)
    .filter((name): name is string => !!name);
  const payerOptions = useMemo(() => {
    const participants = splitType === SplitType.GROUP
      ? groupMemberUsers
      : friends.filter(friend => selectedFriendIds.includes(friend.id));
    return [{ id: currentUserId, name: user?.name || 'You' }, ...participants.filter(person => person.id !== currentUserId)];
  }, [currentUserId, friends, groupMemberUsers, selectedFriendIds, splitType, user?.name]);
  const activePayerId = payerOptions.some(person => person.id === selectedPayerId) ? selectedPayerId : currentUserId;
  const selectedPayerName = payerOptions.find(person => person.id === activePayerId)?.name || 'You';
  const formattedExpenseDate = formatDate(expenseDate);
  const formattedLastDueDate = lastDueDate ? formatDate(lastDueDate) : 'No end date';
  const localDateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const formatRecurringLocalDate = (date: string) => formatDate(new Date(`${date}T12:00:00`));
  const firstDueOn = localDateString(expenseDate);
  const recurringDatesValid = firstDueOn >= localDateString(new Date()) && (!lastDueDate || localDateString(lastDueDate) >= firstDueOn);
  const canSaveRecurring = !!canSubmit && activePayerId === currentUserId && recurringDatesValid && !recurringSuccess && !loading && !recurringSaving && !recurringMutations.create.isPending;
  const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const recurrencePostingState = isRecurring
    ? getInitialPostingState({ dueDate: firstDueOn, timeZone: resolvedTimeZone, createdAt: new Date() })
    : 'future';
  const resolvedRecurringSplits = resolveExpenseSplits(activeUserIds, parseFloat(amount) || 0, splitMethod, {
    amounts: customAmounts,
    percentages: customPercentages,
    shares: customShares,
  }).splits ?? [];
  const resolvedRecurringShares = activeUserIds.map(userId => {
    const split = resolvedRecurringSplits.find(item => item.userId === userId);
    return {
      userId,
      shareAmount: split?.amount ?? 0,
      ...(splitMethod === SplitMethod.PERCENTAGE ? { percentage: split?.percentage ?? 0 } : {}),
    };
  });
  const recurringSplitLabel = splitMethod === SplitMethod.EQUAL ? 'Split evenly' : splitMethod === SplitMethod.UNEQUAL ? 'Custom amounts' : splitMethod === SplitMethod.PERCENTAGE ? 'Percentage split' : 'Share-based split';
  const recurringScopeLabel = splitType === SplitType.GROUP ? selectedGroup?.name || 'Selected group' : selectedFriendNames.join(', ');
  const [recurringSubmission] = useState(() => createRecurringExpenseSubmission({
    isOnline: async () => (await NetInfo.fetch()).isConnected !== false,
    create: (rule, confirmDuplicate) => recurringMutations.create.mutateAsync({ rule, confirmDuplicate }),
  }));

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
    if (isRecurring) {
      if (canSaveRecurring) {
        Keyboard.dismiss();
        setShowDatePicker(false);
        setShowLastDuePicker(false);
        setShowRecurringReview(true);
      }
      return;
    }
    void handleSubmit();
  };

  const toRecurringRuleInput = (): RecurringExpenseRuleInput => ({
    scopeType: splitType === SplitType.GROUP ? 'group' : 'friends',
    ...(splitType === SplitType.GROUP ? { groupId: selectedGroupId } : {}),
    description: description.trim(),
    amount: Number(amount),
    currency: formCurrency,
    paidBy: currentUserId,
    splitMethod,
    splitType: splitMethod === SplitMethod.EQUAL ? 'equal' : splitMethod === SplitMethod.PERCENTAGE ? 'percentage' : 'exact',
    cadence: repeatCadence as RecurringExpenseCadence,
    anchorDay: repeatCadence === 'weekly' ? expenseDate.getDay() : expenseDate.getDate(),
    timeZone: resolvedTimeZone,
    firstDueOn,
    ...(lastDueDate ? { lastDueOn: localDateString(lastDueDate) } : {}),
    participants: resolvedRecurringShares,
  });

  const saveRecurring = async () => {
    if (recurringSaveLockRef.current) return;
    recurringSaveLockRef.current = true;
    setRecurringSaving(true);
    setRecurringError('');
    try {
      const outcome = await recurringSubmission.save(toRecurringRuleInput(), async () => new Promise(resolve => {
        Alert.alert(
          'Similar schedule found',
          'There is already a recurring expense with the same details and first due date. Inspect it before deciding whether to create another.',
          [
            { text: 'Inspect schedule', onPress: () => resolve('inspect') },
            { text: 'Create another', onPress: () => resolve('create_another') },
            { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
          ],
          { cancelable: true, onDismiss: () => resolve('cancel') },
        );
      }));
      if (outcome.status === 'offline') {
        setRecurringError('You appear to be offline. Reconnect to save this schedule.');
        return;
      }
      if (outcome.status === 'inspect') {
        setShowRecurringReview(false);
        router.push(`/recurring-expenses/${outcome.existingRuleId}` as never);
        return;
      }
      if (outcome.status !== 'created') return;
      const result = outcome.result;
      setRecurringSuccess({ ruleId: result.ruleId, state: recurrencePostingState !== 'future' ? 'Waiting to post' : 'Scheduled', cadence: repeatCadence as RecurringExpenseCadence, nextDueOn: result.nextDueOn, scheduledFor: firstDueOn });
      setPostingCheckMessage('');
      setShowRecurringReview(false);
    } catch (error) {
      setRecurringError(error instanceof Error && 'userMessage' in error
        ? String((error as Error & { userMessage: string }).userMessage)
        : 'Could not save this recurring expense. Check your connection and try again.');
    } finally {
      recurringSaveLockRef.current = false;
      setRecurringSaving(false);
    }
  };

  useEffect(() => {
    if (recurringSuccess?.state !== 'Waiting to post') return;
    let active = true;
    void waitForRecurringOccurrence(() => expenseService.hasRecurringOccurrence(recurringSuccess.ruleId, recurringSuccess.scheduledFor))
      .then(async posted => {
        if (active && posted) {
          let nextDueOn: string | undefined;
          let scheduleRefreshed = false;
          try {
            nextDueOn = (await recurringExpenseService.get(recurringSuccess.ruleId))?.nextDueOn;
            scheduleRefreshed = true;
          } catch {
            setPostingCheckMessage('The expense posted. The next due date could not be refreshed yet.');
          }
          setRecurringSuccess(current => current?.ruleId === recurringSuccess.ruleId ? { ...current, state: 'Posted automatically', nextDueOn } : current);
          if (scheduleRefreshed) setPostingCheckMessage('');
        } else if (active) {
          setPostingCheckMessage('Still waiting for the server to confirm this expense.');
        }
      })
      .catch(() => {
        if (active) setPostingCheckMessage('Could not confirm posting right now. The schedule is saved; try again from Recurring expenses.');
      });
    return () => { active = false; };
  }, [recurringSuccess?.ruleId, recurringSuccess?.scheduledFor, recurringSuccess?.state]);

  const handleSubmit = async () => {
    if (!isValid) return;

    setLoading(true);
    try {
      const amountNum = parseFloat(amount);
      const trimmedDescription = description.trim();
      let participantIds: string[];

      if (splitType === SplitType.GROUP) {
        participantIds = groupMembers;
        if (participantIds.length === 0) {
          const members = await groupService.getMembers(selectedGroupId);
          participantIds = members.map(member => member.userId);
        }
      } else {
        participantIds = [currentUserId, ...selectedFriendIds];
      }

      const splits = calculateSplits(participantIds, amountNum);
      if (!splits) return;

      const isGroup = splitType === SplitType.GROUP;
      const group = groups.find(item => item.id === selectedGroupId);
      const friendDetailKeys = selectedFriendIds.map(friendId => queryKeys.friends.detail(currentUserId, friendId));
      const keys = {
        home: friendsHomeQueryKey,
        groupDetail: isGroup ? queryKeys.groups.detail(currentUserId, selectedGroupId) : undefined,
        groupPairTotals: isGroup ? queryKeys.groups.pairTotals(currentUserId, selectedGroupId) : undefined,
        friendDetails: isGroup ? [] : friendDetailKeys,
        groups: queryKeys.groups.list(currentUserId),
        expenses: queryKeys.expenses.list(currentUserId),
        activity: queryKeys.activity.list(currentUserId),
      };

      await submitExpense({
        target: isGroup
          ? { kind: 'group', groupId: selectedGroupId, memberIds: participantIds }
          : { kind: 'friends', friendIds: selectedFriendIds },
        description: trimmedDescription,
        amount: amountNum,
        currency: formCurrency,
        date: expenseDate.getTime(),
        payerId: activePayerId,
        currentUserId,
        currentUser: user!,
        splits,
        group,
        cache: createReactQueryCacheAdapter(queryClient),
        keys,
        save: (expense, expenseSplits) => expenseService.create(expense, expenseSplits),
        navigateBack: () => router.back(),
        logActivity: async ({ expense, userName, groupName }) => {
          await activityService.logExpenseCreated({
            expenseId: expense.id,
            userId: currentUserId,
            userName,
            description: expense.description,
            amount: expense.amount,
            groupId: expense.groupId,
            groupName,
          });
        },
        sendNotifications: async ({ expense, groupName }) => {
          const usersToNotify = await userService.getByIds(
            participantIds.filter(participantId => participantId !== currentUserId)
          );
          const pushTokens = usersToNotify
            .filter(item => item.pushToken)
            .map(item => item.pushToken!);
          if (pushTokens.length === 0) return;

          const notification = createExpenseNotification(
            expense.id,
            expense.description,
            expense.amount,
            selectedPayerName,
            groupName,
            expense.groupId
          );
          await notificationService.sendNotificationToUsers(pushTokens, notification);
        },
        warn: error => console.warn('Expense follow-up failed:', error),
      });

      trackExpenseCreated(analytics, {
        groupId: isGroup ? selectedGroupId : undefined,
        memberCount: participantIds.length || undefined,
        currency: formCurrency,
      });
    } catch (error) {
      console.error('Error creating expense:', error);
      trackExpenseCreationFailed(analytics, {
        groupId: splitType === SplitType.GROUP ? selectedGroupId || undefined : undefined,
        error,
      });
      Alert.alert('Error', 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  }
  const calculateSplits = (userIds: string[], totalAmount: number) => {
    const result = resolveExpenseSplits(userIds, totalAmount, splitMethod, {
      amounts: customAmounts,
      percentages: customPercentages,
      shares: customShares,
    });

    if (!result.splits) {
      Alert.alert('Invalid Split', result.error || 'Please check the split values');
      return null;
    }

    return result.splits;
  };

  if (dataLoadError && !dataLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NavigationHeader
        title={expenseStep === 1 ? 'Choose people' : 'Add Expense'}
        onBack={handleHeaderBack}
        rightAction={
          <TouchableOpacity
            testID={expenseStep === 1 ? 'add-expense-next-button' : 'add-expense-submit-button'}
            accessibilityRole="button"
            accessibilityLabel={recurringSuccess ? 'Recurring expense saved' : expenseStep === 1 ? 'Continue to expense details' : isRecurring ? 'Review recurring expense' : 'Add expense'}
            accessibilityState={{ disabled: !!recurringSuccess || (expenseStep === 1 ? !canContinue : isRecurring ? !canSaveRecurring : !canSubmit || loading), busy: loading || recurringSaving || recurringMutations.create.isPending }}
            onPress={handleHeaderAction}
            disabled={!!recurringSuccess || (expenseStep === 1 ? !canContinue : isRecurring ? !canSaveRecurring : !canSubmit || loading)}
            style={[
              styles.headerButton,
              {
                backgroundColor: (!recurringSuccess && (expenseStep === 1 ? canContinue : isRecurring ? canSaveRecurring : canSubmit && !loading))
                  ? settle.buttonBackground
                  : (colors.border),
              },
            ]}>
            {loading || recurringSaving || recurringMutations.create.isPending ? (
              <ActivityIndicator size="small" color={settle.buttonText} />
            ) : (
              <ThemedText style={[styles.headerButtonText, { color: (!recurringSuccess && (expenseStep === 1 ? canContinue : isRecurring ? canSaveRecurring : canSubmit)) ? settle.buttonText : (isDark ? '#bbcabf' : '#6B7280') }]}>
                {recurringSuccess ? 'Saved' : expenseStep === 1 ? 'Next' : isRecurring ? 'Review' : 'Add'}
              </ThemedText>
            )}
          </TouchableOpacity>
        }
      />

      {!preselectedGroupId && !preselectedFriendId && (
        <View style={styles.stepIndicator} accessibilityLabel={`Step ${expenseStep} of 2`}>
          <View style={styles.stepperRow}>
            <View style={styles.stepItem}>
              <View style={[styles.stepBadge, { backgroundColor: settle.buttonBackground }]}>
                {expenseStep === 2 ? (
                  <IconSymbol name="checkmark" size={14} color={settle.buttonText} />
                ) : (
                  <ThemedText style={[styles.stepBadgeText, { color: settle.buttonText }]}>1</ThemedText>
                )}
              </View>
              <ThemedText style={[styles.stepName, { color: settle.buttonBackground }]}>People</ThemedText>
            </View>
            <View style={[styles.stepLine, { backgroundColor: expenseStep === 2 ? (settle.buttonBackground) : (isDark ? 'rgba(60, 74, 66, 0.4)' : colors.border) }]} />
            <View style={styles.stepItem}>
              <View style={[styles.stepBadge, { backgroundColor: expenseStep === 2 ? (settle.buttonBackground) : (colors.border) }]}>
                <ThemedText style={[styles.stepBadgeText, { color: expenseStep === 2 ? settle.buttonText : (colors.textSecondary) }]}>2</ThemedText>
              </View>
              <ThemedText style={[styles.stepName, { color: expenseStep === 2 ? (colors.text) : (colors.textSecondary) }]}>Split</ThemedText>
            </View>
          </View>
        </View>
      )}

      <KeyboardAwareScroll
        testID="expense-form-scroll"
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {recurringSuccess ? (
            <View style={[styles.recurringSuccess, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="summary">
              <ThemedText style={[styles.recurringSuccessTitle, { color: colors.text }]}>{recurringSuccess.state}</ThemedText>
              <ThemedText style={{ color: colors.textSecondary }}>
                {recurringSuccess.state === 'Posted automatically'
                  ? `First expense posted for ${formatRecurringLocalDate(recurringSuccess.scheduledFor)}. `
                  : recurringSuccess.state === 'Waiting to post'
                    ? `First expense is due ${formatRecurringLocalDate(recurringSuccess.scheduledFor)}. `
                    : recurringSuccess.nextDueOn ? `Next expense due ${formatRecurringLocalDate(recurringSuccess.nextDueOn)}. ` : ''}
                {recurringSuccess.state === 'Waiting to post' ? 'Waiting for the server to post it. ' : ''}
                {recurringSuccess.state === 'Posted automatically' && recurringSuccess.nextDueOn ? `Next expense due ${formatRecurringLocalDate(recurringSuccess.nextDueOn)}. ` : ''}
                Your {recurringSuccess.cadence} expense is saved.
              </ThemedText>
              {!!postingCheckMessage && <ThemedText accessibilityRole="alert" style={{ color: colors.textSecondary }}>{postingCheckMessage}</ThemedText>}
              <TouchableOpacity accessibilityRole="link" accessibilityLabel="View recurring expenses" onPress={() => router.push('/recurring-expenses' as never)} style={styles.recurringListLink}>
                <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>View recurring expenses</ThemedText>
                <IconSymbol name="chevron.right" size={14} color={colors.tint} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
          {expenseStep === 2 && (
            <>
              <View style={[styles.participantSummary, {
                backgroundColor: colors.card,
                borderColor: colors.border,
              }]}>
                <View style={[styles.participantSummaryIcon, { backgroundColor: isDark ? '#222a3d' : 'rgba(34, 197, 94, 0.1)' }]}>
                  <IconSymbol
                    name={splitType === SplitType.GROUP ? 'person.3.fill' : 'person.2.fill'}
                    size={18}
                    color={isDark ? '#4edea3' : colors.tint}
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
              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Paid by</ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerOptionsContainer}>
                  {payerOptions.map(payer => {
                    const isSelected = payer.id === activePayerId;
                    return (
                      <TouchableOpacity
                        key={payer.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Paid by ${payer.id === currentUserId ? 'you' : payer.name}`}
                        style={[styles.payerButton, isSelected && styles.payerButtonActive, {
                          backgroundColor: isSelected ? (settle.buttonBackground) : settle.pillBackground,
                          borderColor: isSelected ? (settle.buttonBackground) : settle.pillBackground,
                        }]}
                        onPress={() => setSelectedPayerId(payer.id)}>
                        <ThemedText style={[styles.payerButtonText, { color: isSelected ? settle.buttonText : (colors.text) }]}>
                          {payer.id === currentUserId ? 'You' : payer.name}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              {/* Amount Input - Hero Style */}
              <View style={styles.amountSection}>
                <View
                  style={[
                    styles.amountCard,
                    {
                      backgroundColor: settle.heroBackground,
                      borderColor: settle.heroBorder,
                    },
                  ]}>
                  <View style={styles.amountHeader}>
                    <ThemedText style={[styles.amountLabel, { color: colors.textSecondary }]}>
                      Amount
                    </ThemedText>
                  </View>
                  <View style={styles.amountInputRow}>
                    <Text style={[styles.currencySymbol, { color: settle.accentText }]}>{formCurrencySymbol}</Text>
                    <TextInput
                      ref={amountInputRef}
                      style={[styles.amountInput, { color: settle.accentText }]}
                      value={amount}
                      onChangeText={(text) => setAmount(normalizeCurrencyInput(text))}
                      placeholder="0.00"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                      maxFontSizeMultiplier={1.4}
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
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }]}>
                  <IconSymbol name="doc.text" size={20} color={colors.textSecondary} />
                  <TextInput
                    ref={descriptionInputRef}
                    style={[styles.textInput, { color: colors.text }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Dinner, Groceries, Uber..."
                    placeholderTextColor={colors.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    testID="expense-description-input"
                  />
                </View>
              </View>

              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>{isRecurring ? 'First expense date' : 'Date'}</ThemedText>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${isRecurring ? 'First expense date' : 'Expense date'}, ${formattedExpenseDate}`}
                  onPress={() => setShowDatePicker(current => !current)}
                  style={[styles.inputContainer, {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  }]}>
                  <IconSymbol name="calendar" size={20} color={colors.textSecondary} />
                  <ThemedText style={[styles.textInput, { color: colors.text }]}>{formattedExpenseDate}</ThemedText>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    testID="expense-date-picker"
                    value={expenseDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onValueChange={(_, selectedDate) => {
                      if (Platform.OS !== 'ios') setShowDatePicker(false);
                      setExpenseDate(selectedDate);
                    }}
                    onDismiss={() => setShowDatePicker(false)}
                  />
                )}
              </View>

              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Repeat</ThemedText>
                <View style={[styles.repeatOptions, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="radiogroup" accessibilityLabel="Repeat schedule">
                  {([
                    { value: 'none', label: 'Does not repeat' },
                    { value: 'weekly', label: 'Every week' },
                    { value: 'monthly', label: 'Every month' },
                  ] as const).map(option => {
                    const selected = repeatCadence === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={option.label}
                        testID={`expense-repeat-${option.value}`}
                        onPress={() => { setRepeatCadence(option.value); setRecurringError(''); setRecurringSuccess(null); }}
                        style={[styles.repeatOption, { backgroundColor: selected ? settle.buttonBackground : 'transparent' }]}>
                        <ThemedText style={{ color: selected ? settle.buttonText : colors.text, fontWeight: selected ? '700' : '500' }}>
                          {option.label}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {isRecurring && (
                  <View style={[styles.recurringConfigCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {/* Schedule Info Box */}
                    <View style={[styles.recurringInfoBanner, { backgroundColor: recurring.noticeBackground, borderColor: colors.border }]}>
                      <View style={[styles.recurringIconBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : '#FFFFFF' }]}>
                        <IconSymbol name="arrow.trianglehead.2.clockwise" size={16} color={colors.tint} />
                      </View>
                      <View style={styles.recurringInfoContent}>
                        <ThemedText style={[styles.recurringInfoTitle, { color: colors.text }]}>
                          {repeatCadence === 'weekly' ? 'Weekly schedule' : 'Monthly schedule'}
                        </ThemedText>
                        <ThemedText style={[styles.recurringInfoSubtext, { color: colors.textSecondary }]}>
                          First expense on {formattedExpenseDate} · Auto-added around 9:00 a.m. ({resolvedTimeZone})
                        </ThemedText>
                      </View>
                    </View>

                    {/* End Date Field */}
                    <View style={styles.recurringFieldGroup}>
                      <View style={styles.recurringFieldHeader}>
                        <ThemedText style={[styles.recurringFieldLabel, { color: colors.text }]}>
                          End date
                        </ThemedText>
                        <ThemedText style={[styles.recurringFieldOptional, { color: colors.textSecondary }]}>
                          Optional
                        </ThemedText>
                      </View>

                      <View style={[styles.recurringDateRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: colors.border }]}>
                        <IconSymbol name="calendar" size={18} color={colors.textSecondary} />
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={lastDueDate ? `End date, last eligible date ${formattedLastDueDate}` : 'End date optional, no end date selected'}
                          onPress={() => setShowLastDuePicker(current => !current)}
                          style={styles.endDateButton}>
                          <ThemedText style={[styles.endDateText, { color: lastDueDate ? colors.text : colors.textSecondary }]}>
                            {lastDueDate ? formattedLastDueDate : 'No end date (repeats indefinitely)'}
                          </ThemedText>
                        </TouchableOpacity>
                        {lastDueDate && (
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Remove end date"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => setLastDueDate(null)}
                            style={styles.clearEndDate}>
                            <IconSymbol name="xmark.circle.fill" size={18} color={colors.textSecondary} />
                          </TouchableOpacity>
                        )}
                      </View>

                      <ThemedText style={[styles.recurringFieldHint, { color: colors.textSecondary }]}>
                        {lastDueDate
                          ? `Schedule cutoff. No expenses will be added after this date.`
                          : 'Expenses will post automatically until you pause or stop them.'}
                      </ThemedText>
                    </View>

                    {showLastDuePicker && (
                      <DateTimePicker
                        testID="expense-last-due-picker"
                        value={lastDueDate || expenseDate}
                        minimumDate={expenseDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onValueChange={(_, selectedDate) => {
                          if (Platform.OS !== 'ios') setShowLastDuePicker(false);
                          if (selectedDate) setLastDueDate(selectedDate);
                        }}
                        onDismiss={() => setShowLastDuePicker(false)}
                      />
                    )}

                    {/* Alerts / Validation */}
                    {activePayerId !== currentUserId && (
                      <View style={[styles.recurringAlertBanner, { backgroundColor: recurring.pausedBannerBackground, borderColor: recurring.pausedBannerBorder }]}>
                        <IconSymbol name="exclamationmark.triangle" size={16} color={recurring.paused} />
                        <ThemedText style={[styles.recurringAlertBannerText, { color: recurring.pausedText }]}>
                          Choose You as the payer before saving a recurring expense.
                        </ThemedText>
                      </View>
                    )}
                    {firstDueOn < localDateString(new Date()) && (
                      <View style={[styles.recurringAlertBanner, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)', borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)' }]}>
                        <IconSymbol name="exclamationmark.circle" size={16} color={colors.error} />
                        <ThemedText accessibilityRole="alert" style={[styles.recurringAlertBannerText, { color: colors.error }]}>
                          A recurring expense must start today or later.
                        </ThemedText>
                      </View>
                    )}
                    {lastDueDate && localDateString(lastDueDate) < firstDueOn && (
                      <View style={[styles.recurringAlertBanner, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)', borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)' }]}>
                        <IconSymbol name="exclamationmark.circle" size={16} color={colors.error} />
                        <ThemedText accessibilityRole="alert" style={[styles.recurringAlertBannerText, { color: colors.error }]}>
                          The last due date must be on or after the first expense.
                        </ThemedText>
                      </View>
                    )}
                    {!!recurringError && (
                      <View style={[styles.recurringAlertBanner, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)', borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)' }]}>
                        <IconSymbol name="exclamationmark.circle" size={16} color={colors.error} />
                        <ThemedText accessibilityRole="alert" style={[styles.recurringAlertBannerText, { color: colors.error }]}>
                          {recurringError}
                        </ThemedText>
                      </View>
                    )}
                  </View>
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
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: splitType === SplitType.GROUP }}
                  style={[
                    styles.toggleButton,
                    {
                      backgroundColor: splitType === SplitType.GROUP
                        ? (settle.buttonBackground)
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
                    color={splitType === SplitType.GROUP ? settle.buttonText : (colors.textSecondary)}
                  />
                  <Text style={[
                    styles.toggleText,
                    { color: splitType === SplitType.GROUP ? settle.buttonText : (colors.textSecondary) },
                  ]}>
                    Group
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: splitType === SplitType.FRIENDS }}
                  style={[
                    styles.toggleButton,
                    {
                      backgroundColor: splitType === SplitType.FRIENDS
                        ? (settle.buttonBackground)
                        : 'transparent',
                    },
                  ]}
                  onPress={() => setSplitType(SplitType.FRIENDS)}>
                  <IconSymbol
                    name="person.2.fill"
                    size={17}
                    color={splitType === SplitType.FRIENDS ? settle.buttonText : (colors.textSecondary)}
                  />
                  <Text style={[
                    styles.toggleText,
                    { color: splitType === SplitType.FRIENDS ? settle.buttonText : (colors.textSecondary) },
                  ]}>
                    Friends
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {expenseStep === 2 && (
            <>

              {/* Split Method Selection */}
              <SplitMethodSelector
                splitMethod={splitMethod}
                onSelectSplitMethod={setSplitMethod}
                splitType={splitType}
              />

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
                <View style={{ gap: 12 }}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 14 }}>
                      <Skeleton width={44} height={44} borderRadius={22} />
                      <Skeleton width={150} height={16} />
                    </View>
                  ))}
                </View>
              ) : splitType === SplitType.GROUP ? (
                <View style={styles.optionsList}>
                  {groups.length === 0 ? (
                    <View style={styles.emptyState}>
                      <IconSymbol name="person.3" size={32} color={colors.textSecondary} />
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
                          accessibilityLabel={`Select group ${group.name}`}
                          style={[
                            styles.optionRow
                          ]}
                          onPress={() => !preselectedGroupId && setSelectedGroupId(group.id)}
                          disabled={!!preselectedGroupId}>
                          <View style={[styles.optionIcon, {
                            backgroundColor: selectedGroupId === group.id
                              ? (settle.buttonBackground)
                              : (settle.avatarUnselectedBackground),
                          }]}>
                            <IconSymbol
                              name="person.3.fill"
                              size={20}
                              color={selectedGroupId === group.id ? settle.buttonText : (colors.text)}
                            />
                          </View>
                          <View style={styles.optionTextContainer}>
                            <Text style={[styles.optionText, { color: selectedGroupId === group.id ? (settle.buttonBackground) : (colors.text) }]}>
                              {group.name}
                            </Text>
                          </View>
                          {selectedGroupId === group.id && (
                            <IconSymbol name="checkmark.circle.fill" size={22} color={settle.buttonBackground} />
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
                      <IconSymbol name="person.2" size={32} color={colors.textSecondary} />
                      <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                        No friends yet
                      </ThemedText>
                    </View>
                  ) : (
                    <>
                      {!preselectedFriendId && (
                        <View style={[styles.searchContainer, {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        }]}>
                          <IconSymbol name="magnifyingglass" size={18} color={colors.textSecondary} />
                          <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            value={friendSearchQuery}
                            onChangeText={setFriendSearchQuery}
                            placeholder={`Search ${friends.length} friends`}
                            placeholderTextColor={colors.textSecondary}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="search"
                          />
                          {friendSearchQuery.length > 0 && (
                            <TouchableOpacity
                              accessibilityLabel="Clear friend search"
                              onPress={() => setFriendSearchQuery('')}
                              style={styles.clearSearchButton}>
                              <IconSymbol name="xmark.circle.fill" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      {visibleFriends.length === 0 ? (
                        <View style={styles.emptyState}>
                          <IconSymbol name="magnifyingglass" size={32} color={colors.textSecondary} />
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
                                  styles.optionRow,
                                ]}
                                onPress={() => !preselectedFriendId && toggleFriend(friend.id)}
                                disabled={!!preselectedFriendId}>
                                <View style={[styles.optionAvatar, {
                                  backgroundColor: isSelected
                                    ? (settle.buttonBackground)
                                    : (settle.avatarUnselectedBackground),
                                }]}>
                                  <Text style={[styles.avatarText, {
                                    color: isSelected ? settle.buttonText : (colors.text),
                                  }]}>
                                    {friend.name.charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                                <View style={styles.optionTextContainer}>
                                  <Text style={[styles.optionText, { color: isSelected ? (settle.buttonBackground) : (colors.text) }]}>
                                    {friend.name}
                                  </Text>
                                  {friend.email && (
                                    <Text style={[styles.optionSubtext, { color: isDark ? '#6B7280' : colors.textSecondary }]}>
                                      {friend.email}
                                    </Text>
                                  )}
                                </View>
                                {
                                  isSelected && (
                                    <IconSymbol name="checkmark.circle.fill" size={22} color={settle.buttonBackground} />
                                  )
                                }
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
          {expenseStep === 2 && splitMethod !== SplitMethod.EQUAL && (splitType === SplitType.FRIENDS ? selectedFriendIds.length > 0 : !!selectedGroupId) && !!amount && parseFloat(amount) > 0 && (
            <CustomSplitBreakdown
              splitMethod={splitMethod}
              totalAmount={parseFloat(amount) || 0}
              currency={formCurrency}
              participants={participants}
              customAmounts={customAmounts}
              customPercentages={customPercentages}
              customShares={customShares}
              onChangeCustomAmount={(id, text) => setCustomAmounts(prev => ({ ...prev, [id]: text }))}
              onChangeCustomPercentage={(id, text) => setCustomPercentages(prev => ({ ...prev, [id]: text }))}
              onChangeCustomShare={(id, text) => setCustomShares(prev => ({ ...prev, [id]: text }))}
              splitProgress={splitProgress}
              onSetEvenSplit={setEvenSplit}
              readyLabel="Ready to add"
            />
          )}
            </>
          )}
        </Animated.View>
      </KeyboardAwareScroll>

      <Modal
        visible={showRecurringReview}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => setShowRecurringReview(false)}>
        <View style={styles.reviewBackdrop}>
          <SafeAreaView testID="recurring-expense-review-sheet" edges={['bottom']} style={[styles.reviewSheet, { backgroundColor: colors.modalBackground, borderColor: colors.border }]}>
            <ScrollView
              testID="recurring-review-scroll"
              style={styles.reviewBody}
              contentContainerStyle={styles.reviewBodyContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag">
              <View style={styles.reviewHandle} />
              <ThemedText style={[styles.reviewTitle, { color: colors.text }]}>Review recurring expense</ThemedText>
              <ThemedText style={[styles.reviewDescription, { color: colors.text }]}>{description.trim()} · {formCurrencySymbol}{Number(amount || 0).toFixed(2)}</ThemedText>
              <ThemedText style={[styles.reviewMeta, { color: colors.textSecondary }]}>{recurringScopeLabel} · {recurringSplitLabel}</ThemedText>
              <ThemedText style={[styles.reviewMeta, { color: colors.textSecondary }]}>{repeatCadence === 'weekly' ? 'Every week' : 'Every month'} · Start date {formattedExpenseDate}</ThemedText>
              <ThemedText style={[styles.reviewMeta, { color: colors.textSecondary }]}>{lastDueDate ? `End date ${formattedLastDueDate}` : 'End date: No end date'} · Paid by You</ThemedText>
              <ThemedText style={[styles.reviewMeta, { color: colors.textSecondary }]}>Around 9:00 a.m. in {resolvedTimeZone}</ThemedText>
              <ThemedText style={[styles.reviewSectionLabel, { color: colors.textSecondary }]}>Participants and shares</ThemedText>
              <View style={styles.reviewParticipants}>
                {participants.map(participant => {
                  const share = resolvedRecurringShares.find(item => item.userId === participant.id);
                  return <View key={participant.id} style={styles.reviewParticipantRow}>
                    <ThemedText style={{ color: colors.text, flex: 1 }}>{participant.name}</ThemedText>
                    <ThemedText style={{ color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 }}>{formCurrencySymbol}{(share?.shareAmount || 0).toFixed(2)}{share?.percentage !== undefined ? ` · ${share.percentage}%` : ''}</ThemedText>
                  </View>;
                })}
              </View>
              <View testID="recurring-payment-warning" style={[styles.automaticWarning, { backgroundColor: colors.infoSurface, borderColor: colors.border }]}>
                <ThemedText style={{ color: colors.text }}>Vasuli will add this expense automatically on each due date. It cannot verify that you paid the bill.</ThemedText>
              </View>
              {recurrencePostingState !== 'future' && <ThemedText style={[styles.recurrenceNotice, { color: colors.textSecondary }]}>This expense is due today and will show Waiting to post until the server confirms it.</ThemedText>}
              {!!recurringError && <ThemedText accessibilityRole="alert" style={[styles.recurrenceNotice, { color: colors.error }]}>{recurringError}</ThemedText>}
            </ScrollView>
            <View style={[styles.reviewActions, { backgroundColor: colors.modalBackground, borderTopColor: colors.border }]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSaveRecurring, busy: recurringSaving || recurringMutations.create.isPending }}
                testID="save-recurring-expense-button"
                disabled={!canSaveRecurring || recurringSaving || recurringMutations.create.isPending}
                onPress={() => void saveRecurring()}
                style={[styles.reviewPrimaryButton, { backgroundColor: canSaveRecurring ? settle.buttonBackground : colors.border }]}>
                {recurringSaving || recurringMutations.create.isPending ? <ActivityIndicator color={settle.buttonText} /> : <ThemedText style={{ color: canSaveRecurring ? settle.buttonText : colors.textSecondary, fontWeight: '700' }}>Save recurring expense</ThemedText>}
              </TouchableOpacity>
              <TouchableOpacity testID="recurring-review-cancel" accessibilityRole="button" onPress={() => setShowRecurringReview(false)} style={styles.reviewCancelButton}>
                <ThemedText style={{ color: colors.textSecondary, fontWeight: '600' }}>Back to expense</ThemedText>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View >
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
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
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
  repeatOptions: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  repeatOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  recurringConfigCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  recurringInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  recurringIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recurringInfoContent: {
    flex: 1,
    gap: 2,
  },
  recurringInfoTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  recurringInfoSubtext: {
    fontSize: 12,
    lineHeight: 16,
  },
  recurringFieldGroup: {
    gap: 6,
  },
  recurringFieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recurringFieldLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  recurringFieldOptional: {
    fontSize: 12,
    lineHeight: 16,
  },
  recurringDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  endDateButton: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  endDateText: {
    fontSize: 15,
    lineHeight: 20,
  },
  clearEndDate: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurringFieldHint: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  recurringAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  recurringAlertBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  recurrenceHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  recurrenceNotice: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  lastDueRow: {
    marginTop: 12,
    marginBottom: 2,
    minHeight: 52,
    paddingVertical: 4,
  },
  recurringSuccess: {
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderRadius: 16,
    gap: 6,
  },
  recurringSuccessTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  recurringListLink: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 4,
    marginTop: 2,
  },
  reviewBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  reviewSheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    flexShrink: 1,
    maxHeight: '94%',
  },
  reviewBody: {
    flexGrow: 1,
    flexShrink: 1,
  },
  reviewBodyContent: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 16,
  },
  reviewActions: {
    flexShrink: 0,
    borderTopWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 4,
  },
  reviewHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.5)',
    marginBottom: 14,
  },
  reviewTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  reviewDescription: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  reviewMeta: {
    fontSize: 14,
    lineHeight: 19,
    marginTop: 4,
  },
  reviewSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 4,
  },
  reviewParticipants: {
    gap: 2,
  },
  reviewParticipantRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },
  automaticWarning: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  reviewPrimaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  reviewCancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
  payerOptionsContainer: {
    gap: 8,
    paddingRight: 18,
  },
  payerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 44,
    minWidth: 80,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  payerButtonActive: {
    borderWidth: 1.5,
  },
  payerButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
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
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginHorizontal: -18,
    gap: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionAvatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  optionTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  optionSubtext: {
    fontSize: 13,
    marginTop: 2,
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
