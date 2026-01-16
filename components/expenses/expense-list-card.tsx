import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/api';
import type { Expense, Group } from '@/types/database';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

interface ExpenseListCardProps {
  expense: Expense & { group?: Group };
  onDelete?: () => void;
}

export function ExpenseListCard({ expense, onDelete }: ExpenseListCardProps) {
  const { user } = useAuth();
  const { colors, isDark } = useThemeColors();
  const date = new Date(expense.date);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const handleEdit = () => {
    router.push(`/edit-expense/${expense.id}` as any);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${expense.description}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Log activity before deleting
              await activityService.logExpenseDeleted({
                expenseId: expense.id,
                userId: user?.id || '',
                userName: user?.name || 'Someone',
                description: expense.description,
                groupId: expense.groupId,
              });
              await expenseService.delete(expense.id);
              onDelete?.();
            } catch (error) {
              console.error('Error deleting expense:', error);
              Alert.alert('Error', 'Failed to delete expense');
            }
          },
        },
      ]
    );
  };

  const renderLeftActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const opacity = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.swipeActionLeft, { opacity }]}>
        <TouchableOpacity onPress={handleEdit} style={styles.swipeActionButton}>
          <IconSymbol name="pencil" size={20} color="#fff" />
          <ThemedText style={styles.swipeActionText}>Edit</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const opacity = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.swipeActionRight, { opacity }]}>
        <TouchableOpacity onPress={handleDelete} style={styles.swipeActionButton}>
          <IconSymbol name="trash" size={20} color="#fff" />
          <ThemedText style={styles.swipeActionText}>Delete</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
    >
    <View
      style={[
        styles.card,
        !isDark && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      <View
        style={[
          styles.icon,
          {
            backgroundColor: isDark
              ? 'rgba(45, 212, 191, 0.15)'
              : 'rgba(34, 197, 94, 0.1)',
          },
        ]}>
        <IconSymbol
          size={20}
          name="dollarsign.circle.fill"
          color={isDark ? '#2DD4BF' : colors.tint}
        />
      </View>
      <View style={styles.info}>
        <ThemedText
          type="defaultSemiBold"
          style={[styles.description, !isDark && { color: colors.text }]}>
          {expense.description}
        </ThemedText>
        <View style={styles.details}>
          {expense.group && (
            <ThemedText style={[styles.groupName, { color: isDark ? '#2DD4BF' : colors.tint }]}>
              {expense.group.name}
            </ThemedText>
          )}
          <ThemedText style={[styles.date, !isDark && { color: colors.textSecondary }]}>
            {dateStr}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={[styles.amount, !isDark && { color: colors.text }]}>
        ${expense.amount.toFixed(2)}
      </ThemedText>
    </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  description: {
    fontSize: 14,
    color: '#fff',
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  groupName: {
    fontSize: 12,
    fontWeight: '500',
  },
  date: {
    fontSize: 11,
    opacity: 0.6,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
  swipeActionLeft: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: 80,
    borderRadius: 12,
    marginBottom: 8,
  },
  swipeActionRight: {
    backgroundColor: '#ef4444',
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
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
