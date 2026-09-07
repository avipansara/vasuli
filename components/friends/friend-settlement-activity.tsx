import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { formatCurrency } from '@/utils/currency';
import { getFirstName } from '@/utils/validation';
import { StyleSheet, View } from 'react-native';

type SettlementItem = Extract<FriendActivityItem, { type: 'settlement' }>;

type FriendSettlementActivityProps = {
  item: SettlementItem;
  friendName: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  formatDate: (timestamp: number) => string;
};

/**
 * ADR-0004 ticket 05: legacy payments without an operation ID stay readable
 * as plain payment cards. There is no Reverse/transfer UI here — every
 * operation-bearing settlement deletes through the shared Delete dialog
 * (`useSettlementDeleteFlow`), and legacy rows carry no operation to delete.
 * The `reverse_settlement_operation` RPC is untouched; it simply has no
 * call site on this surface.
 */
export function FriendSettlementActivity({
  item,
  friendName,
  colors,
  friendDetailTheme,
  isDark,
  formatDate,
}: FriendSettlementActivityProps) {
  const youPaid = item.direction === 'you_paid_friend';
  const firstName = getFirstName(friendName);
  const title = youPaid ? `You paid ${firstName}` : `${firstName} paid you`;
  const scopeLabel = item.groupId
    ? `Group${item.groupName ? ` · ${item.groupName}` : ''}`
    : 'Direct';
  const amountColor = colors.textSecondary; // Gray color for settled amounts based on mockup

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}, ${scopeLabel}, ${formatDate(item.date)}, ${youPaid ? 'you paid' : 'you received'} ${formatCurrency(item.amount)}`}
      testID={`friend-settlement-${item.settlementId}`}
      style={[
        styles.expenseCard,
        {
          backgroundColor: colors.card,
          borderWidth: 0,
          borderColor: colors.border,
          shadowColor: isDark ? '#64748b' : '#475569',
          shadowOffset: { width: 0, height: isDark ? 4 : 2 },
          shadowOpacity: isDark ? 0.15 : 0.09,
          shadowRadius: isDark ? 4 : 0,
          elevation: 4,
        },
      ]}>
      <View style={[styles.expenseIcon, {
        backgroundColor: friendDetailTheme.positiveSurface,
        borderRadius: 20,
        width: 40,
        height: 40,
      }]}>
        <IconSymbol size={20} name="checkmark.circle.fill" color={friendDetailTheme.positive} />
      </View>
      <View style={styles.expenseInfo}>
        <ThemedText type='subtitle' style={[styles.expenseDescription, { color: isDark ? '#F8FAFC' : colors.text }]} numberOfLines={1}>
          {item.groupId ? 'Group settlement' : 'Settlement'}
        </ThemedText>
        <ThemedText style={[styles.expenseDate, { color: isDark ? '#94A3B8' : colors.textSecondary }]} numberOfLines={2}>
          {youPaid ? `You paid ${firstName}` : `${firstName} paid you`}{'\n'}{scopeLabel} · {formatDate(item.date)}
        </ThemedText>
      </View>
      <View style={styles.amountBlock}>
        <ThemedText type='subtitle' style={[styles.expenseAmount, { color: isDark ? '#94A3B8' : amountColor }]}>
          {formatCurrency(item.amount)}
        </ThemedText>
        <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : '#E5E7EB' }]}>
          <ThemedText style={[styles.badgeText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
            Settled
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 0,
    elevation: 4,
  },
  expenseIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  expenseInfo: {
    flex: 1,
    minWidth: 0,
  },
  expenseDescription: {
    flexShrink: 1,
    fontSize: 16,
  },
  expenseDate: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  amountBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  expenseAmount: {
    fontSize: 16,
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
});
