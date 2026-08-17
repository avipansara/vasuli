import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { Animated, TouchableOpacity, View } from 'react-native';

type ExpenseActivityEvent = Extract<FriendActivityItem, { type: 'expense_activity' }>;

type FriendExpenseActivityEventProps = {
  item: ExpenseActivityEvent;
  currentUserId: string;
  friendName: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  styles: Record<string, any>;
  formatDate: (timestamp: number) => string;
  onOpenExpense: (expenseId: string) => void;
};

export function FriendExpenseActivityEvent({
  item,
  currentUserId,
  friendName,
  colors,
  friendDetailTheme,
  isDark,
  styles,
  formatDate,
  onOpenExpense,
}: FriendExpenseActivityEventProps) {
  const isDeleted = item.isDeleted;
  const statusLabel = isDeleted ? 'Deleted' : 'Updated';
  const title = item.description.replace(/^(Deleted|Updated):\s*/i, '');
  const actorName = item.userId === currentUserId ? 'You' : item.userName || friendName.split(' ')[0];
  const statusColor = isDeleted ? friendDetailTheme.danger : friendDetailTheme.warning;
  const iconSurface = isDeleted ? friendDetailTheme.dangerSurface : friendDetailTheme.warningSurface;
  const iconName: IconSymbolName = isDeleted ? 'trash.fill' : 'pencil';
  const amountLabel = item.amount === undefined ? null : `$${item.amount.toFixed(2)}`;

  const content = (
    <Animated.View style={[styles.updateRow, {
      backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
      borderWidth: 0,
      shadowColor: isDark ? '#000000' : '#475569',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.35 : 0.09,
      shadowRadius: 10,
      elevation: 3,
    }]}> 
      <View style={[styles.updateMarker, { backgroundColor: statusColor }]} />
      <View style={styles.updateInfo}>
        <View style={styles.activityEventTitleRow}>
          <ThemedText style={[styles.updateTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </ThemedText>
          <View style={[styles.activityEventBadge, { backgroundColor: iconSurface }]}> 
            <ThemedText style={[styles.activityEventBadgeText, { color: statusColor }]}>
              {statusLabel}
            </ThemedText>
          </View>
        </View>
        <ThemedText style={[styles.updateMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {formatDate(item.date)} • {actorName}
        </ThemedText>
      </View>
      {amountLabel && (
        <View style={styles.updateAmountBlock}>
          <ThemedText style={[styles.updateStatus, { color: colors.textSecondary }]}>total</ThemedText>
          <ThemedText style={[styles.updateAmount, { color: colors.textSecondary }]}>{amountLabel}</ThemedText>
        </View>
      )}
      <View style={[styles.updateIcon, { backgroundColor: iconSurface }]}> 
        <IconSymbol size={16} name={iconName} color={statusColor} />
      </View>
    </Animated.View>
  );

  if (isDeleted) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${statusLabel} ${title}, ${formatDate(item.date)}, by ${actorName}`}>
        {content}
      </View>
    );
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${statusLabel} ${title}, ${formatDate(item.date)}, by ${actorName}`}
      accessibilityHint="Opens expense details"
      activeOpacity={0.7}
      onPress={() => onOpenExpense(item.targetId)}>
      {content}
    </TouchableOpacity>
  );
}
