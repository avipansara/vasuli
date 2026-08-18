import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { Animated, StyleSheet, View } from 'react-native';

type SettlementItem = Extract<FriendActivityItem, { type: 'settlement' }>;

type FriendSettlementActivityProps = {
  item: SettlementItem;
  friendName: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  formatDate: (timestamp: number) => string;
};

export function FriendSettlementActivity({
  item,
  friendName,
  colors,
  friendDetailTheme,
  isDark,
  formatDate,
}: FriendSettlementActivityProps) {
  const youPaid = item.direction === 'you_paid_friend';
  const firstName = friendName.split(' ')[0];
  const title = youPaid ? `You paid ${firstName}` : `${firstName} paid you`;
  const subtitle = item.groupId
    ? `${formatDate(item.date)} • Group settlement`
    : `${formatDate(item.date)} • Settlement`;
  const amountColor = colors.textSecondary; // Gray color for settled amounts based on mockup

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}, ${formatDate(item.date)}, ${youPaid ? 'you paid' : 'you received'} $${item.amount.toFixed(2)}`}
      style={[
        styles.expenseCard,
        {
          backgroundColor: isDark ? '#0d1321' : '#ffffff',
          borderWidth: 0,
          shadowColor: isDark ? '#000000' : '#475569',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.09,
          shadowRadius: 0,
          elevation: 4,
        },
      ]}>
      <View style={[styles.expenseIcon, {
        backgroundColor: isDark ? '#1e293b' : '#F3F4F6',
        borderRadius: 24,
        width: 48,
        height: 48,
      }]}>
        <IconSymbol size={20} name="checkmark" color={isDark ? '#94A3B8' : '#4B5563'} />
      </View>
      <View style={styles.expenseInfo}>
        <ThemedText type='subtitle' style={[styles.expenseDescription, { color: isDark ? '#F8FAFC' : colors.text }]} numberOfLines={1}>
          Settlement
        </ThemedText>
        <ThemedText style={[styles.expenseDate, { color: isDark ? '#94A3B8' : colors.textSecondary }]} numberOfLines={2}>
          {youPaid ? `You paid ${firstName}` : `${firstName} paid you`}{'\n'}{formatDate(item.date)}
        </ThemedText>
      </View>
      <View style={styles.amountBlock}>
        <ThemedText type='subtitle' style={[styles.expenseAmount, { color: isDark ? '#94A3B8' : amountColor }]}>
          ${item.amount.toFixed(2)}
        </ThemedText>
        <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : '#E5E7EB' }]}>
          <ThemedText style={[styles.badgeText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
            Settled
          </ThemedText>
        </View>
      </View>
    </Animated.View>
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
