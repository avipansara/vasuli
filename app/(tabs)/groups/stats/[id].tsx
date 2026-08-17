import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { GenericSkeleton } from '@/components/ui/skeleton';
import { NavigationHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { groupDetailService } from '@/services/group-detail-service';
import { exportGroupExpensesCsv } from '@/services/group-expense-csv';
import { calculateGroupStats, type GroupBalanceStat, type GroupPayerStat } from '@/services/group-stats';
import { queryKeys } from '@/services/query-keys';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

const AVATAR_COLORS = ['#7C5CFC', '#22C55E', '#F59E0B', '#3B82F6', '#EC4899'];

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDateRange(expenses: { date: number }[]): string {
  if (expenses.length === 0) return 'No expenses yet';

  const dates = expenses.map(expense => expense.date).sort((a, b) => a - b);
  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return first.toDateString() === last.toDateString()
    ? formatDate(first)
    : `${formatDate(first)} – ${formatDate(last)}`;
}

function Avatar({ name, uri, size = 34 }: { name: string; uri?: string; size?: number }) {
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

  if (uri) {
    return <Image source={{ uri }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} contentFit="cover" />;
  }

  return (
    <View style={[styles.avatar, styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <ThemedText style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>{name.charAt(0).toUpperCase() || '?'}</ThemedText>
    </View>
  );
}

function GroupMark({ name, uri }: { name: string; uri?: string }) {
  return (
    <View style={styles.groupMarkWrap}>
      <LinearGradient colors={['#7C5CFC', '#4F46E5']} style={styles.groupMarkGlow} />
      {uri ? (
        <Image source={{ uri }} style={styles.groupMark} contentFit="cover" />
      ) : (
        <View style={[styles.groupMark, styles.groupMarkFallback, { backgroundColor: '#6D4CEB' }]}>
          <ThemedText style={styles.groupMarkText}>{name.charAt(0).toUpperCase() || '?'}</ThemedText>
        </View>
      )}
    </View>
  );
}

function StatCard({ label, value, detail, icon, color, surface }: { label: string; value: string; detail: string; icon: IconSymbolName; color: string; surface: string }) {
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={`${label}: ${value}. ${detail}`} style={[styles.statCard, { backgroundColor: surface }]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}1A` }]}>
        <IconSymbol name={icon} size={15} color={color} />
      </View>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={[styles.statValue, { color }]} numberOfLines={1}>{value}</ThemedText>
      <ThemedText style={styles.statDetail} numberOfLines={2}>{detail}</ThemedText>
    </View>
  );
}

function HorizontalBar({ value, maxValue, color }: { value: number; maxValue: number; color: string }) {
  const width = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 4 : 0) : 0;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${width}%`, backgroundColor: color }]} />
    </View>
  );
}

function ContributorRow({ payer, totalSpent, avatarUri, color }: { payer: GroupPayerStat; totalSpent: number; avatarUri?: string; color: string }) {
  const percentage = totalSpent > 0 ? payer.total / totalSpent : 0;
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={`${payer.name} paid ${formatCurrency(payer.total)}, ${Math.round(percentage * 100)} percent`} style={styles.contributorRow}>
      <Avatar name={payer.name} uri={avatarUri} />
      <View style={styles.contributorMain}>
        <View style={styles.rowHeader}>
          <ThemedText style={styles.rowName} numberOfLines={1}>{payer.name}</ThemedText>
          <ThemedText style={[styles.rowAmount, { color }]}>{formatCurrency(payer.total)}</ThemedText>
        </View>
        <View style={styles.contributorBarRow}>
          <HorizontalBar value={payer.total} maxValue={totalSpent} color={color} />
          <ThemedText style={[styles.percent, { color }]}>{Math.round(percentage * 100)}%</ThemedText>
        </View>
      </View>
    </View>
  );
}

function BalanceColumn({ title, members, color, avatarById, surface, maxVisible = 3 }: { title: string; members: GroupBalanceStat[]; color: string; avatarById: Map<string, string | undefined>; surface: string; maxVisible?: number }) {
  const visible = members.slice(0, maxVisible);
  const remaining = Math.max(members.length - visible.length, 0);

  return (
    <View style={styles.balanceColumn}>
      <ThemedText style={[styles.balanceColumnTitle, { color }]}>{title}</ThemedText>
      {visible.map(member => (
        <View key={member.userId} style={styles.balanceRow} accessible accessibilityLabel={`${member.name}, ${title} ${formatCurrency(Math.abs(member.balance))}`}>
          <Avatar name={member.name} uri={avatarById.get(member.userId)} size={28} />
          <ThemedText style={styles.balanceName} numberOfLines={1}>{member.name}</ThemedText>
          <ThemedText style={[styles.balanceAmount, { color }]}>{formatCurrency(Math.abs(member.balance))}</ThemedText>
        </View>
      ))}
      {remaining > 0 && (
        <View style={[styles.moreMembers, { backgroundColor: surface }]}>
          <ThemedText style={[styles.moreMembersText, { color }]}>+{remaining} more</ThemedText>
        </View>
      )}
      {visible.length === 0 && <ThemedText style={styles.emptyText}>None</ThemedText>}
    </View>
  );
}

export default function GroupStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors, gradients, friendDetail: theme, isDark } = useThemeColors();
  const [isExporting, setIsExporting] = useState(false);
  const [showAllContributors, setShowAllContributors] = useState(false);
  const currentUserId = user?.id || '';
  const queryKey = queryKeys.groups.detail(currentUserId, id);
  const { data, error, isLoading, refetch } = useQuery({
    queryKey,
    enabled: !!currentUserId && !!id,
    queryFn: () => groupDetailService.getDetail(currentUserId, id),
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="Group stats" onBack={() => router.back()} />
        <GenericSkeleton />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="Group stats" onBack={() => router.back()} />
        <AsyncErrorState title="Couldn't load stats" message={error ? getFetchErrorMessage(error) : 'This group is no longer available.'} onRetry={() => { void refetch(); }} />
      </View>
    );
  }

  const stats = calculateGroupStats(data);
  const avatarById = new Map(data.members.map(member => [member.userId, member.user?.avatar]));
  const topContributors = stats.payerTotals.slice(0, 3);
  const visibleContributors = showAllContributors ? stats.payerTotals : topContributors;
  const hasMoreContributors = stats.payerTotals.length > topContributors.length;
  const getsBack = stats.memberBalances.filter(member => member.balance > 0);
  const owes = stats.memberBalances.filter(member => member.balance < 0);
  const stackedColors = ['#7C5CFC', '#22C55E', '#F59E0B', '#3B82F6', '#EC4899'];
  const hasExpenses = data.expenses.length > 0;
  const averagePerPerson = data.members.length > 0 ? stats.totalSpent / data.members.length : 0;

  const handleExport = async () => {
    if (isExporting || !hasExpenses) return;

    try {
      setIsExporting(true);
      await exportGroupExpensesCsv(data);
    } catch (error) {
      console.error('Error exporting group expenses:', error);
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'We could not create the CSV file. Please try again.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
      <NavigationHeader
        title="Group stats"
        onBack={() => router.back()}
        rightAction={(
          <Pressable
            testID="export-group-expenses"
            accessibilityRole="button"
            accessibilityLabel={hasExpenses ? 'Export group expenses as CSV' : 'Export group expenses as CSV. Add an expense first.'}
            accessibilityState={{ disabled: !hasExpenses || isExporting, busy: isExporting }}
            disabled={!hasExpenses || isExporting}
            onPress={() => { void handleExport(); }}
            style={({ pressed }) => [
              styles.headerExportButton,
              {
                backgroundColor: hasExpenses ? theme.surface : theme.mutedSurface,
                borderColor: theme.surfaceBorder,
                opacity: pressed && hasExpenses && !isExporting ? 0.82 : hasExpenses ? 1 : 0.62,
              },
            ]}>
            {isExporting ? (
              <ActivityIndicator size="small" color={theme.actionIcon} />
            ) : (
              <IconSymbol name="doc.text.fill" size={18} color={hasExpenses ? theme.actionIcon : colors.textSecondary} />
            )}
          </Pressable>
        )}
      />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.groupIntro}>
          <GroupMark name={data.group.name} uri={data.group.imageUrl} />
          <View style={styles.groupIntroCopy}>
            <ThemedText type="title" style={[styles.groupName, !isDark && { color: colors.text }]} numberOfLines={2}>{data.group.name}</ThemedText>
            <ThemedText style={[styles.subtitle, !isDark && { color: colors.textSecondary }]}>{data.members.length} {data.members.length === 1 ? 'member' : 'members'}</ThemedText>
          </View>
        </View>

        <View style={[styles.snapshot, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <View style={styles.snapshotHeader}>
            <ThemedText style={[styles.snapshotEyebrow, { color: theme.actionIcon }]}>Trip snapshot</ThemedText>
            <ThemedText style={[styles.snapshotMeta, !isDark && { color: colors.textSecondary }]}>
              {formatDateRange(data.expenses)} · {data.members.length} members
            </ThemedText>
          </View>
          <View style={styles.snapshotHero}>
            <ThemedText style={[styles.snapshotTotalLabel, !isDark && { color: colors.textSecondary }]}>Total spent</ThemedText>
            <ThemedText style={[styles.snapshotTotalValue, { color: theme.actionIcon }]}>{formatCurrency(stats.totalSpent)}</ThemedText>
          </View>
          <View style={[styles.snapshotFooter, { borderTopColor: theme.surfaceBorder }]}>
            <View style={styles.snapshotMetric}>
              <ThemedText style={[styles.snapshotMetricValue, !isDark && { color: colors.text }]}>{formatCurrency(averagePerPerson)}</ThemedText>
              <ThemedText style={[styles.snapshotMetricLabel, !isDark && { color: colors.textSecondary }]}>per person</ThemedText>
            </View>
            <View style={[styles.snapshotMetricDivider, { backgroundColor: theme.surfaceBorder }]} />
            <View style={styles.snapshotMetric}>
              <ThemedText style={[styles.snapshotMetricValue, !isDark && { color: colors.text }]}>{stats.expenseCount}</ThemedText>
              <ThemedText style={[styles.snapshotMetricLabel, !isDark && { color: colors.textSecondary }]}>expenses</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Unsettled members" value={String(stats.unsettledMemberCount)} detail={`${data.members.length ? Math.round((stats.unsettledMemberCount / data.members.length) * 100) : 0}% of group`} icon="person.2.fill" color={theme.warning} surface={theme.surface} />
          <StatCard label="Outstanding" value={formatCurrency(stats.totalOutstanding)} detail="Payable between members" icon="creditcard.fill" color={theme.negative} surface={theme.surface} />
        </View>

        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>Top contributors</ThemedText>
            {hasMoreContributors ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showAllContributors ? 'Show fewer contributors' : `Show all ${stats.payerTotals.length} contributors`}
                onPress={() => setShowAllContributors(current => !current)}
                hitSlop={8}
                style={styles.expandContributorsButton}>
                <ThemedText style={[styles.sectionHint, { color: theme.actionIcon }]}>
                  {showAllContributors ? 'Show less' : `Show all (${stats.payerTotals.length})`}
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText style={[styles.sectionHint, !isDark && { color: colors.textSecondary }]}>Top 3</ThemedText>
            )}
          </View>
          <View accessible accessibilityLabel="Contribution distribution" style={styles.stackedBar}>
            {stats.payerTotals.map((payer, index) => (
              <View key={payer.userId} style={{ flex: stats.totalSpent > 0 ? payer.total / stats.totalSpent : 0, backgroundColor: stackedColors[index % stackedColors.length] }} />
            ))}
          </View>
          {visibleContributors.map((payer, index) => (
            <ContributorRow key={payer.userId} payer={payer} totalSpent={stats.totalSpent} avatarUri={avatarById.get(payer.userId)} color={stackedColors[index % stackedColors.length]} />
          ))}
          {topContributors.length === 0 && <ThemedText style={styles.emptyText}>No expenses recorded yet.</ThemedText>}
        </View>

        <View style={[styles.balanceSection, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <BalanceColumn title="Gets back" members={getsBack} color={theme.positive} avatarById={avatarById} surface={theme.positiveSurface} />
          <View style={[styles.balanceDivider, { backgroundColor: theme.surfaceBorder }]} />
          <BalanceColumn title="Owes" members={owes} color={theme.negative} avatarById={avatarById} surface={theme.negativeSurface} />
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  groupIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  groupIntroCopy: { flex: 1 },
  groupName: { fontSize: 24, lineHeight: 30, marginBottom: 3 },
  subtitle: { fontSize: 14, opacity: 0.7 },
  groupMarkWrap: { width: 56, height: 56, position: 'relative' },
  groupMarkGlow: { position: 'absolute', inset: -3, borderRadius: 19, opacity: 0.28 },
  groupMark: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  groupMarkFallback: { overflow: 'visible' },
  groupMarkText: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 30, textAlign: 'center', includeFontPadding: false },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  snapshot: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  snapshotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  snapshotEyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  snapshotMeta: { flexShrink: 1, fontSize: 12, opacity: 0.7, marginLeft: 8, textAlign: 'right' },
  snapshotHero: { paddingBottom: 10 },
  snapshotTotalLabel: { fontSize: 11, opacity: 0.72, marginBottom: 1 },
  snapshotTotalValue: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  snapshotFooter: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: 9 },
  snapshotMetric: { flex: 1, alignItems: 'center' },
  snapshotMetricDivider: { width: 1, height: 28 },
  snapshotMetricValue: { fontSize: 14, fontWeight: '700', marginBottom: 1 },
  snapshotMetricLabel: { fontSize: 10, opacity: 0.7 },
  headerExportButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statCard: { width: '48.8%', borderRadius: 12, padding: 11, minHeight: 108 },
  statIcon: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginBottom: 7 },
  statLabel: { fontSize: 11, opacity: 0.7, marginBottom: 4 },
  statValue: { fontSize: 19, fontWeight: '700', marginBottom: 4 },
  statDetail: { fontSize: 11, opacity: 0.62, lineHeight: 14 },
  section: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  expandContributorsButton: { minHeight: 28, justifyContent: 'center' },
  sectionHint: { fontSize: 12, opacity: 0.65 },
  stackedBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 15, backgroundColor: 'rgba(156, 163, 175, 0.18)' },
  contributorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
  contributorMain: { flex: 1 },
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarFallback: { overflow: 'hidden' },
  avatarInitial: { color: '#fff', fontWeight: '700' },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600' },
  rowAmount: { fontSize: 13, fontWeight: '600' },
  contributorBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(156, 163, 175, 0.18)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  percent: { width: 34, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  balanceSection: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  balanceColumn: { flex: 1, minWidth: 0 },
  balanceColumnTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  balanceDivider: { width: 1, marginHorizontal: 10 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 11 },
  balanceName: { flex: 1, fontSize: 12, fontWeight: '600' },
  balanceAmount: { fontSize: 12, fontWeight: '700' },
  moreMembers: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5 },
  moreMembersText: { fontSize: 11, fontWeight: '700' },
  emptyText: { fontSize: 13, opacity: 0.7 },
});
