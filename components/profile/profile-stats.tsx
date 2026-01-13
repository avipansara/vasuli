import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface ProfileStatsProps {
  groupCount: number;
  friendCount: number;
  expenseCount: number;
}

export function ProfileStats({ groupCount, friendCount, expenseCount }: ProfileStatsProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        !isDark && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      <View style={styles.stat}>
        <ThemedText style={[styles.statValue, !isDark && { color: colors.text }]}>
          {groupCount}
        </ThemedText>
        <ThemedText style={[styles.statLabel, !isDark && { color: colors.textSecondary }]}>
          Groups
        </ThemedText>
      </View>
      <View style={[styles.divider, !isDark && { backgroundColor: colors.border }]} />
      <View style={styles.stat}>
        <ThemedText style={[styles.statValue, !isDark && { color: colors.text }]}>
          {friendCount}
        </ThemedText>
        <ThemedText style={[styles.statLabel, !isDark && { color: colors.textSecondary }]}>
          Friends
        </ThemedText>
      </View>
      <View style={[styles.divider, !isDark && { backgroundColor: colors.border }]} />
      <View style={styles.stat}>
        <ThemedText style={[styles.statValue, !isDark && { color: colors.text }]}>
          {expenseCount}
        </ThemedText>
        <ThemedText style={[styles.statLabel, !isDark && { color: colors.textSecondary }]}>
          Expenses
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.1)',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(45, 212, 191, 0.2)',
    marginVertical: 4,
  },
});
