import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ACCENT_TEAL, BG_ICON_DARK, BG_ICON_LIGHT } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { Expense, User } from '@/types/database';
import { formatCurrency } from '@/utils/currency';
import { StyleSheet, View } from 'react-native';

interface ExpenseCardProps {
  expense: Expense & { paidByUser?: User };
}

export function ExpenseCard({ expense }: ExpenseCardProps) {
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
          { backgroundColor: isDark ? BG_ICON_DARK : BG_ICON_LIGHT },
        ]}>
        <IconSymbol
          size={24}
          name="dollarsign.circle.fill"
          color={isDark ? ACCENT_TEAL : colors.tint}
        />
      </View>
      <View style={styles.info}>
        <ThemedText
          type="defaultSemiBold"
          style={!isDark ? { color: colors.text } : undefined}>
          {expense.description}
        </ThemedText>
        <ThemedText style={[styles.date, !isDark && { color: colors.textSecondary }]}>
          {dateStr} • Paid by {expense.paidByUser?.name || 'Unknown'}
        </ThemedText>
      </View>
      <ThemedText style={[styles.amount, !isDark && { color: colors.text }]}>
        {formatCurrency(expense.amount, expense.currency)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(26, 26, 36, 0.6)',
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 0,
    elevation: 4,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  date: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
});
