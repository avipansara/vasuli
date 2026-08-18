import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';

type ScopeTransferItem = Extract<FriendActivityItem, { type: 'scope_transfer' }>;

type FriendScopeTransferActivityProps = {
  item: ScopeTransferItem;
  friendName: string;
  colors: Record<string, string>;
  isDark: boolean;
  formatDate: (timestamp: number) => string;
  canReverse: boolean;
  onReverse: () => void;
};

export function FriendScopeTransferActivity({
  item,
  friendName,
  colors,
  isDark,
  formatDate,
  canReverse,
  onReverse,
}: FriendScopeTransferActivityProps) {
  const groupName = item.groupName ?? 'shared group';
  const movedByYou = item.direction === 'you_paid_friend';
  const title = item.isReversal
    ? 'Reversed balance offset'
    : movedByYou ? 'Moved to friendship balance' : 'Moved from friendship balance';

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}, ${groupName}, ${item.currency} ${item.amount.toFixed(2)}, ${formatDate(item.date)}`}
      style={[styles.card, { backgroundColor: isDark ? '#0d1321' : '#ffffff' }]}>
      <View style={[styles.icon, { backgroundColor: isDark ? '#1e293b' : '#E0F2FE' }]}>
        <IconSymbol name="arrow.right" size={20} color={isDark ? '#7DD3FC' : '#0369A1'} />
      </View>
      <View style={styles.info}>
        <ThemedText type="subtitle" style={{ color: isDark ? '#F8FAFC' : colors.text }} numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: isDark ? '#94A3B8' : colors.textSecondary }]} numberOfLines={2}>
          {groupName} • {formatDate(item.date)}{`\n`}{friendName}{item.isReversal ? ' • Reversal' : ''}
        </ThemedText>
      </View>
      <ThemedText type="subtitle" style={[styles.amount, { color: isDark ? '#7DD3FC' : '#0369A1' }]}>
        {item.currency} {item.amount.toFixed(2)}
      </ThemedText>
      {canReverse && !item.isReversal ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Reverse settlement"
          hitSlop={8}
          onPress={onReverse}
          style={styles.reverseButton}>
          <ThemedText style={[styles.reverseButtonText, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>Reverse</ThemedText>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
    elevation: 3,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  info: { flex: 1, minWidth: 0 },
  subtitle: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  amount: { fontSize: 14, marginLeft: 8 },
  reverseButton: { marginLeft: 8, paddingVertical: 8, paddingHorizontal: 4 },
  reverseButtonText: { fontSize: 12, fontWeight: '700' },
});
