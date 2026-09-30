import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { NavigationHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemedIconButton } from '@/components/ui/themed-icon-button';
import { useAuth } from '@/contexts/auth-context-otp';
import { useCurrency } from '@/contexts/currency-context';
import { useRecurringExpenseRules } from '@/hooks/use-recurring-expense-queries';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { groupService } from '@/services/group-service';
import { queryKeys } from '@/services/query-keys';
import { userService } from '@/services/user-service';
import type { RecurringExpenseRule } from '@/types/database';
import { getRecurringStatusColor } from '@/utils/recurring-status';
import { formatCurrency } from '@/utils/currency';
import {
  formatCadence,
  formatRecurringLocalDate,
  formatStatus,
  groupRecurringRules,
} from '@/utils/recurring-management';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

export default function RecurringExpensesListScreen() {
  const { colors, recurring } = useThemeColors();
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  useCurrency();

  const [refreshing, setRefreshing] = useState(false);

  const {
    data: rules = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useRecurringExpenseRules(currentUserId);

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

  const groupsById = useMemo(() => {
    const map = new Map<string, string>();
    (groupsQuery.data ?? []).forEach(g => map.set(g.id, g.name));
    return map;
  }, [groupsQuery.data]);

  const friendsById = useMemo(() => {
    const map = new Map<string, string>();
    (friendsQuery.data ?? []).forEach(f => map.set(f.id, f.name));
    return map;
  }, [friendsQuery.data]);

  const sections = useMemo(
    () => groupRecurringRules(rules, currentUserId),
    [rules, currentUserId]
  );

  const totalRulesCount = rules.length;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        groupsQuery.refetch(),
        friendsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, groupsQuery, friendsQuery]);

  const getScopeLabel = (rule: RecurringExpenseRule) => {
    if (rule.scopeType === 'group' && rule.groupId) {
      return groupsById.get(rule.groupId) || 'Group';
    }
    const otherParticipantIds = rule.participants
      .map(p => p.userId)
      .filter(id => id !== currentUserId);
    if (otherParticipantIds.length === 0) return 'Direct';
    const names = otherParticipantIds
      .map(id => friendsById.get(id) || 'Friend')
      .slice(0, 2);
    if (otherParticipantIds.length > 2) {
      return `${names.join(', ')} +${otherParticipantIds.length - 2}`;
    }
    return names.join(', ');
  };


  const renderRuleCard = (rule: RecurringExpenseRule) => {
    const scopeLabel = getScopeLabel(rule);
    const statusColor = getRecurringStatusColor(rule.status, colors, recurring.paused);
    const formattedAmount = formatCurrency(rule.amount, rule.currency);

    return (
      <TouchableOpacity
        key={rule.id}
        testID={`recurring-rule-card-${rule.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${rule.description}, ${formattedAmount}, ${formatCadence(rule.cadence)}, ${rule.status}`}
        onPress={() => router.push(`/recurring-expenses/${rule.id}` as never)}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <ThemedText style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {rule.description}
            </ThemedText>
            <ThemedText style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              {scopeLabel} · {formatCadence(rule.cadence)}
            </ThemedText>
          </View>
          <ThemedText style={[styles.cardAmount, { color: colors.text }]}>
            {formattedAmount}
          </ThemedText>
        </View>

        <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
          <View style={styles.footerInfo}>
            {rule.status === 'paused' ? (
              <ThemedText
                style={[styles.footerText, { color: recurring.pausedText }]}
                numberOfLines={1}
              >
                {rule.pausedReason ?? 'Paused'}
              </ThemedText>
            ) : rule.nextDueOn ? (
              <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
                Next: {formatRecurringLocalDate(rule.nextDueOn)}
              </ThemedText>
            ) : rule.status === 'ended' ? (
              <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
                Ended
              </ThemedText>
            ) : (
              <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
                Stopped
              </ThemedText>
            )}
          </View>

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
      </TouchableOpacity>
    );
  };

  const renderSection = (title: string, sectionRules: RecurringExpenseRule[]) => {
    if (sectionRules.length === 0) return null;
    return (
      <View style={styles.sectionContainer} key={title}>
        <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {title}
        </ThemedText>
        {sectionRules.map(renderRuleCard)}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NavigationHeader
        title="Recurring expenses"
        onBack={() => router.back()}
        rightAction={
          <ThemedIconButton
            name="plus"
            size={20}
            shape="square"
            testID="recurring-add-button"
            accessibilityLabel="Add recurring expense"
            onPress={() => router.push('/add-expense' as never)}
          />
        }
      />

      {isLoading && rules.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Skeleton height={80} borderRadius={16} style={{ marginBottom: 12 }} />
          <Skeleton height={80} borderRadius={16} style={{ marginBottom: 12 }} />
          <Skeleton height={80} borderRadius={16} />
        </View>
      ) : isError ? (
        <View style={styles.errorContainer}>
          <AsyncErrorState
            message={getFetchErrorMessage(error)}
            onRetry={refetch}
          />
        </View>
      ) : totalRulesCount === 0 ? (
        <EmptyState
          icon="arrow.trianglehead.2.clockwise"
          title="No recurring expenses"
          subtitle="Keep regular expenses like rent, subscriptions, or shared bills on schedule automatically."
          buttonLabel="Add a recurring expense"
          onButtonPress={() => router.push('/add-expense' as never)}
        />
      ) : (
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
          {renderSection('Your recurring expenses', sections.ownedActive)}
          {renderSection('Shared with you', sections.sharedActive)}
          {renderSection('Paused', sections.paused)}
          {renderSection('Stopped', sections.stopped)}
          {renderSection('Ended', sections.ended)}
        </ScrollView>
      )}
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
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardAmount: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerInfo: {
    flex: 1,
    marginRight: 8,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
