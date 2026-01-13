import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Gradients } from '@/constants/theme';
import { expenseService, groupService, initDatabase, userService } from '@/services/api';
import type { Expense, Group } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export default function ExpensesScreen() {
  const { openModal } = useLocalSearchParams<{ openModal?: string }>();
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

  // Calculate total spent
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  function renderExpense({ item }: { item: Expense & { group?: Group } }) {
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
      <View style={styles.expenseCard}>
        <View style={styles.expenseIcon}>
          <IconSymbol size={20} name="dollarsign.circle.fill" color="#2DD4BF" />
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
    <LinearGradient
      colors={Gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerLabel}>Total spent</ThemedText>
          <ThemedText type="header" style={styles.headerAmount}>${totalSpent.toFixed(2)}</ThemedText>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}>
          <View style={styles.addButtonRect}>
            <IconSymbol size={20} name="plus" color="#2DD4BF" />
          </View>
        </TouchableOpacity>
      </View>

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
        presentationStyle="fullScreen"
        onRequestClose={() => setModalVisible(false)}>
        <LinearGradient colors={Gradients.screenBackground} style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButtonRect}>
                <IconSymbol size={20} name="xmark" color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              
              <View style={styles.expenseHeader}>
                <View style={styles.expenseIconContainer}>
                  <IconSymbol size={40} name="dollarsign.circle.fill" color="#2DD4BF" />
                </View>
                <ThemedText type="title" style={styles.expenseTitle}>Add Expense</ThemedText>
                <ThemedText style={styles.expenseSubtitle}>
                  Track what you spent and split with your group
                </ThemedText>
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Description *</ThemedText>
                <TextInput
                  style={[styles.input, styles.glassInput]}
                  placeholder="e.g. Dinner at Mario's"
                  placeholderTextColor="#6B7280"
                  value={description}
                  onChangeText={setDescription}
                  autoFocus
                  returnKeyType="done"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Amount *</ThemedText>
                <TextInput
                  style={[styles.input, styles.glassInput]}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Select Group *</ThemedText>
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

              <ThemedText style={styles.privacyNote}>
                The expense will be split equally among all group members.
              </ThemedText>
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
                  <IconSymbol size={20} name="plus.circle.fill" color={(!description.trim() || !amount.trim() || !selectedGroupId) ? '#6B7280' : '#0A0A0F'} />
                  <ThemedText style={[styles.submitButtonText, { color: (!description.trim() || !amount.trim() || !selectedGroupId) ? '#6B7280' : '#0A0A0F' }]}>
                    Add Expense
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>
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
    paddingTop: 60,
  },
  headerLabel: {
    fontSize: 14,
    opacity: 0.6,
    color: '#fff',
  },
  headerAmount: {
    color: '#fff',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
