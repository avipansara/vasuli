import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { expenseService, groupService, initDatabase, userService } from '@/services/database';
import type { Expense, Group } from '@/types/database';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

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
        transparent={true}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">Add Expense</ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <IconSymbol size={24} name="xmark" color={Colors[colorScheme ?? 'light'].text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, {
                backgroundColor: Colors[colorScheme ?? 'light'].background,
                color: Colors[colorScheme ?? 'light'].text,
                borderColor: Colors[colorScheme ?? 'light'].icon,
              }]}
              placeholder="Description"
              placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
              value={description}
              onChangeText={setDescription}
            />

            <TextInput
              style={[styles.input, {
                backgroundColor: Colors[colorScheme ?? 'light'].background,
                color: Colors[colorScheme ?? 'light'].text,
                borderColor: Colors[colorScheme ?? 'light'].icon,
              }]}
              placeholder="Amount"
              placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />

            <View style={[styles.picker, { borderColor: Colors[colorScheme ?? 'light'].icon }]}>
              <ThemedText style={styles.pickerLabel}>Group:</ThemedText>
              <View style={styles.groupButtons}>
                {groups.map(group => (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.groupButton,
                      selectedGroupId === group.id && {
                        backgroundColor: Colors[colorScheme ?? 'light'].tint,
                      },
                    ]}
                    onPress={() => setSelectedGroupId(group.id)}>
                    <ThemedText
                      style={[
                        styles.groupButtonText,
                        selectedGroupId === group.id && { color: '#fff' },
                      ]}>
                      {group.name}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
              onPress={createExpense}>
              <ThemedText style={styles.submitButtonText}>Add Expense</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
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
    backgroundColor: '#f3f4f6',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  picker: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.6,
  },
  groupButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  groupButtonText: {
    fontSize: 14,
  },
  submitButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
