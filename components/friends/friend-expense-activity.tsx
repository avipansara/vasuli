import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import type { MutableRefObject } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

type ExpenseItem = Extract<FriendActivityItem, { type: 'expense' | 'group_expense' }>;

type FriendExpenseActivityProps = {
  item: ExpenseItem;
  currentUserId: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  swipeableRefs: MutableRefObject<Map<string, SwipeableMethods>>;
  deletingExpenseId: string | null;
  onEditExpense: (expenseId: string) => void;
  onDeleteExpense: (expenseId: string) => void;
  onOpenExpense: (expenseId: string) => void;
  formatDate: (timestamp: number) => string;
  friendName: string;
  readOnly?: boolean;
};

const CATEGORY_MAP: Record<string, { icon: any, lightBg: string, darkBg: string, lightColor: string, darkColor: string }> = {
  'Food': { icon: 'fork.knife', lightBg: '#FCE7F3', darkBg: 'rgba(236, 72, 153, 0.15)', lightColor: '#BE185D', darkColor: '#F472B6' },
  'Transport': { icon: 'car.fill', lightBg: '#DCFCE7', darkBg: 'rgba(34, 197, 94, 0.15)', lightColor: '#15803D', darkColor: '#4ADE80' },
  'Travel': { icon: 'airplane', lightBg: '#E0E7FF', darkBg: 'rgba(99, 102, 241, 0.15)', lightColor: '#4338CA', darkColor: '#818CF8' },
  'Groceries': { icon: 'cart.fill', lightBg: '#FEF3C7', darkBg: 'rgba(245, 158, 11, 0.15)', lightColor: '#B45309', darkColor: '#FCD34D' },
  'Utilities': { icon: 'bolt.fill', lightBg: '#DBEAFE', darkBg: 'rgba(59, 130, 246, 0.15)', lightColor: '#1D4ED8', darkColor: '#60A5FA' },
};

function ExpenseSwipeAction({
  translation,
  side,
  backgroundColor,
  iconColor,
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  icon,
}: {
  translation: SharedValue<number>;
  side: 'left' | 'right';
  backgroundColor: string;
  iconColor: string;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  accessibilityState?: { busy?: boolean };
  icon: 'pencil' | 'trash';
}) {
  const actionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (side === 'left' ? translation.get() : -translation.get()) / 80)),
  }));

  return (
    <Reanimated.View style={[side === 'left' ? styles.swipeActionLeft : styles.swipeActionRight, { backgroundColor }, actionStyle]}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
        style={styles.swipeActionButton}>
        <IconSymbol name={icon} size={20} color={iconColor} />
        <ThemedText style={[styles.swipeActionText, { color: iconColor }]}>{label}</ThemedText>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

export function FriendExpenseActivity({
  item,
  currentUserId,
  colors,
  friendDetailTheme,
  isDark,
  swipeableRefs,
  deletingExpenseId,
  onEditExpense,
  onDeleteExpense,
  onOpenExpense,
  formatDate,
  friendName,
  readOnly = false,
}: FriendExpenseActivityProps) {
  const expense = item.expense;
  const canEdit = !readOnly && (expense.createdBy === currentUserId || expense.paidBy === currentUserId);
  const isGroupExpense = Boolean(expense.groupId);
  const sourceLabel = expense.groupName || (isGroupExpense ? 'Group' : 'Direct expense');
  const groupRelationship = isGroupExpense
    ? expense.paidBy === currentUserId && expense.friendShare > 0
      ? { amount: expense.friendShare, label: `${friendName.split(' ')[0]} owes you in this group`, color: friendDetailTheme.positive }
      : expense.paidBy !== currentUserId && expense.paidByName === friendName && expense.yourShare > 0
        ? { amount: expense.yourShare, label: `You owe ${friendName.split(' ')[0]} in this group`, color: friendDetailTheme.danger }
        : null
    : null;
  const amountColor = isGroupExpense
    ? (groupRelationship?.color ?? (isDark ? '#CBD5E1' : colors.textSecondary))
    : expense.paidBy === currentUserId ? friendDetailTheme.positive : friendDetailTheme.danger;
  const categoryStyle = (expense.category && CATEGORY_MAP[expense.category])
    ? CATEGORY_MAP[expense.category]
    : { icon: 'arrow.up.right', lightBg: '#F3F4F6', darkBg: 'rgba(156, 163, 175, 0.15)', lightColor: '#4B5563', darkColor: '#9CA3AF' };


  return (
    <ReanimatedSwipeable
      key={item.id}
      ref={(ref) => {
        if (ref) swipeableRefs.current.set(expense.id, ref);
        else swipeableRefs.current.delete(expense.id);
      }}
      renderLeftActions={canEdit ? (_progress, translation) => (
        <ExpenseSwipeAction
          translation={translation}
          side="left"
          backgroundColor={friendDetailTheme.actionSurface}
          iconColor={friendDetailTheme.actionIcon}
          label="Edit"
          icon="pencil"
          onPress={() => onEditExpense(expense.id)}
          accessibilityLabel={`Edit ${expense.description}`}
          accessibilityHint="Opens the edit expense screen"
        />
      ) : undefined}
      renderRightActions={canEdit ? (_progress, translation) => (
        <ExpenseSwipeAction
          translation={translation}
          side="right"
          backgroundColor={friendDetailTheme.dangerSurface}
          iconColor={friendDetailTheme.danger}
          label="Delete"
          icon="trash"
          onPress={() => onDeleteExpense(expense.id)}
          accessibilityLabel={`Delete ${expense.description}`}
          accessibilityHint="Deletes this expense after confirmation"
          accessibilityState={{ busy: deletingExpenseId === expense.id }}
        />
      ) : undefined}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      overshootFriction={8}
      enableTrackpadTwoFingerGesture
      containerStyle={{ overflow: 'visible' }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${expense.description}, ${sourceLabel}, ${formatDate(expense.date)}, ${expense.paidByName} paid $${expense.amount.toFixed(2)}, ${isGroupExpense ? groupRelationship ? `${groupRelationship.label}, $${groupRelationship.amount.toFixed(2)}` : 'no balance impact' : expense.paidBy === currentUserId ? `you are owed $${expense.friendShare.toFixed(2)}` : `you owe $${expense.yourShare.toFixed(2)}`}`}
        accessibilityHint="Opens expense details"
        activeOpacity={0.7}
        onPress={() => onOpenExpense(expense.id)}>
        <Reanimated.View style={[styles.expenseCard, {
          backgroundColor: colors.card,
          borderWidth: isDark ? 1 : 0,
          borderColor: colors.border,
          shadowColor: isDark ? 'transparent' : '#475569',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.09,
          shadowRadius: 0,
          elevation: isDark ? 0 : 4,
        }]}>
          <View style={[styles.expenseIcon, {
            backgroundColor: isDark ? categoryStyle.darkBg : categoryStyle.lightBg,
            borderRadius: 24,
            width: 48,
            height: 48,
          }]}>
            <IconSymbol
              size={20}
              name={categoryStyle.icon}
              color={isDark ? categoryStyle.darkColor : categoryStyle.lightColor}
            />
          </View>
          <View style={styles.expenseInfo}>
            <ThemedText type="subtitle" style={[styles.expenseDescription, { color: isDark ? '#F8FAFC' : colors.text }]} numberOfLines={1}>
              {expense.description}
            </ThemedText>
            <ThemedText style={[styles.expenseDate, { color: isDark ? '#94A3B8' : colors.textSecondary }]} numberOfLines={2}>
              {expense.paidBy === currentUserId ? 'Paid by you' : `Paid by ${expense.paidByName}`}{'\n'}{formatDate(expense.date)}
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
          <View style={styles.amountBlock}>
            <ThemedText type="title" style={[styles.expenseAmount, { color: amountColor }]}>
              {isGroupExpense
                ? groupRelationship ? `$${groupRelationship.amount.toFixed(2)}` : 'No balance impact'
                : expense.paidBy === currentUserId ? `+$${expense.friendShare.toFixed(2)}` : `-$${expense.yourShare.toFixed(2)}`}
            </ThemedText>
            <View style={[styles.badge, { backgroundColor: isGroupExpense ? friendDetailTheme.settledSurface : expense.paidBy === currentUserId ? friendDetailTheme.positiveSurface : friendDetailTheme.dangerSurface }]}>
              <ThemedText style={[styles.badgeText, { color: isGroupExpense ? friendDetailTheme.actionIcon : expense.paidBy === currentUserId ? friendDetailTheme.positive : friendDetailTheme.danger }]}>
                {isGroupExpense
                  ? groupRelationship?.label ?? 'No balance impact'
                  : expense.paidBy === currentUserId ? `${friendName.split(' ')[0]} owes` : 'You owe'}
              </ThemedText>
            </View>
          </View>
        </Reanimated.View>
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  swipeActionLeft: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: 80,
    borderRadius: 12,
    marginBottom: 8,
  },
  swipeActionRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 80,
    borderRadius: 12,
    marginBottom: 8,
  },
  swipeActionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    gap: 4,
  },
  swipeActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
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
    fontSize: 11,
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
  amountBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '700',
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
