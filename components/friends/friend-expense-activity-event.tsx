import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type ExpenseActivityEvent = Extract<FriendActivityItem, { type: 'expense_activity' }>;

type FriendExpenseActivityEventProps = {
  item: ExpenseActivityEvent;
  currentUserId: string;
  friendName: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
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
  const isGroupExpense = Boolean(item.groupId);
  const sourceLabel = item.groupName || (isGroupExpense ? 'Group' : 'Direct expense');

  const content = (
    <View style={[styles.updateCard, {
      backgroundColor: colors.card,
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
      shadowColor: isDark ? '#000000' : '#475569',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.32 : 0.09,
      shadowRadius: 0,
      elevation: 4,
    }]}>
      <View style={[styles.updateIcon, { backgroundColor: iconSurface }]}>
        <IconSymbol size={20} name={iconName} color={statusColor} />
      </View>
      <View style={styles.updateInfo}>
        <View style={styles.activityEventTitleRow}>
          <ThemedText
            type="subtitle"
            style={[styles.updateTitle, { color: isDark ? '#F8FAFC' : colors.text }]}
            numberOfLines={1}>
            {title}
          </ThemedText>
          <View style={[styles.activityEventBadge, { backgroundColor: iconSurface }]}>
            <ThemedText style={[styles.activityEventBadgeText, { color: statusColor }]}>
              {statusLabel}
            </ThemedText>
          </View>
        </View>
        <ThemedText style={[styles.updateMeta, { color: isDark ? '#94A3B8' : colors.textSecondary }]} numberOfLines={1}>
          {formatDate(item.date)} • {actorName}
        </ThemedText>
        <View style={[styles.sourcePill, { backgroundColor: isGroupExpense ? friendDetailTheme.positiveSurface : friendDetailTheme.settledSurface }]}>
          <IconSymbol
            size={12}
            name={isGroupExpense ? 'person.3.fill' : 'person.fill'}
            color={isGroupExpense ? friendDetailTheme.positive : friendDetailTheme.actionIcon}
          />
          <ThemedText style={[styles.sourceLabel, { color: isGroupExpense ? friendDetailTheme.positive : friendDetailTheme.actionIcon }]} numberOfLines={1}>
            {sourceLabel}
          </ThemedText>
        </View>
      </View>
      {amountLabel && (
        <View style={styles.updateAmountBlock}>
          <ThemedText style={[styles.updateStatus, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>Total</ThemedText>
          <ThemedText
            type="subtitle"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={[styles.updateAmount, { color: isDark ? '#F8FAFC' : colors.text }]}>
            {amountLabel}
          </ThemedText>
        </View>
      )}
      {isDeleted ? (
        <View style={[styles.updateAction, { backgroundColor: iconSurface }]}>
          <IconSymbol size={17} name="trash.fill" color={statusColor} />
        </View>
      ) : (
        <View style={[styles.updateAction, { backgroundColor: iconSurface }]}>
          <IconSymbol size={17} name="chevron.right" color={statusColor} />
        </View>
      )}
    </View>
  );

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${statusLabel} ${title}, ${sourceLabel}, ${formatDate(item.date)}, by ${actorName}`}
      accessibilityHint="Opens expense details"
      activeOpacity={0.7}
      onPress={() => onOpenExpense(item.targetId)}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  updateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 0,
    gap: 10,
  },
  updateInfo: {
    flex: 1,
    minWidth: 0,
  },
  updateTitle: {
    flexShrink: 1,
    fontSize: 16,
  },
  updateMeta: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  sourcePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 5,
    borderRadius: 999,
  },
  sourceLabel: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
  },
  updateAmountBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 62,
    paddingLeft: 2,
  },
  updateStatus: {
    fontSize: 11,
    marginBottom: 2,
  },
  updateAmount: {
    fontSize: 16,
  },
  updateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityEventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  activityEventBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activityEventBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
