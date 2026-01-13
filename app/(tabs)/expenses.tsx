import { AddExpenseModal } from '@/components/expenses/add-expense-modal';
import { ExpenseListCard } from '@/components/expenses/expense-list-card';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { expenseService, groupService, initDatabase, userService } from '@/services/api';
import type { Expense, Group, User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function ExpensesScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { openModal } = useLocalSearchParams<{ openModal?: string }>();
  const [expenses, setExpenses] = useState<(Expense & { group?: Group })[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [splitType, setSplitType] = useState<'group' | 'friends'>('group');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (openModal === 'true') {
      setModalVisible(true);
    }
  }, [openModal]);

  async function loadData() {
    try {
      await initDatabase();
      const allGroups = await groupService.getAll();
      setGroups(allGroups);
      
      const allUsers = await userService.getAll();
      // Filter out current user from friends list
      setFriends(allUsers.filter(u => u.id !== 'current-user'));

      const allExpenses: (Expense & { group?: Group })[] = [];
      for (const group of allGroups) {
        const groupExpenses = await expenseService.getByGroup(group.id);
        allExpenses.push(...groupExpenses.map(e => ({ ...e, group })));
      }

      allExpenses.sort((a, b) => b.date - a.date);
      setExpenses(allExpenses);
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createExpense() {
    const hasValidSelection = splitType === 'group' ? selectedGroupId : selectedFriendIds.length > 0;
    if (!description.trim() || !amount.trim() || !hasValidSelection) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      const currentUserId = 'current-user';
      const currentUser = await userService.getById(currentUserId);
      if (!currentUser) {
        await userService.create({ name: 'You' });
      }

      if (splitType === 'group') {
        // Split with group members
        const members = await groupService.getMembers(selectedGroupId);
        const splitAmount = amountNum / members.length;

        await expenseService.create(
          {
            groupId: selectedGroupId,
            description: description.trim(),
            amount: amountNum,
            currency: 'USD',
            paidBy: currentUserId,
            date: Date.now(),
          },
          members.map(member => ({
            userId: member.userId,
            amount: splitAmount,
            splitType: 'equal' as const,
          }))
        );
      } else {
        // Split with friends (including current user)
        const splitUsers = [currentUserId, ...selectedFriendIds];
        const splitAmount = amountNum / splitUsers.length;

        await expenseService.create(
          {
            description: description.trim(),
            amount: amountNum,
            currency: 'USD',
            paidBy: currentUserId,
            date: Date.now(),
          },
          splitUsers.map(userId => ({
            userId,
            amount: splitAmount,
            splitType: 'equal' as const,
          }))
        );
      }

      setDescription('');
      setAmount('');
      setSelectedGroupId('');
      setSelectedFriendIds([]);
      setSplitType('group');
      setModalVisible(false);
      loadData();
    } catch (error) {
      console.error('Error creating expense:', error);
      Alert.alert('Error', 'Failed to create expense');
    }
  }

  // Calculate total spent
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={[styles.headerLabel, !isDark && { color: colors.textSecondary }]}>Total spent</ThemedText>
          <ThemedText type="header" style={[styles.headerAmount, !isDark && { color: colors.text }]}>${totalSpent.toFixed(2)}</ThemedText>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => {
            setDescription('');
            setAmount('');
            setSelectedGroupId('');
            setSelectedFriendIds([]);
            setSplitType('group');
            setModalVisible(true);
          }}>
          <View style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}>
            <IconSymbol size={20} name="plus" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : expenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <IconSymbol size={64} name="dollarsign.circle" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText type="subtitle" style={[styles.emptyTitle, !isDark && { color: colors.text }]}>
            No expenses yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
            Add an expense to start tracking
          </ThemedText>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setDescription('');
              setAmount('');
              setSelectedGroupId('');
              setSelectedFriendIds([]);
              setSplitType('group');
              setModalVisible(true);
            }}>
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
        <FlatList
          data={expenses}
          renderItem={({ item }) => <ExpenseListCard expense={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      {modalVisible && (
        <AddExpenseModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          description={description}
          setDescription={setDescription}
          amount={amount}
          setAmount={setAmount}
          groups={groups}
          friends={friends}
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
          selectedFriendIds={selectedFriendIds}
          setSelectedFriendIds={setSelectedFriendIds}
          splitType={splitType}
          setSplitType={setSplitType}
          onSubmit={createExpense}
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
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
  },
  headerLabel: {
    fontSize: 14,
    opacity: 0.6,
    color: '#fff',
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
    opacity: 0.6,
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
