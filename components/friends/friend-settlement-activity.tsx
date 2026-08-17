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
  const amountPrefix = youPaid ? '-' : '+';
  const amountColor = youPaid ? friendDetailTheme.negative : friendDetailTheme.positive;

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}, ${formatDate(item.date)}, ${youPaid ? 'you paid' : 'you received'} $${item.amount.toFixed(2)}`}
      style={[
        styles.updateRow,
        {
          backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
          borderWidth: 0,
          shadowColor: isDark ? '#000000' : '#475569',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: isDark ? 0.35 : 0.09,
          shadowRadius: 10,
          elevation: 3,
        },
      ]}>
      <View style={[styles.updateMarker, { backgroundColor: amountColor }]} />
      <View style={styles.updateInfo}>
        <ThemedText style={[styles.updateTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText style={[styles.updateMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      <View style={styles.updateAmountBlock}>
        <ThemedText style={[styles.updateStatus, { color: colors.textSecondary }]}>
          Settled
        </ThemedText>
        <ThemedText style={[styles.updateAmount, { color: amountColor }]}>
          {amountPrefix}${item.amount.toFixed(2)}
        </ThemedText>
      </View>
      <View style={[styles.updateIcon, { backgroundColor: youPaid ? friendDetailTheme.negativeSurface : friendDetailTheme.positiveSurface }]}> 
        <IconSymbol size={16} name="checkmark.circle.fill" color={amountColor} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 7,
    borderRadius: 10,
    borderWidth: 0,
    gap: 9,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  updateMarker: {
    width: 3,
    height: 28,
    borderRadius: 999,
  },
  updateInfo: {
    flex: 1,
    minWidth: 0,
  },
  updateTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  updateMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  updateAmountBlock: {
    alignItems: 'flex-end',
    minWidth: 58,
  },
  updateStatus: {
    fontSize: 10,
    marginBottom: 1,
  },
  updateAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  updateIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
