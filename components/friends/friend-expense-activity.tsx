import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { FriendActivityItem } from '@/services/friend-detail-service';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import type { MutableRefObject } from 'react';

type ExpenseItem = Extract<FriendActivityItem, { type: 'expense' }>;

type FriendExpenseActivityProps = {
  item: ExpenseItem;
  currentUserId: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  swipeableRefs: MutableRefObject<Map<string, Swipeable>>;
  deletingExpenseId: string | null;
  onEditExpense: (expenseId: string) => void;
  onDeleteExpense: (expenseId: string) => void;
  onOpenExpense: (expenseId: string) => void;
  formatDate: (timestamp: number) => string;
};

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
}: FriendExpenseActivityProps) {
  const expense = item.expense;
  const canEdit = expense.createdBy === currentUserId || expense.paidBy === currentUserId;

  return (
    <Swipeable
      key={item.id}
      ref={(ref) => {
        if (ref) swipeableRefs.current.set(expense.id, ref);
        else swipeableRefs.current.delete(expense.id);
      }}
      renderLeftActions={canEdit ? (_progress, dragX) => (
        <Animated.View style={[styles.swipeActionLeft, {
          backgroundColor: friendDetailTheme.actionSurface,
          opacity: dragX.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' }),
        }]}> 
          <TouchableOpacity
            onPress={() => onEditExpense(expense.id)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${expense.description}`}
            accessibilityHint="Opens the edit expense screen"
            style={styles.swipeActionButton}>
            <IconSymbol name="pencil" size={20} color={friendDetailTheme.actionIcon} />
            <ThemedText style={[styles.swipeActionText, { color: friendDetailTheme.actionIcon }]}>Edit</ThemedText>
          </TouchableOpacity>
        </Animated.View>
      ) : undefined}
      renderRightActions={canEdit ? (_progress, dragX) => (
        <Animated.View style={[styles.swipeActionRight, {
          backgroundColor: friendDetailTheme.dangerSurface,
          opacity: dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' }),
        }]}> 
          <TouchableOpacity
            onPress={() => onDeleteExpense(expense.id)}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${expense.description}`}
            accessibilityHint="Deletes this expense after confirmation"
            accessibilityState={{ busy: deletingExpenseId === expense.id }}
            style={styles.swipeActionButton}>
            <IconSymbol name="trash" size={20} color={friendDetailTheme.danger} />
            <ThemedText style={[styles.swipeActionText, { color: friendDetailTheme.danger }]}>Delete</ThemedText>
          </TouchableOpacity>
        </Animated.View>
      ) : undefined}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      overshootFriction={8}
      enableTrackpadTwoFingerGesture
      containerStyle={{ overflow: 'visible' }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${expense.description}, ${formatDate(expense.date)}, ${expense.paidByName} paid $${expense.amount.toFixed(2)}, ${expense.paidBy === currentUserId ? `you are owed $${expense.friendShare.toFixed(2)}` : `you owe $${expense.yourShare.toFixed(2)}`}`}
        accessibilityHint="Opens expense details"
        activeOpacity={0.7}
        onPress={() => onOpenExpense(expense.id)}>
        <Animated.View style={[styles.expenseCard, {
          backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
          borderWidth: 0,
          shadowColor: isDark ? '#000000' : '#475569',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: isDark ? 0.35 : 0.09,
          shadowRadius: 10,
          elevation: 3,
        }]}> 
          <View style={[styles.expenseIcon, {
            backgroundColor: expense.paidBy === currentUserId
              ? (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(15, 76, 58, 0.08)')
              : (isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.08)'),
          }]}> 
            <IconSymbol
              size={15}
              name={expense.groupId ? 'person.2.fill' : 'arrow.up.right'}
              color={expense.paidBy === currentUserId ? (isDark ? '#2DD4BF' : '#0F4C3A') : colors.error}
            />
          </View>
          <View style={styles.expenseInfo}>
            <ThemedText type="subtitle" style={[styles.expenseDescription, { color: colors.text }]} numberOfLines={1}>
              {expense.description}
            </ThemedText>
            <ThemedText style={[styles.expenseDate, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatDate(expense.date)} • {expense.paidByName} paid ${expense.amount.toFixed(2)}
            </ThemedText>
          </View>
          <ThemedText type="subtitle" style={[styles.expenseShare, { color: expense.paidBy === currentUserId ? (isDark ? '#2DD4BF' : '#0F4C3A') : colors.error }]}>
            {expense.paidBy === currentUserId ? `+$${expense.friendShare.toFixed(2)}` : `-$${expense.yourShare.toFixed(2)}`}
          </ThemedText>
          <IconSymbol size={17} name="chevron.right" color={colors.textSecondary} style={styles.expenseChevron} />
        </Animated.View>
      </TouchableOpacity>
    </Swipeable>
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
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
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
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 11,
  },
  expenseShare: {
    fontSize: 13,
    fontWeight: '700',
  },
  expenseChevron: {
    marginLeft: 8,
  },
});
