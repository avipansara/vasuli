import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { expenseService, groupService, initDatabase, userService } from '@/services/api';
import type { Expense, Group } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
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
      <LinearGradient
        colors={Gradients.cardPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.expenseCard}>
        <View style={styles.expenseIcon}>
          <IconSymbol size={24} name="dollarsign.circle.fill" color="#2DD4BF" />
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
      </LinearGradient>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={Gradients.hero}
        style={styles.header}>
        <ThemedText type="title">Expenses</ThemedText>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}>
          <LinearGradient
            colors={Gradients.buttonPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addButtonGradient}>
            <IconSymbol size={24} name="plus" color="#0A0A0F" />
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : expenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <IconSymbol size={64} name="dollarsign.circle" color="#2DD4BF" />
          </View>
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No expenses yet
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Add an expense to start tracking
          </ThemedText>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setModalVisible(true)}>
            <LinearGradient
              colors={Gradients.buttonPrimary}
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
          <View style={[styles.modalContent, { backgroundColor: '#0A0A0F' }]}>
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
                  style={[styles.input, styles.glassInput]}
                  placeholder="e.g. Dinner at Mario's"
                  placeholderTextColor="#6B7280"
                  value={description}
                  onChangeText={setDescription}
                  autoFocus
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Amount</ThemedText>
                <TextInput
                  style={[styles.input, styles.glassInput]}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
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
                        selectedGroupId === group.id && styles.groupButtonSelected,
                        selectedGroupId !== group.id && styles.groupButtonUnselected,
                      ]}
                      onPress={() => setSelectedGroupId(group.id)}>
                      <ThemedText
                        style={[
                          styles.groupButtonText,
                          selectedGroupId === group.id && { color: '#0A0A0F' },
                          selectedGroupId !== group.id && { color: '#f4f4f5' }
                        ]}>
                        {group.name}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: 'rgba(45, 212, 191, 0.15)' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={createExpense}
                disabled={!description.trim() || !amount.trim() || !selectedGroupId}>
                <LinearGradient
                  colors={(!description.trim() || !amount.trim() || !selectedGroupId) ? ['#1A1A24', '#12121A'] : Gradients.buttonPrimary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.submitButton,
                    (!description.trim() || !amount.trim() || !selectedGroupId) && styles.disabledButton
                  ]}>
                  <ThemedText style={[styles.submitButtonText, { color: (!description.trim() || !amount.trim() || !selectedGroupId) ? '#6B7280' : '#0A0A0F' }]}>Add Expense</ThemedText>
                </LinearGradient>
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
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  expenseIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 40,
  },
  modalTitle: {
    fontSize: 20,
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
});
