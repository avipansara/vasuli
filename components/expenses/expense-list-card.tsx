import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { Expense, Group } from '@/types/database';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface ExpenseListCardProps {
  expense: Expense & { group?: Group };
}

export function ExpenseListCard({ expense }: ExpenseListCardProps) {
  const { colors, isDark } = useThemeColors();
  const date = new Date(expense.date);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
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
    fontSize: 15,
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
    fontSize: 12,
    opacity: 0.6,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
});
