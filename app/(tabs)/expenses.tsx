import { ExpenseListCard } from '@/components/expenses/expense-list-card';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { expenseService, groupService, initDatabase } from '@/services/api';
import type { Expense, Group } from '@/types/database';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function ExpensesScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const [expenses, setExpenses] = useState<(Expense & { group?: Group })[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const hasLoadedOnce = useRef(false);

  const loadData = useCallback(async () => {
    if (!currentUserId) return;
    try {
      // Only show loader on first load
      if (!hasLoadedOnce.current) {
        setLoading(true);
        hasLoadedOnce.current = true;
      }
      await initDatabase();
      const allGroups = await groupService.getUserGroups(currentUserId);

      // Fetch only expenses involving the current user
      const allExpensesRaw = await expenseService.getUserExpenses(currentUserId);
      console.log('[Expenses] Raw expenses loaded:', allExpensesRaw.length);

      // Map expenses to include group info where applicable
      const allExpenses: (Expense & { group?: Group })[] = allExpensesRaw.map((e: Expense) => {
        const group = e.groupId ? allGroups.find((g: Group) => g.id === e.groupId) : undefined;
        return { ...e, group };
      });

      allExpenses.sort((a, b) => b.date - a.date);
      console.log('[Expenses] Final expenses to display:', allExpenses.length);
      setExpenses(allExpenses);
    } catch (error) {
      console.error('[Expenses] Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const renderExpenseItem = useCallback(
    ({ item }: { item: Expense & { group?: Group } }) => (
      <ExpenseListCard expense={item} onDelete={loadData} />
    ),
    [loadData]
  );

  const renderExpenseSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <View style={styles.sectionHeader}>
        <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title}</ThemedText>
      </View>
    ),
    [colors.textSecondary]
  );

  // Calculate total spent
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Group expenses by time period
  function getTimePeriod(timestamp: number): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0 && date.toDateString() === now.toDateString()) return 'Today';
    if (diffDays === 1 || (diffDays === 0 && date.toDateString() !== now.toDateString())) return 'Yesterday';
    if (diffDays < 7) return 'This Week';
    if (diffDays < 30) return 'This Month';
    return 'Earlier';
  }

  const groupedExpenses = expenses.reduce((acc, expense) => {
    const period = getTimePeriod(expense.date);
    const existing = acc.find(g => g.title === period);
    if (existing) {
      existing.data.push(expense);
    } else {
      acc.push({ title: period, data: [expense] });
    }
    return acc;
  }, [] as { title: string; data: (Expense & { group?: Group })[] }[]);

  return (
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={[styles.headerLabel, { color: colors.textSecondary }]}>Total spent</ThemedText>
          <ThemedText type="header" style={[styles.headerAmount, { color: colors.text }]}>${totalSpent.toFixed(2)}</ThemedText>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.push('/add-expense')}>
          <View style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}>
            <IconSymbol size={20} name="plus" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState />
      ) : expenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <IconSymbol size={64} name="dollarsign.circle" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText type="subtitle" style={[styles.emptyTitle, { color: colors.text }]}>
            No expenses yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
            Add an expense to start tracking
          </ThemedText>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/add-expense')}>
            <LinearGradient
              colors={gradients.buttonPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.createButtonGradient}>
              <ThemedText style={styles.createButtonText}>Add Expense</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={groupedExpenses}
          renderItem={renderExpenseItem}
          renderSectionHeader={renderExpenseSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerAmount: {
    color: '#fff',
  },
  addButtonRect: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expenseCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  expenseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  expenseDescription: {
    fontSize: 14,
    marginBottom: 2,
  },
  expenseDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 11,
    opacity: 0.6,
  },
  expenseDate: {
    fontSize: 11,
    opacity: 0.6,
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amount: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  paidLabel: {
    fontSize: 10,
    opacity: 0.6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalContent: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 20 : 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonRect: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    padding: 24,
    paddingTop: 0,
    flexGrow: 1,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.7,
  },
  modalFooter: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
  },
  picker: {
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.7,
  },
  groupButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  groupButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  submitButton: {
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  createButton: {
    marginTop: 24,
    borderRadius: 24,
    overflow: 'hidden',
  },
  createButtonGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  createButtonText: {
    color: '#0A0A0F',
    fontWeight: '600',
    fontSize: 14,
  },
  glassInput: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    color: '#f4f4f5',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  groupButtonSelected: {
    backgroundColor: '#2DD4BF',
    borderColor: '#2DD4BF',
  },
  groupButtonUnselected: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  modalKeyboard: {
    flex: 1,
  },
  expenseHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  expenseIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  expenseTitle: {
    color: '#fff',
    marginBottom: 8,
    lineHeight: 32,
  },
  expenseSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  privacyNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
