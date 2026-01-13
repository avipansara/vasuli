import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  calculateBalances,
  expenseService,
  groupService,
  settlementService,
  userService
} from '@/services/database';
import type { Expense, Group, GroupMember, User } from '@/types/database';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<(Expense & { paidByUser?: User })[]>([]);
  const [members, setMembers] = useState<(GroupMember & { user?: User })[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [settleWithUserId, setSettleWithUserId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');

  const loadGroupData = useCallback(async () => {
    try {
      const groupData = await groupService.getById(id);
      if (!groupData) {
        Alert.alert('Error', 'Group not found');
        router.back();
        return;
      }
      setGroup(groupData);

      const groupExpenses = await expenseService.getByGroup(id);
      const expensesWithUsers = await Promise.all(
        groupExpenses.map(async (expense) => {
          const user = await userService.getById(expense.paidBy);
          return { ...expense, paidByUser: user || undefined };
        })
      );
      setExpenses(expensesWithUsers);

      const groupMembers = await groupService.getMembers(id);
      const membersWithUsers = await Promise.all(
        groupMembers.map(async (member) => {
          const user = await userService.getById(member.userId);
          return { ...member, user: user || undefined };
        })
      );
      setMembers(membersWithUsers);

      const groupBalances = await calculateBalances(id);
      setBalances(groupBalances);

      const allUsers = await userService.getAll();
      const memberIds = new Set(groupMembers.map(m => m.userId));
      const available = allUsers.filter(u => !memberIds.has(u.id));
      setAvailableUsers(available);
    } catch (error) {
      console.error('Error loading group data:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadGroupData();
    }
  }, [id, loadGroupData]);

  async function addExpense() {
    if (!description.trim() || !amount.trim()) {
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
      const splitAmount = amountNum / members.length;

      await expenseService.create(
        {
          groupId: id,
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
      setExpenseModalVisible(false);
      loadGroupData();
    } catch (error) {
      console.error('Error adding expense:', error);
      Alert.alert('Error', 'Failed to add expense');
    }
  }

  async function addMember() {
    if (!selectedUserId) {
      Alert.alert('Error', 'Please select a user');
      return;
    }

    try {
      await groupService.addMember(id, selectedUserId, 'member');
      setSelectedUserId('');
      setMemberModalVisible(false);
      loadGroupData();
    } catch (error) {
      console.error('Error adding member:', error);
      Alert.alert('Error', 'Failed to add member');
    }
  }

  async function settleUp() {
    if (!settleWithUserId || !settleAmount.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amountNum = parseFloat(settleAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      const currentUserId = 'current-user';
      await settlementService.create({
        groupId: id,
        fromUserId: currentUserId,
        toUserId: settleWithUserId,
        amount: amountNum,
        currency: 'USD',
        date: Date.now(),
      });

      setSettleWithUserId('');
      setSettleAmount('');
      setSettleModalVisible(false);
      loadGroupData();
    } catch (error) {
      console.error('Error settling up:', error);
      Alert.alert('Error', 'Failed to record settlement');
    }
  }

  function renderExpense({ item }: { item: Expense & { paidByUser?: User } }) {
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
      <View style={[styles.expenseCard, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <View style={[styles.expenseIcon, { backgroundColor: colorScheme === 'dark' ? '#27272a' : '#f4f4f5' }]}>
          <IconSymbol size={24} name="dollarsign.circle.fill" color={Colors[colorScheme ?? 'light'].text} />
        </View>
        <View style={styles.expenseInfo}>
          <ThemedText type="defaultSemiBold">{item.description}</ThemedText>
          <ThemedText style={styles.expenseDate}>
            {dateStr} • Paid by {item.paidByUser?.name || 'Unknown'}
          </ThemedText>
        </View>
        <ThemedText style={styles.expenseAmount}>${item.amount.toFixed(2)}</ThemedText>
      </View>
    );
  }

  function renderMember({ item }: { item: GroupMember & { user?: User } }) {
    const balance = balances.get(item.userId) || 0;
    const balanceColor = balance > 0 ? '#10b981' : balance < 0 ? '#ef4444' : Colors[colorScheme ?? 'light'].text;

    return (
      <View style={styles.memberCard}>
        <View style={[styles.memberAvatar, { backgroundColor: colorScheme === 'dark' ? '#27272a' : '#f4f4f5' }]}>
          <ThemedText style={[styles.avatarText, { color: Colors[colorScheme ?? 'light'].text }]}>
            {item.user?.name.charAt(0).toUpperCase() || '?'}
          </ThemedText>
        </View>
        <View style={styles.memberInfo}>
          <ThemedText type="defaultSemiBold">{item.user?.name || 'Unknown'}</ThemedText>
          {item.role === 'admin' && (
            <ThemedText style={styles.roleLabel}>Admin</ThemedText>
          )}
        </View>
        <View style={styles.balanceInfo}>
          {balance !== 0 && (
            <>
              <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                ${Math.abs(balance).toFixed(2)}
              </ThemedText>
              <ThemedText style={styles.balanceLabel}>
                {balance > 0 ? 'gets back' : 'owes'}
              </ThemedText>
            </>
          )}
          {balance === 0 && (
            <ThemedText style={styles.settledLabel}>settled</ThemedText>
          )}
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!group) {
    return null;
  }

  const currentUserBalance = balances.get('current-user') || 0;

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol size={24} name="chevron.left" color={Colors[colorScheme ?? 'light'].text} />
        </TouchableOpacity>
        <ThemedText type="title">{group.name}</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content}>
        <View style={[styles.balanceCard, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
          <ThemedText style={styles.balanceTitle}>Your Balance</ThemedText>
          <ThemedText style={[
            styles.totalBalance,
            { color: currentUserBalance > 0 ? '#10b981' : currentUserBalance < 0 ? '#ef4444' : Colors[colorScheme ?? 'light'].text }
          ]}>
            {currentUserBalance === 0 ? 'Settled up' : `$${Math.abs(currentUserBalance).toFixed(2)}`}
          </ThemedText>
          {currentUserBalance !== 0 && (
            <ThemedText style={styles.balanceSubtitle}>
              {currentUserBalance > 0 ? 'You are owed' : 'You owe'}
            </ThemedText>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: Colors[colorScheme ?? 'light'].text }]}
            onPress={() => setExpenseModalVisible(true)}>
            <IconSymbol size={20} name="plus.circle.fill" color={Colors[colorScheme ?? 'light'].background} />
            <ThemedText style={[styles.actionButtonText, { color: Colors[colorScheme ?? 'light'].background }]}>Add Expense</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#10b981' }]}
            onPress={() => setSettleModalVisible(true)}>
            <IconSymbol size={20} name="checkmark.circle.fill" color="#fff" />
            <ThemedText style={styles.actionButtonText}>Settle Up</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Members</ThemedText>
            <TouchableOpacity onPress={() => setMemberModalVisible(true)}>
              <IconSymbol size={20} name="plus.circle" color={Colors[colorScheme ?? 'light'].tint} />
            </TouchableOpacity>
          </View>
          {members.map(member => (
            <View key={member.id}>{renderMember({ item: member })}</View>
          ))}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Expenses</ThemedText>
          {expenses.length === 0 ? (
            <ThemedText style={styles.emptyText}>No expenses yet</ThemedText>
          ) : (
            expenses.map(expense => (
              <View key={expense.id}>{renderExpense({ item: expense })}</View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={expenseModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setExpenseModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle" style={styles.modalTitle}>Add Expense</ThemedText>
              <TouchableOpacity onPress={() => setExpenseModalVisible(false)} style={styles.closeButton}>
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
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={addExpense}
                disabled={!description.trim() || !amount.trim()}>
                <View
                  style={[
                    styles.submitButton,
                    { backgroundColor: (!description.trim() || !amount.trim()) ? (colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8') : Colors[colorScheme ?? 'light'].text },
                    (!description.trim() || !amount.trim()) && styles.disabledButton
                  ]}>
                  <ThemedText style={[styles.submitButtonText, { color: Colors[colorScheme ?? 'light'].background }]}>Add Expense</ThemedText>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={memberModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMemberModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle" style={styles.modalTitle}>Add Member</ThemedText>
              <TouchableOpacity onPress={() => setMemberModalVisible(false)} style={styles.closeButton}>
                <IconSymbol size={28} name="xmark.circle.fill" color={Colors[colorScheme ?? 'light'].icon} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Select Friend</ThemedText>
                <View style={styles.userList}>
                  {availableUsers.length === 0 ? (
                    <ThemedText style={styles.emptyText}>No available users. Add friends first.</ThemedText>
                  ) : (
                    availableUsers.map(user => (
                      <TouchableOpacity
                        key={user.id}
                        style={[
                          styles.userOption,
                          selectedUserId === user.id && {
                            backgroundColor: Colors[colorScheme ?? 'light'].tint,
                            borderColor: Colors[colorScheme ?? 'light'].tint,
                          },
                          selectedUserId !== user.id && {
                            backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f3f4f6',
                            borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                          }
                        ]}
                        onPress={() => setSelectedUserId(user.id)}>
                        <ThemedText style={[
                          styles.userOptionText,
                          selectedUserId === user.id && { color: '#fff' },
                          selectedUserId !== user.id && { color: Colors[colorScheme ?? 'light'].text }
                        ]}>
                          {user.name}
                        </ThemedText>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb' }]}>
              {availableUsers.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={addMember}
                  disabled={!selectedUserId}>
                  <View
                    style={[
                      styles.submitButton,
                      { backgroundColor: !selectedUserId ? (colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8') : Colors[colorScheme ?? 'light'].text },
                      !selectedUserId && styles.disabledButton
                    ]}>
                    <ThemedText style={[styles.submitButtonText, { color: Colors[colorScheme ?? 'light'].background }]}>Add Member</ThemedText>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={settleModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSettleModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle" style={styles.modalTitle}>Settle Up</ThemedText>
              <TouchableOpacity onPress={() => setSettleModalVisible(false)} style={styles.closeButton}>
                <IconSymbol size={28} name="xmark.circle.fill" color={Colors[colorScheme ?? 'light'].icon} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Settle with</ThemedText>
                <View style={styles.userList}>
                  {members.filter(m => m.userId !== 'current-user').map(member => (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.userOption,
                        settleWithUserId === member.userId && {
                          backgroundColor: Colors[colorScheme ?? 'light'].tint,
                          borderColor: Colors[colorScheme ?? 'light'].tint,
                        },
                        settleWithUserId !== member.userId && {
                          backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f3f4f6',
                          borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                        }
                      ]}
                      onPress={() => setSettleWithUserId(member.userId)}>
                      <ThemedText style={[
                        styles.userOptionText,
                        settleWithUserId === member.userId && { color: '#fff' },
                        settleWithUserId !== member.userId && { color: Colors[colorScheme ?? 'light'].text }
                      ]}>
                        {member.user?.name || 'Unknown'}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
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
                  value={settleAmount}
                  onChangeText={setSettleAmount}
                  keyboardType="decimal-pad"
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={settleUp}
                disabled={!settleWithUserId || !settleAmount.trim()}>
                <View
                  style={[
                    styles.submitButton,
                    { backgroundColor: (!settleWithUserId || !settleAmount.trim()) ? (colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8') : '#10b981' },
                    (!settleWithUserId || !settleAmount.trim()) && styles.disabledButton
                  ]}>
                  <ThemedText style={styles.submitButtonText}>Record Payment</ThemedText>
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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  balanceCard: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceTitle: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 8,
  },
  totalBalance: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  balanceSubtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#18181b',
  },
  memberInfo: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  balanceLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  settledLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  expenseCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  expenseIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  expenseDate: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
    paddingVertical: 16,
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
  userList: {
    marginBottom: 16,
  },
  userOption: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  userOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  settleLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    opacity: 0.7,
  },
});
