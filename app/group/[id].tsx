import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  calculateBalances,
  expenseService,
  groupService,
  settlementService,
  userService
} from '@/services/api';
import type { Expense, Group, GroupMember, User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export default function GroupDetailScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
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
      <View style={[styles.expenseCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.expenseIcon, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
          <IconSymbol size={24} name="dollarsign.circle.fill" color={isDark ? '#2DD4BF' : colors.tint} />
        </View>
        <View style={styles.expenseInfo}>
          <ThemedText type="defaultSemiBold" style={!isDark ? { color: colors.text } : undefined}>{item.description}</ThemedText>
          <ThemedText style={[styles.expenseDate, !isDark && { color: colors.textSecondary }]}>
            {dateStr} • Paid by {item.paidByUser?.name || 'Unknown'}
          </ThemedText>
        </View>
        <ThemedText style={[styles.expenseAmount, !isDark && { color: colors.text }]}>${item.amount.toFixed(2)}</ThemedText>
      </View>
    );
  }

  function renderMember({ item }: { item: GroupMember & { user?: User } }) {
    const balance = balances.get(item.userId) || 0;
    const balanceColor = balance > 0 ? (isDark ? '#10b981' : colors.success) : balance < 0 ? (isDark ? '#ef4444' : colors.error) : (isDark ? '#2DD4BF' : colors.tint);

    return (
      <View style={[styles.memberCard, !isDark && { borderColor: colors.border }]}>
        <View style={[styles.memberAvatar, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
          <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
            {item.user?.name.charAt(0).toUpperCase() || '?'}
          </ThemedText>
        </View>
        <View style={styles.memberInfo}>
          <ThemedText type="defaultSemiBold" style={!isDark ? { color: colors.text } : undefined}>{item.user?.name || 'Unknown'}</ThemedText>
          {item.role === 'admin' && (
            <ThemedText style={[styles.roleLabel, { color: isDark ? '#2DD4BF' : colors.tint }]}>Admin</ThemedText>
          )}
        </View>
        <View style={styles.balanceInfo}>
          {balance !== 0 && (
            <>
              <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                ${Math.abs(balance).toFixed(2)}
              </ThemedText>
              <ThemedText style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
                {balance > 0 ? 'gets back' : 'owes'}
              </ThemedText>
            </>
          )}
          {balance === 0 && (
            <ThemedText style={[styles.settledLabel, !isDark && { color: colors.textSecondary }]}>settled</ThemedText>
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
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}>
          <IconSymbol size={20} name="chevron.left" color={isDark ? '#2DD4BF' : colors.tint} />
        </TouchableOpacity>
        <ThemedText type="title" style={[styles.headerTitle, !isDark && { color: colors.text }]}>{group.name}</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.balanceCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.balanceTitle, !isDark && { color: colors.textSecondary }]}>Your Balance</ThemedText>
          <ThemedText style={[
            styles.totalBalance,
            { color: currentUserBalance > 0 ? (isDark ? '#10b981' : colors.success) : currentUserBalance < 0 ? (isDark ? '#ef4444' : colors.error) : (isDark ? '#2DD4BF' : colors.tint) }
          ]}>
            {currentUserBalance === 0 ? 'Settled up' : `$${Math.abs(currentUserBalance).toFixed(2)}`}
          </ThemedText>
          {currentUserBalance !== 0 && (
            <ThemedText style={[styles.balanceSubtitle, !isDark && { color: colors.textSecondary }]}>
              {currentUserBalance > 0 ? 'You are owed' : 'You owe'}
            </ThemedText>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setExpenseModalVisible(true)}>
            <LinearGradient
              colors={gradients.buttonPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionButtonGradient}>
              <IconSymbol size={20} name="plus.circle.fill" color="#0A0A0F" />
              <ThemedText style={[styles.actionButtonText, { color: '#0A0A0F' }]}>Add Expense</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setSettleModalVisible(true)}>
            <LinearGradient
              colors={['#10b981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionButtonGradient}>
              <IconSymbol size={20} name="checkmark.circle.fill" color="#fff" />
              <ThemedText style={styles.actionButtonText}>Settle Up</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitleText, !isDark && { color: colors.text }]}>Members</ThemedText>
            <TouchableOpacity 
              style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}
              onPress={() => setMemberModalVisible(true)}>
              <IconSymbol size={18} name="plus" color={isDark ? '#2DD4BF' : colors.tint} />
            </TouchableOpacity>
          </View>
          {members.map(member => (
            <View key={member.id}>{renderMember({ item: member })}</View>
          ))}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, styles.sectionTitleText, !isDark && { color: colors.text }]}>Expenses</ThemedText>
          {expenses.length === 0 ? (
            <View style={styles.emptySection}>
              <IconSymbol size={48} name="dollarsign.circle" color={isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)'} />
              <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>No expenses yet</ThemedText>
            </View>
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
        presentationStyle="fullScreen"
        onRequestClose={() => setExpenseModalVisible(false)}>
        <LinearGradient colors={gradients.screenBackground} style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setExpenseModalVisible(false)} style={[styles.closeButtonRect, !isDark && { backgroundColor: 'rgba(0, 0, 0, 0.05)' }]}>
                <IconSymbol size={20} name="xmark" color={isDark ? '#fff' : colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              
              <View style={styles.modalHeaderContent}>
                <View style={[styles.modalIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
                  <IconSymbol size={40} name="dollarsign.circle.fill" color={isDark ? '#2DD4BF' : colors.tint} />
                </View>
                <ThemedText type="title" style={[styles.modalTitleText, !isDark && { color: colors.text }]}>Add Expense</ThemedText>
                <ThemedText style={[styles.modalSubtitle, !isDark && { color: colors.textSecondary }]}>
                  Track what you spent in this group
                </ThemedText>
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Description *</ThemedText>
                <TextInput
                  style={[styles.input, styles.glassInput, !isDark && { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder="e.g. Dinner at Mario's"
                  placeholderTextColor="#6B7280"
                  value={description}
                  onChangeText={setDescription}
                  autoFocus
                  returnKeyType="done"
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Amount *</ThemedText>
                <TextInput
                  style={[styles.input, styles.glassInput, !isDark && { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>

              <ThemedText style={[styles.privacyNote, !isDark && { color: colors.textSecondary }]}>
                The expense will be split equally among all group members.
              </ThemedText>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: isDark ? 'rgba(45, 212, 191, 0.15)' : colors.border }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={addExpense}
                disabled={!description.trim() || !amount.trim()}>
                <LinearGradient
                  colors={(!description.trim() || !amount.trim()) ? (isDark ? ['#1A1A24', '#12121A'] : ['#E5E5E5', '#D4D4D4']) : gradients.buttonPrimary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.submitButton,
                    (!description.trim() || !amount.trim()) && styles.disabledButton
                  ]}>
                  <IconSymbol size={20} name="plus.circle.fill" color={(!description.trim() || !amount.trim()) ? '#6B7280' : '#0A0A0F'} />
                  <ThemedText style={[styles.submitButtonText, { color: (!description.trim() || !amount.trim()) ? '#6B7280' : '#0A0A0F' }]}>Add Expense</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={memberModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setMemberModalVisible(false)}>
        <LinearGradient colors={gradients.screenBackground} style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setMemberModalVisible(false)} style={[styles.closeButtonRect, !isDark && { backgroundColor: 'rgba(0, 0, 0, 0.05)' }]}>
                <IconSymbol size={20} name="xmark" color={isDark ? '#fff' : colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              
              <View style={styles.modalHeaderContent}>
                <View style={[styles.modalIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
                  <IconSymbol size={40} name="person.badge.plus" color={isDark ? '#2DD4BF' : colors.tint} />
                </View>
                <ThemedText type="title" style={[styles.modalTitleText, !isDark && { color: colors.text }]}>Add Member</ThemedText>
                <ThemedText style={[styles.modalSubtitle, !isDark && { color: colors.textSecondary }]}>
                  Add a friend to this group
                </ThemedText>
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Select Friend *</ThemedText>
                <View style={styles.userList}>
                  {availableUsers.length === 0 ? (
                    <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>No available users. Add friends first.</ThemedText>
                  ) : (
                    availableUsers.map(user => (
                      <TouchableOpacity
                        key={user.id}
                        style={[
                          styles.userOption,
                          selectedUserId === user.id && styles.userOptionSelected,
                          selectedUserId !== user.id && (isDark ? styles.userOptionUnselected : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }),
                        ]}
                        onPress={() => setSelectedUserId(user.id)}>
                        <ThemedText style={[
                          styles.userOptionText,
                          selectedUserId === user.id && { color: '#0A0A0F' },
                          selectedUserId !== user.id && { color: isDark ? '#f4f4f5' : colors.text }
                        ]}>
                          {user.name}
                        </ThemedText>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>

              <ThemedText style={[styles.privacyNote, !isDark && { color: colors.textSecondary }]}>
                They will be able to see and add expenses to this group.
              </ThemedText>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: isDark ? 'rgba(45, 212, 191, 0.15)' : colors.border }]}>
              {availableUsers.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={addMember}
                  disabled={!selectedUserId}>
                  <LinearGradient
                    colors={!selectedUserId ? (isDark ? ['#1A1A24', '#12121A'] : ['#E5E5E5', '#D4D4D4']) : gradients.buttonPrimary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.submitButton,
                      !selectedUserId && styles.disabledButton
                    ]}>
                    <IconSymbol size={20} name="person.badge.plus" color={!selectedUserId ? '#6B7280' : '#0A0A0F'} />
                    <ThemedText style={[styles.submitButtonText, { color: !selectedUserId ? '#6B7280' : '#0A0A0F' }]}>Add Member</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={settleModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSettleModalVisible(false)}>
        <LinearGradient colors={gradients.screenBackground} style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSettleModalVisible(false)} style={[styles.closeButtonRect, !isDark && { backgroundColor: 'rgba(0, 0, 0, 0.05)' }]}>
                <IconSymbol size={20} name="xmark" color={isDark ? '#fff' : colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              
              <View style={styles.modalHeaderContent}>
                <View style={[styles.modalIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <IconSymbol size={40} name="checkmark.circle.fill" color="#10b981" />
                </View>
                <ThemedText type="title" style={[styles.modalTitleText, !isDark && { color: colors.text }]}>Settle Up</ThemedText>
                <ThemedText style={[styles.modalSubtitle, !isDark && { color: colors.textSecondary }]}>
                  Record a payment to settle your balance
                </ThemedText>
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Settle with *</ThemedText>
                <View style={styles.userList}>
                  {members.filter(m => m.userId !== 'current-user').map(member => (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.userOption,
                        settleWithUserId === member.userId && styles.userOptionSelected,
                        settleWithUserId !== member.userId && (isDark ? styles.userOptionUnselected : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }),
                      ]}
                      onPress={() => setSettleWithUserId(member.userId)}>
                      <ThemedText style={[
                        styles.userOptionText,
                        settleWithUserId === member.userId && { color: '#0A0A0F' },
                        settleWithUserId !== member.userId && { color: isDark ? '#f4f4f5' : colors.text }
                      ]}>
                        {member.user?.name || 'Unknown'}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Amount *</ThemedText>
                <TextInput
                  style={[styles.input, styles.glassInput, !isDark && { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  value={settleAmount}
                  onChangeText={setSettleAmount}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>

              <ThemedText style={[styles.privacyNote, !isDark && { color: colors.textSecondary }]}>
                This will record a payment and update your balances.
              </ThemedText>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: isDark ? 'rgba(45, 212, 191, 0.15)' : colors.border }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={settleUp}
                disabled={!settleWithUserId || !settleAmount.trim()}>
                <LinearGradient
                  colors={(!settleWithUserId || !settleAmount.trim()) ? (isDark ? ['#1A1A24', '#12121A'] : ['#E5E5E5', '#D4D4D4']) : ['#10b981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.submitButton,
                    (!settleWithUserId || !settleAmount.trim()) && styles.disabledButton
                  ]}>
                  <IconSymbol size={20} name="checkmark.circle.fill" color={(!settleWithUserId || !settleAmount.trim()) ? '#6B7280' : '#fff'} />
                  <ThemedText style={[styles.submitButtonText, { color: (!settleWithUserId || !settleAmount.trim()) ? '#6B7280' : '#fff' }]}>Record Payment</ThemedText>
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
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  balanceTitle: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.6,
    marginBottom: 8,
  },
  totalBalance: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#fff',
    lineHeight: 36,
  },
  balanceSubtitle: {
    fontSize: 12,
    color: '#fff',
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
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2DD4BF',
    textAlign: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 10,
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
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  expenseIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  expenseInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  expenseDate: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 14,
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
  userList: {
    marginBottom: 16,
  },
  userOption: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  userOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  settleLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    opacity: 0.7,
  },
  glassInput: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    color: '#f4f4f5',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  userOptionSelected: {
    backgroundColor: '#2DD4BF',
    borderColor: '#2DD4BF',
  },
  userOptionUnselected: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  modalKeyboard: {
    flex: 1,
  },
  closeButtonRect: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeaderContent: {
    alignItems: 'center',
    marginBottom: 32,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitleText: {
    color: '#fff',
    marginBottom: 8,
    lineHeight: 32,
  },
  modalSubtitle: {
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
  backButtonRect: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  sectionTitleText: {
    color: '#fff',
  },
  addButtonRect: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
});
