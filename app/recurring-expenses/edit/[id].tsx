import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useRecurringExpenseMutations } from '@/hooks/use-recurring-expense-mutations';
import { useRecurringExpenseRule } from '@/hooks/use-recurring-expense-queries';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { userService } from '@/services/user-service';
import { groupService } from '@/services/group-service';
import { queryKeys } from '@/services/query-keys';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import type { RecurringExpenseRuleInput } from '@/types/database';
import {
  CustomSplitBreakdown,
  ExpenseParticipant,
  SplitMethod,
  SplitMethodSelector,
} from '@/components/expenses';
import {
  canManageRecurringRule,
  formatCadence,
  formatRecurringLocalDate,
} from '@/utils/recurring-management';
import { getEvenSplitValues, getSplitProgress, resolveExpenseSplits } from '@/utils/split-validation';
import { normalizeCurrencyInput } from '@/utils/validation';
import { getRecurringSplitFormValues, getRecurringSplitType, isRecurringParticipantSetValid } from '@/utils/recurring-edit-form';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function EditRecurringExpenseScreen() {
  const { colors, recurring, settle } = useThemeColors();
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data: rule,
    isLoading: isRuleLoading,
    isError: isRuleError,
    error: ruleError,
    refetch: refetchRule,
  } = useRecurringExpenseRule(currentUserId, id);

  const recurringMutations = useRecurringExpenseMutations(currentUserId);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(SplitMethod.EQUAL);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [customPercentages, setCustomPercentages] = useState<Record<string, string>>({});
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [lastDueDate, setLastDueDate] = useState<Date | null>(null);
  const [showLastDuePicker, setShowLastDuePicker] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLockRef = useRef(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const participantIds = useMemo(
    () => rule?.participants.map(p => p.userId) ?? [],
    [rule?.participants]
  );

  const eligibleQuery = useQuery({
    queryKey: rule?.scopeType === 'group'
      ? queryKeys.expenses.formMembers(rule.groupId ?? '')
      : queryKeys.expenses.formFriends(currentUserId),
    enabled: !!rule && !!currentUserId,
    staleTime: 0,
    queryFn: async () => {
      if (rule?.scopeType === 'group') {
        if (!rule.groupId) throw new Error('This recurring expense is missing its group.');
        const members = await groupService.getMembers(rule.groupId);
        const memberIds = members.map(member => member.userId);
        const memberUsers = await userService.getByIds(memberIds);
        return { memberIds, memberUsers };
      }
      return userService.getUserFriends(currentUserId);
    },
  });
  useRefetchOnFocus({
    enabled: !!rule && !!currentUserId,
    isFetching: eligibleQuery.isFetching,
    isStale: eligibleQuery.isStale,
    refetch: eligibleQuery.refetch,
  });

  const eligibleIds = useMemo(() => {
    const data = eligibleQuery.data;
    if (Array.isArray(data)) return (data as { id: string }[]).map(friend => friend.id);
    return (data as { memberIds: string[] } | undefined)?.memberIds ?? [];
  }, [eligibleQuery.data]);

  const lookupIds = useMemo(
    () => [...new Set([...participantIds, ...eligibleIds])],
    [participantIds, eligibleIds],
  );

  const usersQuery = useQuery({
    queryKey: ['users', 'by-ids', lookupIds.join(',')],
    enabled: lookupIds.length > 0,
    queryFn: () => userService.getByIds(lookupIds),
  });

  const usersById = useMemo(() => {
    const map = new Map<string, string>();
    (usersQuery.data ?? []).forEach(u => map.set(u.id, u.name));
    return map;
  }, [usersQuery.data]);

  // Populate initial state from the loaded rule
  useEffect(() => {
    if (rule && !initialized) {
      setDescription(rule.description);
      setAmount(rule.amount.toString());
      setLastDueDate(rule.lastDueOn ? new Date(`${rule.lastDueOn}T12:00:00`) : null);

      let method = SplitMethod.EQUAL;
      if (rule.splitMethod === 'unequal') method = SplitMethod.UNEQUAL;
      else if (rule.splitMethod === 'percentage') method = SplitMethod.PERCENTAGE;
      else if (rule.splitMethod === 'shares') method = SplitMethod.SHARES;
      setSplitMethod(method);

      const formValues = getRecurringSplitFormValues(rule.participants);
      const ownerIsSaved = rule.participants.some(participant => participant.userId === currentUserId);
      if (!ownerIsSaved) {
        formValues.amounts[currentUserId] = '0';
        formValues.percentages[currentUserId] = '0';
        formValues.shares[currentUserId] = '1';
      }
      setCustomAmounts(formValues.amounts);
      setCustomPercentages(formValues.percentages);
      setCustomShares(formValues.shares);
      setSelectedParticipantIds([...new Set([...rule.participants.map(p => p.userId), currentUserId])]);
      setInitialized(true);
    }
  }, [rule, initialized, currentUserId]);

  const participants = useMemo<ExpenseParticipant[]>(() => {
    if (!rule) return [];
    return selectedParticipantIds.map(userId => ({
      id: userId,
      name: userId === currentUserId ? 'You' : usersById.get(userId) || 'Friend',
      isCurrentUser: userId === currentUserId,
    }));
  }, [rule, currentUserId, usersById, selectedParticipantIds]);

  const numericAmount = parseFloat(amount) || 0;

  const participantIdsList = useMemo(() => participants.map(p => p.id), [participants]);

  // Split calculation
  useEffect(() => {
    if (splitMethod === SplitMethod.EQUAL && numericAmount > 0 && participantIdsList.length > 0) {
      const nextAmounts = getEvenSplitValues(participantIdsList, 'equal', numericAmount);
      setCustomAmounts(nextAmounts);
    }
  }, [splitMethod, numericAmount, participantIdsList]);

  const activeValues = useMemo(() => {
    if (splitMethod === SplitMethod.UNEQUAL) return customAmounts;
    if (splitMethod === SplitMethod.PERCENTAGE) return customPercentages;
    return customShares;
  }, [splitMethod, customAmounts, customPercentages, customShares]);

  const splitProgress = useMemo(() => {
    return getSplitProgress(
      participantIdsList,
      numericAmount,
      splitMethod as 'equal' | 'unequal' | 'percentage' | 'shares',
      activeValues
    );
  }, [participantIdsList, numericAmount, splitMethod, activeValues]);

  const resolvedSplits = useMemo(
    () => resolveExpenseSplits(participantIdsList, numericAmount, splitMethod, {
      amounts: customAmounts,
      percentages: customPercentages,
      shares: customShares,
    }).splits ?? [],
    [participantIdsList, numericAmount, splitMethod, customAmounts, customPercentages, customShares],
  );

  const isOwner = rule ? canManageRecurringRule(rule, currentUserId) : false;

  const validateLastDueDate = useCallback((): boolean => {
    if (!lastDueDate || !rule?.nextDueOn) return true;
    const [year, month, day] = rule.nextDueOn.split('-').map(Number);
    const nextDueDateObj = new Date(Date.UTC(year, month - 1, day));
    const lastDateUtc = new Date(
      Date.UTC(lastDueDate.getFullYear(), lastDueDate.getMonth(), lastDueDate.getDate())
    );
    return lastDateUtc >= nextDueDateObj;
  }, [lastDueDate, rule]);

  const canSave = useMemo(() => {
    if (!description.trim()) return false;
    if (numericAmount <= 0) return false;
    if (!splitProgress.isBalanced) return false;
    if (!validateLastDueDate()) return false;
    if (!rule || eligibleQuery.isLoading || eligibleQuery.isError) return false;
    if (!isRecurringParticipantSetValid(participantIdsList, eligibleIds, currentUserId, rule.scopeType)) return false;
    return true;
  }, [description, numericAmount, splitProgress.isBalanced, validateLastDueDate, rule, eligibleQuery.isLoading, eligibleQuery.isError, participantIdsList, eligibleIds, currentUserId]);

  const handleSave = async () => {
    if (!rule || !canSave || saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);

    try {
      const result = resolveExpenseSplits(
        participantIdsList,
        numericAmount,
        splitMethod as 'equal' | 'unequal' | 'percentage' | 'shares',
        {
          amounts: customAmounts,
          percentages: customPercentages,
          shares: customShares,
        }
      );

      if (!result.splits) {
        throw new Error(result.error || 'Please review your split amounts');
      }

      const participantPayload = result.splits.map(s => ({
        userId: s.userId,
        shareAmount: s.amount,
        percentage: s.percentage,
      }));

      const lastDueStr = lastDueDate
        ? `${lastDueDate.getFullYear()}-${String(lastDueDate.getMonth() + 1).padStart(2, '0')}-${String(lastDueDate.getDate()).padStart(2, '0')}`
        : undefined;

      const ruleInput: RecurringExpenseRuleInput = {
        scopeType: rule.scopeType,
        groupId: rule.groupId,
        description: description.trim(),
        amount: numericAmount,
        currency: rule.currency,
        paidBy: currentUserId,
        splitMethod,
        splitType: getRecurringSplitType(splitMethod),
        cadence: rule.cadence,
        anchorDay: rule.anchorDay,
        timeZone: rule.timeZone,
        firstDueOn: rule.firstDueOn,
        lastDueOn: lastDueStr,
        participants: participantPayload,
      };

      const cmdResult = await recurringMutations.edit.mutateAsync({
        ruleId: rule.id,
        rule: ruleInput,
      });

      const firstUnpostedDate = cmdResult.appliesFrom || rule.nextDueOn;
      const formattedAppliesDate = firstUnpostedDate
        ? formatRecurringLocalDate(firstUnpostedDate)
        : 'the next scheduled date';

      Alert.alert(
        'Recurring expense updated',
        `New values will apply to future expenses starting on ${formattedAppliesDate}. Past expenses remain unchanged.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err) {
      Alert.alert('Could not update recurring expense', getFetchErrorMessage(err));
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  if (isRuleLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <NavigationHeader title="Edit recurring expense" onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <Skeleton height={60} borderRadius={12} style={{ marginBottom: 16 }} />
          <Skeleton height={80} borderRadius={12} style={{ marginBottom: 16 }} />
          <Skeleton height={120} borderRadius={12} />
        </View>
      </View>
    );
  }

  if (isRuleError || !rule) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <NavigationHeader title="Edit recurring expense" onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <AsyncErrorState
            message={ruleError ? getFetchErrorMessage(ruleError) : 'Recurring expense not found'}
            onRetry={refetchRule}
          />
        </View>
      </View>
    );
  }

  if (!isOwner) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <NavigationHeader title="Edit recurring expense" onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <ThemedText style={{ color: colors.text, textAlign: 'center', fontSize: 16 }}>
            Only the creator of this recurring expense can edit future expenses.
          </ThemedText>
        </View>
      </View>
    );
  }

  if (rule.status === 'stopped' || rule.status === 'ended') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <NavigationHeader title="Recurring expense" onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <ThemedText style={{ color: colors.text, textAlign: 'center', fontSize: 16 }}>
            This recurring expense has {rule.status === 'ended' ? 'ended' : 'stopped'} and cannot be edited.
          </ThemedText>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Create a new recurring expense from this rule"
            onPress={() => router.replace({ pathname: '/add-expense', params: { prefillRuleId: rule.id } } as never)}
            style={[styles.saveButton, { backgroundColor: colors.tint, marginTop: 16 }]}
          >
            <ThemedText style={[styles.saveButtonText, { color: settle.buttonText }]}>Create a new recurring expense</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NavigationHeader
        title="Edit recurring expense"
        onBack={() => router.back()}
      />

      <KeyboardAwareScroll
        testID="edit-recurring-scroll"
        contentContainerStyle={styles.scrollContent}
        footerBackgroundColor={colors.background}
        footer={
          <View style={[styles.footerContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <TouchableOpacity
              testID="save-recurring-edit-button"
              accessibilityRole="button"
              accessibilityLabel="Save recurring expense changes"
              disabled={!canSave || saving}
              onPress={handleSave}
              style={[
                styles.saveButton,
                {
                  backgroundColor: canSave && !saving ? colors.tint : recurring.secondaryActionBackground,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={settle.buttonText} />
              ) : (
                <ThemedText style={[styles.saveButtonText, { color: canSave ? settle.buttonText : colors.textSecondary }]}>
                  Save changes
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        {/* Notice Banner */}
        <View
          style={[
            styles.banner,
            {
              backgroundColor: recurring.noticeBackground,
              borderColor: colors.border,
            },
          ]}
        >
          <ThemedText style={[styles.bannerTitle, { color: colors.text }]}>
            Changes to future expenses only
          </ThemedText>
          <ThemedText style={[styles.bannerText, { color: colors.textSecondary }]}>
            Updated description, amounts, or shares will apply starting on{' '}
            <ThemedText style={{ fontWeight: '700', color: colors.text }}>
              {formatRecurringLocalDate(rule.nextDueOn || '')}
            </ThemedText>
            . Expenses that already posted are not modified.
          </ThemedText>
        </View>

        {/* Description Field */}
        <View style={styles.formGroup}>
          <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Description</ThemedText>
          <TextInput
            testID="edit-recurring-description"
            accessibilityLabel="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. WiFi, Rent, Streaming"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />
        </View>

        {/* Amount Field */}
        <View style={styles.formGroup}>
          <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Amount</ThemedText>
          <View
            style={[
              styles.amountInputRow,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <ThemedText style={[styles.currencyPrefix, { color: colors.tint }]}>
              {getCurrencySymbol(rule.currency)}
            </ThemedText>
            <TextInput
              testID="edit-recurring-amount"
              accessibilityLabel="Amount"
              value={amount}
              onChangeText={val => setAmount(normalizeCurrencyInput(val))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              style={[styles.amountInput, { color: colors.text }]}
            />
          </View>
        </View>

        {/* Split Method Selector */}
        <View style={styles.formGroup}>
          <SplitMethodSelector
            splitMethod={splitMethod}
            onSelectSplitMethod={setSplitMethod}
          />
        </View>

        {/* Equal is informational; custom methods expose their editable allocation inputs. */}
        {splitMethod === SplitMethod.EQUAL ? (
          <View
            accessibilityLabel="Equal split allocation"
            style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ThemedText style={[styles.summaryTitle, { color: colors.textSecondary }]}>Equal split</ThemedText>
            {resolvedSplits.map(split => (
              <View key={split.userId} style={styles.summaryRow}>
                <ThemedText style={[styles.summaryLabel, styles.summaryParticipant, { color: colors.text }]}>
                  {usersById.get(split.userId) || (split.userId === currentUserId ? 'You' : 'Friend')}
                </ThemedText>
                <ThemedText style={[styles.summaryValue, { color: colors.text }]}>
                  {formatCurrency(split.amount, rule.currency)}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : (
          <CustomSplitBreakdown
            splitMethod={splitMethod}
            totalAmount={numericAmount}
            currency={rule.currency}
            participants={participants}
            customAmounts={customAmounts}
            customPercentages={customPercentages}
            customShares={customShares}
            onChangeCustomAmount={(userId: string, val: string) =>
              setCustomAmounts(prev => ({ ...prev, [userId]: normalizeCurrencyInput(val) }))
            }
            onChangeCustomPercentage={(userId: string, val: string) =>
              setCustomPercentages(prev => ({ ...prev, [userId]: normalizeCurrencyInput(val) }))
            }
            onChangeCustomShare={(userId: string, val: string) =>
              setCustomShares(prev => ({ ...prev, [userId]: val.replace(/[^0-9]/g, '') }))
            }
            splitProgress={splitProgress}
            readyLabel="Ready to save"
          />
        )}

        <View style={styles.formGroup}>
          <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Participants</ThemedText>
          {rule.status === 'paused' && rule.pausedReason && (
            <ThemedText style={[styles.validationError, { color: colors.textSecondary }]}>
              Repair this paused rule by removing people who are no longer eligible or adding a current group member/friend. Resolve the split before saving.
            </ThemedText>
          )}
          {participants.map(participant => (
            <View key={participant.id} style={[styles.participantEditRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <ThemedText style={{ color: colors.text, flex: 1 }}>{participant.name}</ThemedText>
              {participant.isCurrentUser ? (
                <ThemedText style={{ color: colors.textSecondary }}>Owner</ThemedText>
              ) : (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${participant.name}`}
                  onPress={() => {
                    setSelectedParticipantIds(ids => ids.filter(id => id !== participant.id));
                    setCustomAmounts(values => { const next = { ...values }; delete next[participant.id]; return next; });
                    setCustomPercentages(values => { const next = { ...values }; delete next[participant.id]; return next; });
                    setCustomShares(values => { const next = { ...values }; delete next[participant.id]; return next; });
                  }}
                  style={styles.participantEditButton}
                ><ThemedText style={{ color: colors.error }}>Remove</ThemedText></TouchableOpacity>
              )}
            </View>
          ))}
          {eligibleQuery.isLoading ? <ActivityIndicator size="small" color={colors.tint} /> : null}
          {eligibleIds.filter(id => id !== currentUserId && !selectedParticipantIds.includes(id)).map(id => (
            <TouchableOpacity
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${usersById.get(id) || 'eligible person'}`}
              onPress={() => {
                setSelectedParticipantIds(ids => [...ids, id]);
                setCustomAmounts(values => ({ ...values, [id]: '0' }));
                setCustomPercentages(values => ({ ...values, [id]: '0' }));
                setCustomShares(values => ({ ...values, [id]: '1' }));
              }}
              style={[styles.participantEditRow, styles.participantEditButton, { borderColor: colors.border, backgroundColor: colors.card }]}
            ><ThemedText style={{ color: colors.tint }}>Add {usersById.get(id) || 'eligible person'}</ThemedText></TouchableOpacity>
          ))}
          {eligibleQuery.isError && (
            <View style={{ gap: 8 }}>
              <ThemedText style={{ color: colors.error }}>Could not load eligible participants. Retry before saving changes.</ThemedText>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry loading eligible participants" onPress={() => void eligibleQuery.refetch()} style={[styles.participantEditRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <ThemedText style={{ color: colors.tint }}>Retry</ThemedText>
              </TouchableOpacity>
            </View>
          )}
          {!eligibleQuery.isLoading && !eligibleQuery.isError && rule.scopeType === 'group' && !eligibleIds.includes(currentUserId) && <ThemedText style={[styles.validationError, { color: colors.error }]}>You must be an eligible group member to keep this rule active.</ThemedText>}
          {participants.length < 2 && <ThemedText style={[styles.validationError, { color: colors.error }]}>Add at least one eligible person besides you.</ThemedText>}
        </View>

        {/* Optional Last Due Date */}
        <View style={styles.formGroup}>
          <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
            End date (Optional)
          </ThemedText>
          <View style={styles.datePickerRow}>
            <TouchableOpacity
              testID="edit-recurring-last-date-button"
              accessibilityRole="button"
              accessibilityLabel={lastDueDate ? `End date: ${formatRecurringLocalDate(`${lastDueDate.getFullYear()}-${String(lastDueDate.getMonth() + 1).padStart(2, '0')}-${String(lastDueDate.getDate()).padStart(2, '0')}`)}` : 'No end date'}
              onPress={() => setShowLastDuePicker(true)}
              style={[
                styles.dateButton,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ThemedText style={{ color: lastDueDate ? colors.text : colors.textSecondary }}>
                {lastDueDate
                  ? formatRecurringLocalDate(
                      `${lastDueDate.getFullYear()}-${String(lastDueDate.getMonth() + 1).padStart(2, '0')}-${String(lastDueDate.getDate()).padStart(2, '0')}`
                    )
                  : 'No end date (repeats until stopped)'}
              </ThemedText>
            </TouchableOpacity>

            {lastDueDate && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Clear end date"
                onPress={() => setLastDueDate(null)}
                style={[styles.clearDateButton, { borderColor: colors.border }]}
              >
                <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>Clear</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          {!validateLastDueDate() && (
            <ThemedText style={[styles.validationError, { color: colors.error }]}>
              End date cannot precede the next due date ({formatRecurringLocalDate(rule.nextDueOn || '')}).
            </ThemedText>
          )}

          {showLastDuePicker && (
            <DateTimePicker
              value={lastDueDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onValueChange={(_, date) => {
                if (Platform.OS !== 'ios') setShowLastDuePicker(false);
                if (date) setLastDueDate(date);
              }}
              onDismiss={() => setShowLastDuePicker(false)}
            />
          )}
        </View>

        {/* Non-editable schedule parameters summary */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.summaryTitle, { color: colors.textSecondary }]}>
            Fixed schedule details
          </ThemedText>
          <View style={styles.summaryRow}>
            <ThemedText style={[styles.summaryLabel, { color: colors.textSecondary }]}>Cadence</ThemedText>
            <ThemedText style={[styles.summaryValue, { color: colors.text }]}>
              {formatCadence(rule.cadence)}
            </ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <ThemedText style={[styles.summaryLabel, { color: colors.textSecondary }]}>Time zone</ThemedText>
            <ThemedText style={[styles.summaryValue, { color: colors.text }]}>
              {rule.timeZone}
            </ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <ThemedText style={[styles.summaryLabel, { color: colors.textSecondary }]}>Payer</ThemedText>
            <ThemedText style={[styles.summaryValue, { color: colors.text }]}>You</ThemedText>
          </View>
        </View>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 160,
    gap: 16,
  },
  loadingContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  errorContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  banner: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  bannerTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 18,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    paddingVertical: 0,
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  clearDateButton: {
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantEditRow: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  participantEditButton: { justifyContent: 'center', paddingVertical: 10 },
  validationError: {
    fontSize: 12,
    marginTop: 2,
  },
  summaryCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 4,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryParticipant: {
    flex: 1,
    flexShrink: 1,
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});
