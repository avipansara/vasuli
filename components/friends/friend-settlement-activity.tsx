import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { Animated, View } from 'react-native';

type SettlementItem = Extract<FriendActivityItem, { type: 'settlement' }>;

type FriendSettlementActivityProps = {
  item: SettlementItem;
  friendName: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  styles: Record<string, any>;
  formatDate: (timestamp: number) => string;
};

export function FriendSettlementActivity({
  item,
  friendName,
  colors,
  friendDetailTheme,
  isDark,
  styles,
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
