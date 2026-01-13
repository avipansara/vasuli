import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { expenseService, groupService, initDatabase, userService } from '@/services/database';
import type { Expense, Group } from '@/types/database';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export default function ExpensesScreen() {
  const colorScheme = useColorScheme();
  const [expenses, setExpenses] = useState<(Expense & { group?: Group })[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      await initDatabase();
      const allGroups = await groupService.getAll();
      setGroups(allGroups);

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
    if (!description.trim() || !amount.trim() || !selectedGroupId) {
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

      setDescription('');
      setAmount('');
      setSelectedGroupId('');
      setModalVisible(false);
      loadData();
    } catch (error) {
      console.error('Error creating expense:', error);
      Alert.alert('Error', 'Failed to create expense');
    }
  }

  function renderExpense({ item }: { item: Expense & { group?: Group } }) {
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
      <View style={[styles.expenseCard, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <View style={styles.expenseIcon}>
          <IconSymbol size={24} name="dollarsign.circle.fill" color={Colors[colorScheme ?? 'light'].tint} />
        </View>
        <View style={styles.expenseInfo}>
          <ThemedText type="defaultSemiBold" style={styles.expenseDescription}>
            {item.description}
          </ThemedText>
          <View style={styles.expenseDetails}>
            {item.group && (
              <ThemedText style={styles.groupName}>{item.group.name}</ThemedText>
            )}
            <ThemedText style={styles.expenseDate}> • {dateStr}</ThemedText>
          </View>
        </View>
        <View style={styles.amountContainer}>
          <ThemedText style={styles.amount}>${item.amount.toFixed(2)}</ThemedText>
          <ThemedText style={styles.paidLabel}>you paid</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <ThemedText type="title">Expenses</ThemedText>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={() => setModalVisible(true)}>
          <IconSymbol size={24} name="plus" color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : expenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol size={64} name="dollarsign.circle" color={Colors[colorScheme ?? 'light'].icon} />
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No expenses yet
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Add an expense to start tracking
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={expenses}
          renderItem={renderExpense}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle" style={styles.modalTitle}>Add Expense</ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <IconSymbol size={28} name="xmark.circle.fill" color={Colors[colorScheme ?? 'light'].icon} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Description</ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f9fafb',
                    color: Colors[colorScheme ?? 'light'].text,
                    borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                  }]}
                  placeholder="e.g. Dinner at Mario's"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
                  value={description}
                  onChangeText={setDescription}
                  autoFocus
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Amount</ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f9fafb',
                    color: Colors[colorScheme ?? 'light'].text,
                    borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                  }]}
                  placeholder="0.00"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Group</ThemedText>
                <View style={styles.groupButtons}>
                  {groups.map(group => (
                    <TouchableOpacity
                      key={group.id}
                      style={[
                        styles.groupButton,
                        selectedGroupId === group.id && {
                          backgroundColor: Colors[colorScheme ?? 'light'].tint,
                          borderColor: Colors[colorScheme ?? 'light'].tint,
                        },
                        selectedGroupId !== group.id && {
                          backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f3f4f6',
                          borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                        }
                      ]}
                      onPress={() => setSelectedGroupId(group.id)}>
                      <ThemedText
                        style={[
                          styles.groupButtonText,
                          selectedGroupId === group.id && { color: '#fff' },
                          selectedGroupId !== group.id && { color: Colors[colorScheme ?? 'light'].text }
                        ]}>
                        {group.name}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={createExpense}
                disabled={!description.trim() || !amount.trim() || !selectedGroupId}>
                <View
                  style={[
                    styles.submitButton,
                    { backgroundColor: (!description.trim() || !amount.trim() || !selectedGroupId) ? (colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8') : Colors[colorScheme ?? 'light'].text },
                    (!description.trim() || !amount.trim() || !selectedGroupId) && styles.disabledButton
                  ]}>
                  <ThemedText style={[styles.submitButtonText, { color: Colors[colorScheme ?? 'light'].background }]}>Add Expense</ThemedText>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
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
    paddingTop: 60,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  expenseCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  expenseDescription: {
    fontSize: 16,
    marginBottom: 4,
  },
  expenseDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 12,
    opacity: 0.6,
  },
  expenseDate: {
    fontSize: 12,
    opacity: 0.6,
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  paidLabel: {
    fontSize: 11,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 40,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  modalScrollContent: {
    padding: 24,
    paddingTop: 0,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
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
    padding: 16,
    fontSize: 16,
  },
  picker: {
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.7,
  },
  groupButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  groupButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  submitButton: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
