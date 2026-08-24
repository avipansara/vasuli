import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { formatCurrency } from '@/utils/currency';
import { getFirstName } from '@/utils/validation';
import type { MutableRefObject } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

type SettlementItem = Extract<FriendActivityItem, { type: 'settlement' }>;

type FriendSettlementActivityProps = {
  item: SettlementItem;
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

export function FriendSettlementActivity({
  item,
  friendName,
  colors,
  friendDetailTheme,
  isDark,
  formatDate,
  canReverse,
  onReverse,
  swipeableRefs,
}: FriendSettlementActivityProps) {
  const youPaid = item.direction === 'you_paid_friend';
  const firstName = getFirstName(friendName);
  const title = youPaid ? `You paid ${firstName}` : `${firstName} paid you`;
  const scopeLabel = item.groupId
    ? `Group${item.groupName ? ` · ${item.groupName}` : ''}`
    : 'Direct';
  const amountColor = colors.textSecondary; // Gray color for settled amounts based on mockup

  return (
    <ReanimatedSwipeable
      ref={(ref) => {
        if (ref) swipeableRefs.current.set(item.id, ref);
        else swipeableRefs.current.delete(item.id);
      }}
      renderRightActions={canReverse ? (_progress, translation) => (
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
        accessibilityActions={canReverse ? [{ name: 'reverse', label: 'Reverse settlement' }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'reverse') onReverse();
        }}
        accessibilityLabel={`${title}, ${scopeLabel}, ${formatDate(item.date)}, ${youPaid ? 'you paid' : 'you received'} ${formatCurrency(item.amount)}`}
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
    </ReanimatedSwipeable>
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
