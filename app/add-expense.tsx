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
import { submitExpense } from '@/services/expense-intake';
import { expenseService } from '@/services/expense-service';
import { groupService } from '@/services/group-service';
import { createExpenseNotification, notificationService } from '@/services/notification-service';
import { createReactQueryCacheAdapter } from '@/services/query-cache-adapter';
import { queryKeys } from '@/services/query-keys';
import { userService } from '@/services/user-service';
import { filterFriendsForExpenseSearch } from '@/utils/friend-search';
import { getGroupExpenseParticipant } from '@/utils/group-expense-participants';
import { calculateExpenseSplits, getEvenSplitValues, getSplitProgress } from '@/utils/split-validation';
import { normalizeCurrencyInput } from '@/utils/validation';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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


export default function AddExpenseScreen() {
  const { gradients, colors, settle, isDark } = useThemeColors();
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
  const [selectedPayerId, setSelectedPayerId] = useState(currentUserId);
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
  const payerOptions = useMemo(() => {
    const participants = splitType === SplitType.GROUP
      ? groupMemberUsers
      : friends.filter(friend => selectedFriendIds.includes(friend.id));
    return [{ id: currentUserId, name: user?.name || 'You' }, ...participants.filter(person => person.id !== currentUserId)];
  }, [currentUserId, friends, groupMemberUsers, selectedFriendIds, splitType, user?.name]);
  const selectedPayerName = payerOptions.find(person => person.id === selectedPayerId)?.name || 'You';

  useEffect(() => {
    if (!payerOptions.some(person => person.id === selectedPayerId)) setSelectedPayerId(currentUserId);
  }, [currentUserId, payerOptions, selectedPayerId]);
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
        currency: 'USD',
        date: expenseDate.getTime(),
        payerId: selectedPayerId,
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
    } catch (error) {
      console.error('Error creating expense:', error);
      Alert.alert('Error', 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  }
  const calculateSplits = (userIds: string[], totalAmount: number) => {
    const values = splitMethod === SplitMethod.UNEQUAL
      ? customAmounts
      : splitMethod === SplitMethod.PERCENTAGE
        ? customPercentages
        : customShares;
    const result = calculateExpenseSplits(userIds, totalAmount, splitMethod, values);

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
    <View style={[styles.container, { backgroundColor: isDark ? '#0b1326' : colors.background }]}>
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
                  ? settle.buttonBackground
                  : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
              },
            ]}>
            {loading ? (
              <ActivityIndicator size="small" color={isDark ? '#003824' : '#ffffff'} />
            ) : (
              <ThemedText style={[styles.headerButtonText, { color: (expenseStep === 1 ? canContinue : canSubmit) ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#bbcabf' : '#6B7280') }]}>
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
              <View style={[styles.stepBadge, { backgroundColor: isDark ? '#4edea3' : settle.buttonBackground }]}>
                {expenseStep === 2 ? (
                  <IconSymbol name="checkmark" size={14} color={isDark ? '#003824' : '#ffffff'} />
                ) : (
                  <ThemedText style={[styles.stepBadgeText, { color: isDark ? '#003824' : '#ffffff' }]}>1</ThemedText>
                )}
              </View>
              <ThemedText style={[styles.stepName, { color: isDark ? '#4edea3' : settle.buttonBackground }]}>People</ThemedText>
            </View>
            <View style={[styles.stepLine, { backgroundColor: expenseStep === 2 ? (isDark ? '#4edea3' : settle.buttonBackground) : (isDark ? 'rgba(60, 74, 66, 0.4)' : colors.border) }]} />
            <View style={styles.stepItem}>
              <View style={[styles.stepBadge, { backgroundColor: expenseStep === 2 ? (isDark ? '#4edea3' : settle.buttonBackground) : (isDark ? '#222a3d' : colors.border) }]}>
                <ThemedText style={[styles.stepBadgeText, { color: expenseStep === 2 ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#bbcabf' : colors.textSecondary) }]}>2</ThemedText>
              </View>
              <ThemedText style={[styles.stepName, { color: expenseStep === 2 ? (isDark ? '#dae2fd' : colors.text) : (isDark ? '#bbcabf' : colors.textSecondary) }]}>Split</ThemedText>
            </View>
          </View>
        </View>
      )}

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
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
                  <ThemedText style={[styles.participantSummaryLabel, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>Splitting with</ThemedText>
                  <ThemedText style={[styles.participantSummaryNames, { color: isDark ? '#dae2fd' : colors.text }]} numberOfLines={2}>
                    {splitType === SplitType.GROUP
                      ? selectedGroup?.name || 'Selected group'
                      : selectedFriendNames.join(', ')}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>Paid by</ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.splitMethodContainer}>
                  {payerOptions.map(payer => {
                    const isSelected = payer.id === selectedPayerId;
                    return (
                      <TouchableOpacity
                        key={payer.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Paid by ${payer.id === currentUserId ? 'you' : payer.name}`}
                        style={[styles.splitMethodButton, isSelected && styles.splitMethodButtonActive, {
                          backgroundColor: isSelected ? (isDark ? '#4edea3' : settle.buttonBackground) : settle.pillBackground,
                          borderColor: isSelected ? (isDark ? '#4edea3' : '#003527') : (isDark ? 'rgba(60, 74, 66, 0.3)' : 'rgba(191, 201, 195, 0.3)'),
                        }]}
                        onPress={() => setSelectedPayerId(payer.id)}>
                        <ThemedText style={[styles.splitMethodText, { color: isSelected ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#dae2fd' : colors.text) }]}>
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
                    <Text style={[styles.currencySymbol, { color: settle.accentText }]}>$</Text>
                    <TextInput
                      ref={amountInputRef}
                      style={[styles.amountInput, { color: settle.accentText }]}
                      value={amount}
                      onChangeText={(text) => setAmount(normalizeCurrencyInput(text))}
                      placeholder="0.00"
                      placeholderTextColor={isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(6, 78, 59, 0.3)'}
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
                <ThemedText style={[styles.inputLabel, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
                  Description
                </ThemedText>
                <View style={[styles.inputContainer, {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }]}>
                  <IconSymbol name="doc.text" size={20} color={isDark ? '#bbcabf' : 'rgba(0,0,0,0.4)'} />
                  <TextInput
                    ref={descriptionInputRef}
                    style={[styles.textInput, { color: isDark ? '#dae2fd' : colors.text }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Dinner, Groceries, Uber..."
                    placeholderTextColor={isDark ? '#bbcabf' : 'rgba(0,0,0,0.4)'}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    testID="expense-description-input"
                  />
                </View>
              </View>

              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>Date</ThemedText>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Expense date, ${formattedExpenseDate}`}
                  onPress={() => setShowDatePicker(current => !current)}
                  style={[styles.inputContainer, {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  }]}>
                  <IconSymbol name="calendar" size={20} color={isDark ? '#bbcabf' : 'rgba(0,0,0,0.4)'} />
                  <ThemedText style={[styles.textInput, { color: isDark ? '#dae2fd' : colors.text }]}>{formattedExpenseDate}</ThemedText>
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
              <ThemedText style={[styles.inputLabel, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
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
                        ? (isDark ? '#4edea3' : settle.buttonBackground)
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
                    color={splitType === SplitType.GROUP ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#bbcabf' : colors.textSecondary)}
                  />
                  <Text style={[
                    styles.toggleText,
                    { color: splitType === SplitType.GROUP ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#bbcabf' : colors.textSecondary) },
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
                        ? (isDark ? '#4edea3' : settle.buttonBackground)
                        : 'transparent',
                    },
                  ]}
                  onPress={() => setSplitType(SplitType.FRIENDS)}>
                  <IconSymbol
                    name="person.2.fill"
                    size={17}
                    color={splitType === SplitType.FRIENDS ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#bbcabf' : colors.textSecondary)}
                  />
                  <Text style={[
                    styles.toggleText,
                    { color: splitType === SplitType.FRIENDS ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#bbcabf' : colors.textSecondary) },
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
              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
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
                                ? (isDark ? '#4edea3' : '#E8FDF5')
                                : settle.pillBackground,
                              borderColor: isActive
                                ? (isDark ? '#4edea3' : '#003527')
                                : (isDark ? 'rgba(60, 74, 66, 0.3)' : 'rgba(191, 201, 195, 0.3)'),
                            },
                          ]}
                          onPress={() => setSplitMethod(method.id)}>
                          <IconSymbol
                            name={method.icon}
                            size={18}
                            color={isActive ? (isDark ? '#003824' : '#003527') : (isDark ? '#bbcabf' : colors.text)}
                          />
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                            style={[
                              styles.splitMethodText,
                              { color: isActive ? (isDark ? '#003824' : '#003527') : (isDark ? '#dae2fd' : colors.text) },
                            ]}>
                            {compactLabel}
                          </Text>
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
              <ThemedText style={[styles.inputLabel, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
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
                      <IconSymbol name="person.3" size={32} color={isDark ? '#bbcabf' : 'rgba(0,0,0,0.3)'} />
                      <ThemedText style={[styles.emptyText, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
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
                            styles.optionRow
                          ]}
                          onPress={() => !preselectedGroupId && setSelectedGroupId(group.id)}
                          disabled={!!preselectedGroupId}>
                          <View style={[styles.optionIcon, {
                            backgroundColor: selectedGroupId === group.id
                              ? (isDark ? '#4edea3' : '#003527')
                              : (isDark ? '#05080e' : 'rgba(0, 0, 0, 0.05)'),
                          }]}>
                            <IconSymbol
                              name="person.3.fill"
                              size={20}
                              color={selectedGroupId === group.id ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#dae2fd' : colors.text)}
                            />
                          </View>
                          <View style={styles.optionTextContainer}>
                            <Text style={[styles.optionText, { color: selectedGroupId === group.id ? (isDark ? '#4edea3' : '#003527') : (isDark ? '#dae2fd' : colors.text) }]}>
                              {group.name}
                            </Text>
                          </View>
                          {selectedGroupId === group.id && (
                            <IconSymbol name="checkmark.circle.fill" size={22} color={isDark ? '#4edea3' : '#003527'} />
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
                      <IconSymbol name="person.2" size={32} color={isDark ? '#bbcabf' : 'rgba(0,0,0,0.3)'} />
                      <ThemedText style={[styles.emptyText, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
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
                          <IconSymbol name="magnifyingglass" size={18} color={isDark ? '#bbcabf' : 'rgba(0,0,0,0.4)'} />
                          <TextInput
                            style={[styles.searchInput, { color: isDark ? '#dae2fd' : colors.text }]}
                            value={friendSearchQuery}
                            onChangeText={setFriendSearchQuery}
                            placeholder={`Search ${friends.length} friends`}
                            placeholderTextColor={isDark ? '#bbcabf' : 'rgba(0,0,0,0.4)'}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="search"
                          />
                          {friendSearchQuery.length > 0 && (
                            <TouchableOpacity
                              accessibilityLabel="Clear friend search"
                              onPress={() => setFriendSearchQuery('')}
                              style={styles.clearSearchButton}>
                              <IconSymbol name="xmark.circle.fill" size={18} color={isDark ? '#bbcabf' : 'rgba(0,0,0,0.35)'} />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      {visibleFriends.length === 0 ? (
                        <View style={styles.emptyState}>
                          <IconSymbol name="magnifyingglass" size={32} color={isDark ? '#bbcabf' : 'rgba(0,0,0,0.3)'} />
                          <ThemedText style={[styles.emptyText, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>No matching friends</ThemedText>
                        </View>
                      ) : (
                        <>
                          {visibleFriends.length > displayedFriends.length && (
                            <ThemedText style={[styles.friendListHint, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
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
                                    ? (isDark ? '#4edea3' : '#003527')
                                    : (isDark ? '#05080e' : 'rgba(0, 0, 0, 0.05)'),
                                }]}>
                                  <Text style={[styles.avatarText, {
                                    color: isSelected ? (isDark ? '#003824' : '#ffffff') : (isDark ? '#dae2fd' : colors.text),
                                  }]}>
                                    {friend.name.charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                                <View style={styles.optionTextContainer}>
                                  <Text style={[styles.optionText, { color: isSelected ? (isDark ? '#4edea3' : '#003527') : (isDark ? '#dae2fd' : colors.text) }]}>
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
                                    <IconSymbol name="checkmark.circle.fill" size={22} color={isDark ? '#4edea3' : '#003527'} />
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
                  backgroundColor: colors.card,
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
                  backgroundColor: colors.card,
                  borderColor: colors.border,
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
                      backgroundColor: colors.card,
                      borderColor: colors.border,
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
                          backgroundColor: isDark ? '#05080e' : 'rgba(255,255,255,0.9)',
                          color: isDark ? '#fff' : colors.text,
                          borderWidth: 1,
                          borderColor: colors.border,
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
                      backgroundColor: colors.card,
                      borderColor: colors.border,
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
                          backgroundColor: isDark ? '#05080e' : 'rgba(255,255,255,0.9)',
                          color: isDark ? '#fff' : colors.text,
                          borderWidth: 1,
                          borderColor: colors.border,
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
