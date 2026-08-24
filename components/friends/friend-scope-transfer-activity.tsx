import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { formatCurrency } from '@/utils/currency';
import { getFirstName } from '@/utils/validation';
import type { MutableRefObject } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

type ScopeTransferItem = Extract<FriendActivityItem, { type: 'scope_transfer' }>;

type FriendScopeTransferActivityProps = {
  item: ScopeTransferItem;
  friendName: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  formatDate: (timestamp: number) => string;
  canReverse: boolean;
  onReverse: () => void;
  swipeableRefs: MutableRefObject<Map<string, SwipeableMethods>>;
};

function ReverseSwipeAction({
  translation,
  backgroundColor,
  iconColor,
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  translation: SharedValue<number>;
  backgroundColor: string;
  iconColor: string;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
}) {
  const actionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -translation.get() / 80)),
  }));

  return (
    <Reanimated.View style={[styles.swipeActionRight, { backgroundColor }, actionStyle]}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={styles.swipeActionButton}>
        <IconSymbol name="arrow.clockwise" size={20} color={iconColor} />
        <ThemedText style={[styles.swipeActionText, { color: iconColor }]}>{label}</ThemedText>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

export function FriendScopeTransferActivity({
  item,
  friendName,
  colors,
  friendDetailTheme,
  isDark,
  formatDate,
  canReverse,
  onReverse,
  swipeableRefs,
}: FriendScopeTransferActivityProps) {
  const groupName = item.groupName ?? 'shared group';
  const movedByYou = item.direction === 'you_paid_friend';
  const title = item.isReversal
    ? 'Reversed balance offset'
    : movedByYou ? 'Moved to friendship balance' : 'Moved from friendship balance';

  return (
    <ReanimatedSwipeable
      ref={(ref) => {
        if (ref) swipeableRefs.current.set(item.id, ref);
        else swipeableRefs.current.delete(item.id);
      }}
      renderRightActions={canReverse && !item.isReversal ? (_progress, translation) => (
        <ReverseSwipeAction
          translation={translation}
          backgroundColor={friendDetailTheme.dangerSurface}
          iconColor={friendDetailTheme.danger}
          label="Reverse"
          onPress={() => {
            swipeableRefs.current.get(item.id)?.close();
            onReverse();
          }}
          accessibilityLabel="Reverse settlement"
          accessibilityHint="Reverses this settlement"
        />
      ) : undefined}
      overshootRight={false}
      friction={2}
      overshootFriction={8}
      enableTrackpadTwoFingerGesture
      containerStyle={{ overflow: 'visible' }}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}, ${groupName}, ${formatCurrency(item.amount, item.currency)}, ${formatDate(item.date)}`}
        style={[styles.card, isDark ? {
          backgroundColor: '#000000',
          borderWidth: 0,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          shadowColor: '#64748b',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 4,
        } : { backgroundColor: '#ffffff' }]}>
        <View style={[styles.icon, { backgroundColor: isDark ? '#1e293b' : '#E0F2FE' }]}>
          <IconSymbol name="arrow.right" size={20} color={isDark ? '#7DD3FC' : '#0369A1'} />
        </View>
        <View style={styles.info}>
          <ThemedText type="subtitle" style={{ color: isDark ? '#F8FAFC' : colors.text }} numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: isDark ? '#94A3B8' : colors.textSecondary }]} numberOfLines={2}>
            {groupName} • {formatDate(item.date)}{`\n`}{getFirstName(friendName)}{item.isReversal ? ' • Reversal' : ''}
          </ThemedText>
        </View>
        <ThemedText type="subtitle" style={[styles.amount, { color: isDark ? '#7DD3FC' : '#0369A1' }]}>
          {formatCurrency(item.amount, item.currency)}
        </ThemedText>
      </View>
    </ReanimatedSwipeable>
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
  swipeActionRight: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 8,
  },
  swipeActionButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  swipeActionText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
