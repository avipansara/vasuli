import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { User } from '@/types/database';
import React from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

interface UserWithBalance extends User {
  balance: number;
  recentExpenses?: import('@/types/database').Expense[];
}

interface FriendCardProps {
  friend: UserWithBalance;
  onPress?: (friend: UserWithBalance) => void;
  onDelete?: (friend: UserWithBalance) => void;
}

export function FriendCard({ friend, onPress, onDelete }: FriendCardProps) {
  const { colors, isDark } = useThemeColors();
  const balance = friend.balance;
  const balanceColor =
    balance > 0
      ? colors.success
      : balance < 0
        ? colors.error
        : colors.tint;

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const opacity = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.swipeActionRight, { opacity }]}>
        <TouchableOpacity
          onPress={() => onDelete?.(friend)}
          style={styles.swipeActionButton}>
          <IconSymbol name="trash" size={20} color="#fff" />
          <ThemedText style={styles.swipeActionText}>Delete</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Card styling for light/dark mode
  const cardStyle = isDark
    ? { backgroundColor: 'rgba(20, 35, 38, 0.6)' }
    : {
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      elevation: 2,
      // borderWidth: 1,
      // borderColor: colors.border,
    };

  return (
    <Swipeable
      renderRightActions={onDelete ? renderRightActions : undefined}
      overshootRight={false}
      friction={2}>
      <TouchableOpacity
        style={[styles.card, cardStyle]}
        onPress={() => onPress?.(friend)}
        activeOpacity={0.7}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: isDark
                ? 'rgba(45, 212, 191, 0.15)'
                : 'rgba(34, 197, 94, 0.12)',
            },
          ]}>
          <ThemedText style={[styles.avatarText, { color: colors.tint }]}>
            {friend.name.charAt(0).toUpperCase()}
          </ThemedText>
        </View>
        <View style={styles.info}>
          <ThemedText
            type="defaultSemiBold"
            style={[styles.name, { color: colors.text }]}>
            {friend.name}
          </ThemedText>
          {balance !== 0 ? (
            <View style={styles.recentExpenses}>
              {friend.recentExpenses && friend.recentExpenses.length > 0 ? (
                friend.recentExpenses.map((expense, index) => (
                  <View key={expense.id} style={styles.expenseBranchItem}>
                    <View style={styles.branchGraphics}>
                      <View
                        style={[
                          styles.vLine,
                          {
                            backgroundColor: colors.success,
                            height: index === (friend.recentExpenses?.length ?? 0) - 1 ? '50%' : '100%'
                          }
                        ]}
                      />
                      <View style={[styles.hLine, { backgroundColor: colors.success }]} />
                    </View>
                    <ThemedText
                      numberOfLines={1}
                      style={[styles.expenseDescription, { color: colors.textSecondary }]}>
                      {expense.description}
                    </ThemedText>
                  </View>
                ))
              ) : (
                <View style={styles.expenseBranchItem}>
                  <View style={styles.branchGraphics}>
                    <View style={[styles.vLine, { backgroundColor: colors.success, height: '50%' }]} />
                    <View style={[styles.hLine, { backgroundColor: colors.success }]} />
                  </View>
                  <ThemedText style={[styles.noExpenses, { color: colors.textSecondary }]}>
                    No pending expenses
                  </ThemedText>
                </View>
              )}
            </View>
          ) : (
            <ThemedText style={[styles.settledNote, { color: colors.textSecondary }]}>
              All settled up
            </ThemedText>
          )}
        </View>
        <View style={styles.balanceContainer}>
          {balance !== 0 ? (
            <>
              <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                ${Math.abs(balance).toFixed(2)}
              </ThemedText>
              <ThemedText style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                {balance > 0 ? 'owes you' : 'you owe'}
              </ThemedText>
            </>
          ) : (
            <ThemedText style={[styles.settledText, { color: colors.tint }]}>
              settled up ✓
            </ThemedText>
          )}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 10,
    borderRadius: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  email: {
    fontSize: 13,
    marginTop: 3,
  },
  settledNote: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  recentExpenses: {
    marginTop: 4,
  },
  expenseBranchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
  },
  branchGraphics: {
    width: 20,
    height: '100%',
    marginRight: 4,
  },
  vLine: {
    position: 'absolute',
    width: 1.5,
    left: 8,
    top: 0,
  },
  hLine: {
    position: 'absolute',
    height: 1.5,
    width: 10,
    left: 8,
    top: 11,
  },
  expenseDescription: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  noExpenses: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 17,
    fontWeight: '700',
  },
  balanceLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  settledText: {
    fontSize: 13,
    fontWeight: '500',
  },
  chevron: {
    marginLeft: 8,
  },
  swipeActionRight: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    marginBottom: 8,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  swipeActionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
