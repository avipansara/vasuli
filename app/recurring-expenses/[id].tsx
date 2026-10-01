import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useCurrency } from '@/contexts/currency-context';
import { useRecurringExpenseMutations } from '@/hooks/use-recurring-expense-mutations';
import { useRecurringExpenseOccurrences, useRecurringExpenseRule } from '@/hooks/use-recurring-expense-queries';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { groupService } from '@/services/group-service';
import { queryKeys } from '@/services/query-keys';
import { userService } from '@/services/user-service';
import type { Expense, RecurringExpenseRule } from '@/types/database';
import { formatCurrency } from '@/utils/currency';
import { getRecurringStatusColor } from '@/utils/recurring-status';
import {
  canManageRecurringRule,
  formatCadence,
  formatRecurringLocalDate,
  formatStatus,
  getMissedDatesForReview,
} from '@/utils/recurring-management';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

export default function RecurringExpenseDetailScreen() {
  const { colors, recurring, settle } = useThemeColors();
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const { id } = useLocalSearchParams<{ id: string }>();
  useCurrency();

  const [refreshing, setRefreshing] = useState(false);
  const [reviewingDate, setReviewingDate] = useState<string | null>(null);
  const commandLockRef = useRef(false);
  const [commandBusy, setCommandBusy] = useState(false);

  const {
    data: rule,
    isLoading: isRuleLoading,
    isError: isRuleError,
    error: ruleError,
    refetch: refetchRule,
  } = useRecurringExpenseRule(currentUserId, id);

  const isOwner = rule ? canManageRecurringRule(rule, currentUserId) : false;

  const recurringMutations = useRecurringExpenseMutations(currentUserId);

  const occurrencesQuery = useRecurringExpenseOccurrences(currentUserId, id);

  const groupQuery = useQuery({
    queryKey: queryKeys.groups.detail(currentUserId, rule?.groupId ?? ''),
    enabled: !!rule?.groupId,
    queryFn: () => (rule?.groupId ? groupService.getById(rule.groupId) : null),
  });

  const participantIds = useMemo(
    () => rule?.participants.map(p => p.userId) ?? [],
    [rule?.participants]
  );

  const usersQuery = useQuery({
    queryKey: ['users', 'by-ids', participantIds.join(',')],
    enabled: participantIds.length > 0,
    queryFn: () => userService.getByIds(participantIds),
  });

  const usersById = useMemo(() => {
    const map = new Map<string, string>();
    (usersQuery.data ?? []).forEach(u => map.set(u.id, u.name));
    return map;
  }, [usersQuery.data]);

  const missedDates = useMemo(() => {
    if (!rule) return [];
    return getMissedDatesForReview(rule, new Date());
  }, [rule]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchRule(),
        occurrencesQuery.refetch(),
        groupQuery.refetch(),
        usersQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchRule, occurrencesQuery, groupQuery, usersQuery]);

  const handlePause = async () => {
    if (!rule || commandLockRef.current) return;
    commandLockRef.current = true; setCommandBusy(true);
    try {
      await recurringMutations.pause.mutateAsync(rule.id);
    } catch (err) {
      Alert.alert('Could not pause', getFetchErrorMessage(err));
    } finally {
      commandLockRef.current = false; setCommandBusy(false);
    }
  };

  const handleResume = async () => {
    if (!rule || commandLockRef.current) return;
    if (missedDates.length > 0) {
      Alert.alert(
        'Review missed dates first',
        'This recurring expense was paused because several scheduled dates were missed. Please review the missed dates below by posting or skipping each before resuming.'
      );
      return;
    }
    commandLockRef.current = true; setCommandBusy(true);
    try {
      await recurringMutations.resume.mutateAsync(rule.id);
    } catch (err) {
      Alert.alert('Could not resume', getFetchErrorMessage(err));
    } finally {
      commandLockRef.current = false; setCommandBusy(false);
    }
  };

  const handleStop = () => {
    if (!rule) return;
    Alert.alert(
      'Stop recurring expense?',
      'No future expenses will be added. Expenses already posted, and their balances, will stay as they are.',
      [
        { text: 'Keep recurring', style: 'cancel' },
        {
          text: 'Stop recurring expense',
          style: 'destructive',
          onPress: async () => {
            if (commandLockRef.current) return;
            commandLockRef.current = true; setCommandBusy(true);
            try {
              const res = await recurringMutations.stop.mutateAsync(rule.id);
              const postedMessage = res.lastPostedDueOn
                ? ` The last expense was posted on ${formatRecurringLocalDate(res.lastPostedDueOn)}.`
                : '';
              Alert.alert('Recurring expense stopped', `No future expenses will be added.${postedMessage}`);
            } catch (err) {
              Alert.alert('Could not stop', getFetchErrorMessage(err));
            } finally {
              commandLockRef.current = false; setCommandBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleReviewDate = async (dueOn: string, action: 'post' | 'skip') => {
    if (!rule || commandLockRef.current) return;
    commandLockRef.current = true; setCommandBusy(true);
    setReviewingDate(dueOn);
    try {
      const result = await recurringMutations.reviewMissedDate.mutateAsync({
        ruleId: rule.id,
        dueOn,
        action,
      });
      await Promise.all([refetchRule(), occurrencesQuery.refetch()]);
      if (result.reviewOutcome === 'needs_repair') {
        Alert.alert('Participant repair needed', result.reason || 'A saved participant is no longer eligible. Update the participants before reviewing this date.');
      } else if (result.reviewOutcome === 'already_reviewed') {
        Alert.alert('Date already reviewed', 'This date has already been handled. The schedule has been refreshed.');
      } else if (result.reviewOutcome === 'stale') {
        Alert.alert('Schedule changed', 'That missed date is no longer next in line. The latest schedule has been refreshed.');
      }
    } catch (err) {
      Alert.alert(`Could not ${action} date`, getFetchErrorMessage(err));
    } finally {
      setReviewingDate(null);
      commandLockRef.current = false; setCommandBusy(false);
    }
  };

  const handleCreateNewPrefilled = () => {
    if (!rule) return;
    router.push({
      pathname: '/add-expense',
      params: { prefillRuleId: rule.id },
    } as never);
  };


  if (isRuleLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <NavigationHeader title="Recurring expense" onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <Skeleton height={120} borderRadius={16} style={{ marginBottom: 16 }} />
          <Skeleton height={140} borderRadius={16} style={{ marginBottom: 16 }} />
          <Skeleton height={100} borderRadius={16} />
        </View>
      </View>
    );
  }

  if (isRuleError || !rule) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <NavigationHeader title="Recurring expense" onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <AsyncErrorState
            message={ruleError ? getFetchErrorMessage(ruleError) : 'Recurring expense not found'}
            onRetry={refetchRule}
          />
        </View>
      </View>
    );
  }

  const statusColor = getRecurringStatusColor(rule.status, colors, recurring.paused);
  const groupName = groupQuery.data?.name;
  const isTerminal = rule.status === 'stopped' || rule.status === 'ended';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NavigationHeader
        title="Recurring expense"
        onBack={() => router.back()}
        rightAction={
          isOwner && !isTerminal ? (
            <TouchableOpacity
              testID="recurring-detail-edit-button"
              accessibilityRole="button"
              accessibilityLabel="Edit recurring expense"
              onPress={() => router.push(`/recurring-expenses/edit/${rule.id}` as never)}
              style={styles.headerEditButton}
            >
              <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>Edit</ThemedText>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.tint}
          />
        }
      >
        {/* Main Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.title, { color: colors.text }]}>{rule.description}</ThemedText>
              <ThemedText style={[styles.cadenceLabel, { color: colors.textSecondary }]}>
                Repeats {formatCadence(rule.cadence).toLowerCase()}
              </ThemedText>
            </View>
            <ThemedText style={[styles.amount, { color: colors.text }]}>
              {formatCurrency(rule.amount, rule.currency)}
            </ThemedText>
          </View>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: recurring.badgeBackground,
                  borderColor: statusColor,
                },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <ThemedText style={[styles.statusText, { color: statusColor }]}>
                {formatStatus(rule.status)}
              </ThemedText>
            </View>
          </View>

          {rule.status === 'paused' && rule.pausedReason && (
            <View
              style={[
                styles.pausedBanner,
                {
                  backgroundColor: recurring.pausedBannerBackground,
                  borderColor: recurring.pausedBannerBorder,
                },
              ]}
            >
              <IconSymbol name="exclamationmark.triangle" size={16} color={recurring.paused} />
              <ThemedText style={[styles.pausedBannerText, { color: recurring.pausedText }]}>
                {rule.pausedReason}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Missed Dates Review (if paused and has backlog) */}
        {rule.status === 'paused' && isOwner && missedDates.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={[styles.cardSectionTitle, { color: colors.text }]}>
              Missed dates review
            </ThemedText>
            <ThemedText style={[styles.cardHelperText, { color: colors.textSecondary }]}>
              Vasuli paused this recurring expense after two missed dates. Choose whether to post or skip each remaining date before resuming.
            </ThemedText>

            <View style={styles.missedDatesList}>
              {missedDates.map((date, index) => {
                const isCurrentReviewing = reviewingDate === date;
                return (
                  <View
                    key={date}
                    style={[
                      styles.missedDateRow,
                      { borderColor: colors.border, backgroundColor: recurring.rowMutedBackground },
                    ]}
                  >
                    <ThemedText style={[styles.missedDateText, { color: colors.text }]}>
                      {formatRecurringLocalDate(date)}
                    </ThemedText>

                    <View style={styles.missedDateActions}>
                      <TouchableOpacity
                        testID={`post-missed-date-${date}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Post expense for ${formatRecurringLocalDate(date)}`}
                        disabled={commandBusy || index !== 0}
                        onPress={() => handleReviewDate(date, 'post')}
                        style={[styles.reviewActionBtn, { backgroundColor: colors.tint, opacity: index === 0 ? 1 : 0.45 }]}
                      >
                        {isCurrentReviewing && recurringMutations.reviewMissedDate.isPending ? (
                          <ActivityIndicator size="small" color={settle.buttonText} />
                        ) : (
                          <ThemedText style={[styles.reviewActionBtnText, { color: settle.buttonText }]}>Post</ThemedText>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        testID={`skip-missed-date-${date}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Skip date ${formatRecurringLocalDate(date)}`}
                        disabled={commandBusy || index !== 0}
                        onPress={() => handleReviewDate(date, 'skip')}
                        style={[
                          styles.reviewActionBtn,
                          {
                            backgroundColor: recurring.secondaryActionBackground,
                            opacity: index === 0 ? 1 : 0.45,
                          },
                        ]}
                      >
                        <ThemedText style={[styles.reviewActionBtnText, { color: colors.text }]}>
                          Skip
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Schedule details Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.cardSectionTitle, { color: colors.text }]}>
            Schedule details
          </ThemedText>

          <View style={styles.detailRow}>
            <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>First due date</ThemedText>
            <ThemedText style={[styles.detailValue, { color: colors.text }]}>
              {formatRecurringLocalDate(rule.firstDueOn)}
            </ThemedText>
          </View>

          <View style={styles.detailRow}>
            <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>Next due date</ThemedText>
            <ThemedText style={[styles.detailValue, { color: colors.text }]}>
              {rule.nextDueOn ? formatRecurringLocalDate(rule.nextDueOn) : isTerminal ? 'None' : 'Not scheduled'}
            </ThemedText>
          </View>

          {rule.lastDueOn && (
            <View style={styles.detailRow}>
              <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>Last due date</ThemedText>
              <ThemedText style={[styles.detailValue, { color: colors.text }]}>
                {formatRecurringLocalDate(rule.lastDueOn)}
              </ThemedText>
            </View>
          )}

          <View style={styles.detailRowStacked}>
            <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>Saved time zone</ThemedText>
            <ThemedText style={[styles.detailValue, styles.detailValueStacked, { color: colors.text }]}>
              {rule.timeZone} · Around 9:00 a.m.
            </ThemedText>
          </View>

          <View style={[styles.warningBox, { backgroundColor: colors.infoSurface, borderColor: colors.border }]}>
            <ThemedText style={[styles.warningText, { color: colors.textSecondary }]}>
              Vasuli will add this expense automatically on each due date. It cannot verify that you paid the bill.
            </ThemedText>
          </View>
        </View>

        {isOwner && rule.lastError && (
          <View style={[styles.pausedBanner, { backgroundColor: recurring.pausedBannerBackground, borderColor: recurring.pausedBannerBorder }]}>
            <IconSymbol name="exclamationmark.triangle" size={16} color={recurring.paused} />
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.pausedBannerText, { color: recurring.pausedText }]}>Last posting problem: {rule.lastError}</ThemedText>
              {rule.lastErrorAt ? <ThemedText style={{ color: recurring.pausedText, fontSize: 12, marginTop: 3 }}>Reported {new Date(rule.lastErrorAt).toLocaleString()}</ThemedText> : null}
            </View>
          </View>
        )}

        {/* Participants & Split Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.cardSectionTitle, { color: colors.text }]}>
            Split breakdown
          </ThemedText>

          <View style={styles.detailRowStacked}>
            <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>Scope</ThemedText>
            <ThemedText style={[styles.detailValue, styles.detailValueStacked, { color: colors.text }]}>
              {rule.scopeType === 'group' ? groupName || 'Group' : 'Direct friends'}
            </ThemedText>
          </View>

          <View style={styles.detailRow}>
            <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>Split method</ThemedText>
            <ThemedText style={[styles.detailValue, { color: colors.text }]}>
              {rule.splitMethod === 'equal'
                ? 'Split evenly'
                : rule.splitMethod === 'unequal'
                  ? 'Custom amounts'
                  : rule.splitMethod === 'percentage'
                    ? 'Percentage split'
                    : 'Share-based split'}
            </ThemedText>
          </View>

          {!isOwner && (
            <View style={[styles.participantNotice, { backgroundColor: recurring.participantNoticeBackground, borderColor: colors.border }]}>
              <ThemedText style={[styles.participantNoticeText, { color: colors.textSecondary }]}>
                You are a participant. Only the creator can edit, pause, or stop this recurring expense.
              </ThemedText>
            </View>
          )}

          <View style={styles.participantList}>
            {rule.participants.map(p => {
              const name = p.userId === currentUserId ? 'You' : usersById.get(p.userId) || 'Friend';
              return (
                <View key={p.userId} style={styles.participantRow}>
                  <ThemedText style={[styles.participantName, { color: colors.text }]}>
                    {name}
                  </ThemedText>
                  <ThemedText style={[styles.participantShare, { color: colors.text }]}>
                    {formatCurrency(p.shareAmount, rule.currency)}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>

        {/* Recent Occurrences Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.cardSectionTitle, { color: colors.text }]}>
            Recent posted expenses
          </ThemedText>

          {occurrencesQuery.isLoading ? (
            <ActivityIndicator size="small" color={colors.tint} style={{ marginVertical: 12 }} />
          ) : occurrencesQuery.isError ? (
            <AsyncErrorState
              title="Couldn't load recent expenses"
              message={getFetchErrorMessage(occurrencesQuery.error)}
              onRetry={() => void occurrencesQuery.refetch()}
            />
          ) : (occurrencesQuery.data ?? []).length === 0 ? (
            <ThemedText style={[styles.emptyOccurrencesText, { color: colors.textSecondary }]}>
              No expenses have posted yet.
            </ThemedText>
          ) : (
            <View style={styles.occurrencesList}>
              {(occurrencesQuery.data as Expense[]).map(occ => (
                <TouchableOpacity
                  key={occ.id}
                  testID={`recurring-occurrence-${occ.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`View expense ${occ.description} on ${formatRecurringLocalDate(occ.effectiveDate ?? occ.scheduledFor ?? '')}`}
                  onPress={() => router.push(`/expense-detail/${occ.id}` as never)}
                  style={[styles.occurrenceRow, { borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.occurrenceDate, { color: colors.text }]}>
                      {formatRecurringLocalDate(occ.effectiveDate ?? occ.scheduledFor ?? '')}
                    </ThemedText>
                    <ThemedText style={[styles.occurrenceDesc, { color: colors.textSecondary }]}>
                      {occ.description}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.occurrenceAmount, { color: colors.text }]}>
                    {formatCurrency(occ.amount, occ.currency)}
                  </ThemedText>
                  <IconSymbol name="chevron.right" size={16} color={colors.icon} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Action Controls for Owner */}
        {isOwner && (
          <View style={styles.actionsContainer}>
            {rule.status === 'active' && (
              <>
                <TouchableOpacity
                  testID="pause-recurring-rule-button"
                  accessibilityRole="button"
                  accessibilityLabel="Pause recurring expense"
                  disabled={commandBusy || recurringMutations.pause.isPending}
                  onPress={handlePause}
                  style={[styles.actionBtn, { backgroundColor: recurring.secondaryActionBackground }]}
                >
                  {commandBusy && recurringMutations.pause.isPending ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <ThemedText style={[styles.actionBtnText, { color: colors.text }]}>
                      Pause recurring expense
                    </ThemedText>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  testID="stop-recurring-rule-button"
                  accessibilityRole="button"
                  accessibilityLabel="Stop recurring expense"
                  disabled={commandBusy || recurringMutations.stop.isPending}
                  onPress={handleStop}
                  style={[styles.actionBtn, { backgroundColor: recurring.dangerButtonBackground }]}
                >
                  {commandBusy && recurringMutations.stop.isPending ? (
                    <ActivityIndicator size="small" color={recurring.dangerButtonText} />
                  ) : (
                    <ThemedText style={[styles.actionBtnText, { color: recurring.dangerButtonText }]}>
                      Stop recurring expense
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </>
            )}

            {rule.status === 'paused' && (
              <>
                <TouchableOpacity
                  testID="resume-recurring-rule-button"
                  accessibilityRole="button"
                  accessibilityLabel="Resume recurring expense"
                  disabled={commandBusy || recurringMutations.resume.isPending}
                  onPress={handleResume}
                  style={[styles.actionBtn, { backgroundColor: colors.tint }]}
                >
                  {recurringMutations.resume.isPending ? (
                    <ActivityIndicator size="small" color={settle.buttonText} />
                  ) : (
                    <ThemedText style={[styles.actionBtnText, { color: settle.buttonText }]}>
                      Resume recurring expense
                    </ThemedText>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  testID="stop-recurring-rule-button"
                  accessibilityRole="button"
                  accessibilityLabel="Stop recurring expense"
                  disabled={commandBusy || recurringMutations.stop.isPending}
                  onPress={handleStop}
                  style={[styles.actionBtn, { backgroundColor: recurring.dangerButtonBackground }]}
                >
                  {commandBusy && recurringMutations.stop.isPending ? (
                    <ActivityIndicator size="small" color={recurring.dangerButtonText} />
                  ) : (
                    <ThemedText style={[styles.actionBtnText, { color: recurring.dangerButtonText }]}>
                      Stop recurring expense
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </>
            )}

            {isTerminal && (
              <TouchableOpacity
                testID="prefilled-new-rule-button"
                accessibilityRole="button"
                accessibilityLabel="Create a new recurring expense from this rule"
                onPress={handleCreateNewPrefilled}
                style={[styles.actionBtn, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={[styles.actionBtnText, { color: settle.buttonText }]}>
                  Create a new recurring expense
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
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
  headerEditButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    marginBottom: 4,
  },
  cadenceLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  amount: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  pausedBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  cardSectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardHelperText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  missedDatesList: {
    gap: 8,
  },
  missedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  missedDateText: {
    fontSize: 14,
    fontWeight: '600',
  },
  missedDateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  detailRowStacked: {
    gap: 5,
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  detailValueStacked: {
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  warningBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 17,
  },
  participantNotice: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  participantNoticeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  participantList: {
    gap: 8,
    marginTop: 4,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    gap: 12,
  },
  participantName: {
    fontSize: 14,
    flex: 1,
    flexShrink: 1,
  },
  participantShare: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 0,
  },
  emptyOccurrencesText: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  occurrencesList: {
    gap: 8,
  },
  occurrenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  occurrenceDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  occurrenceDesc: {
    fontSize: 12,
  },
  occurrenceAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  actionsContainer: {
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  actionBtnText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
});
