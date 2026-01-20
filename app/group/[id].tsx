import {
  AddExpenseModal,
  AddMemberModal,
} from '@/components/group';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { activityService } from '@/services/activity-service';
import {
  calculateBalances,
  expenseService,
  groupService,
  userService
} from '@/services/api';
import type { Expense, Group, GroupMember, User } from '@/types/database';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';

export default function GroupDetailScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<(Expense & { paidByUser?: User })[]>([]);
  const [members, setMembers] = useState<(GroupMember & { user?: User })[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const expenseSwipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const memberSwipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const { user } = useAuth();
  const currentUserId = user?.id || '';

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

      const userFriends = await userService.getUserFriends(currentUserId);
      const memberIds = new Set(groupMembers.map(m => m.userId));
      const available = userFriends.filter(u => !memberIds.has(u.id));
      setAvailableUsers(available);
    } catch (error) {
      console.error('Error loading group data:', error);
    } finally {
      setLoading(false);
    }
  }, [id, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        loadGroupData();
      }
    }, [id, loadGroupData])
  );

  const addExpense = async () => {
    if (isAddingExpense) return;
    
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
      setIsAddingExpense(true);
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

      if (group && user) {
        await activityService.logExpenseCreated({
          expenseId: '',
          userId: currentUserId,
          userName: user.name,
          description: description.trim(),
          amount: amountNum,
          groupId: id,
          groupName: group.name,
        });
      }

      setDescription('');
      setAmount('');
      setExpenseModalVisible(false);
      loadGroupData();
    } catch (error) {
      console.error('Error adding expense:', error);
      Alert.alert('Error', 'Failed to add expense');
    } finally {
      setIsAddingExpense(false);
    }
  };

  const addMember = async () => {
    if (isAddingMember) return;
    
    if (!selectedUserId) {
      Alert.alert('Error', 'Please select a friend');
      return;
    }

    try {
      setIsAddingMember(true);
      await groupService.addMember(id, selectedUserId);
      
      if (group && user) {
        const newMember = availableUsers.find(u => u.id === selectedUserId);
        await activityService.logMemberAdded({
          groupId: id,
          userId: currentUserId,
          userName: user.name,
          memberName: newMember?.name || 'Someone',
          groupName: group.name,
        });
      }
      
      setSelectedUserId('');
      setMemberModalVisible(false);
      loadGroupData();
    } catch (error) {
      console.error('Error adding member:', error);
      Alert.alert('Error', 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  }

  async function handleDeleteGroup() {
    if (isDeletingGroup) return;
    
    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingGroup(true);
              await groupService.delete(id);
              router.back();
            } catch (error) {
              console.error('Error deleting group:', error);
              Alert.alert('Error', 'Failed to delete group');
              setIsDeletingGroup(false);
            }
          },
        },
      ]
    );
  }

  function handleSettleUp() {
    router.push(`/group/settle/${id}`);
  }

  function handleEditExpense(expenseId: string) {
    expenseSwipeableRefs.current.get(expenseId)?.close();
    router.push(`/edit-expense/${expenseId}` as any);
  }

  async function handleDeleteExpense(expenseId: string) {
    if (deletingExpenseId) return;
    
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingExpenseId(expenseId);
              await expenseService.delete(expenseId, currentUserId, user?.name || 'Unknown');
              loadGroupData();
            } catch (error) {
              console.error('Error deleting expense:', error);
              Alert.alert('Error', 'Failed to delete expense');
            } finally {
              setDeletingExpenseId(null);
            }
          },
        },
      ]
    );
  }

  function renderLeftActions(progress: any, dragX: any, expenseId: string) {
    const trans = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.swipeActionLeft, { opacity: trans }]}>
        <TouchableOpacity
          onPress={() => handleEditExpense(expenseId)}
          style={styles.swipeActionButton}>
          <IconSymbol name="pencil" size={20} color="#fff" />
          <ThemedText style={styles.swipeActionText}>Edit</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderRightActions(progress: any, dragX: any, expenseId: string) {
    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.swipeActionRight, { opacity: trans }]}>
        <TouchableOpacity
          onPress={() => handleDeleteExpense(expenseId)}
          style={styles.swipeActionButton}>
          <IconSymbol name="trash" size={20} color="#fff" />
          <ThemedText style={styles.swipeActionText}>Delete</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderExpense({ item }: { item: Expense & { paidByUser?: User } }) {
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            expenseSwipeableRefs.current.set(item.id, ref);
          } else {
            expenseSwipeableRefs.current.delete(item.id);
          }
        }}
        renderLeftActions={(progress, dragX) => renderLeftActions(progress, dragX, item.id)}
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item.id)}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        overshootFriction={8}
        enableTrackpadTwoFingerGesture
        containerStyle={{ overflow: 'visible' }}>
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
      </Swipeable>
    );
  }

  function handleRemoveMember(member: GroupMember & { user?: User }) {
    if (removingMemberId) return;
    
    // Don't allow removing yourself or if you're not an admin
    const currentMember = members.find(m => m.userId === currentUserId);
    if (member.userId === currentUserId) {
      Alert.alert('Cannot Remove', 'You cannot remove yourself from the group.');
      return;
    }
    if (currentMember?.role !== 'admin') {
      Alert.alert('Permission Denied', 'Only admins can remove members.');
      return;
    }

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.user?.name || 'this member'} from the group?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingMemberId(member.userId);
              await groupService.removeMember(id, member.userId);
              
              // Log activity
              if (group && user) {
                await activityService.logMemberRemoved({
                  groupId: id,
                  userId: currentUserId,
                  userName: user.name,
                  memberName: member.user?.name || 'Someone',
                  groupName: group.name,
                });
              }
              
              loadGroupData();
            } catch (error) {
              console.error('Error removing member:', error);
              Alert.alert('Error', 'Failed to remove member');
            } finally {
              setRemovingMemberId(null);
            }
          },
        },
      ]
    );
  }

  function renderMemberRightActions(progress: any, dragX: any, member: GroupMember & { user?: User }) {
    const currentMember = members.find(m => m.userId === currentUserId);
    const canRemove = currentMember?.role === 'admin' && member.userId !== currentUserId;
    
    if (!canRemove) return null;

    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.swipeActionRight, { opacity: trans }]}>
        <TouchableOpacity
          onPress={() => handleRemoveMember(member)}
          style={styles.swipeActionButton}>
          <IconSymbol name="trash" size={20} color="#fff" />
          <ThemedText style={styles.swipeActionText}>Remove</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderMember({ item }: { item: GroupMember & { user?: User } }) {
    const balance = balances.get(item.userId) || 0;
    const balanceColor = balance > 0 ? (isDark ? '#10b981' : colors.success) : balance < 0 ? (isDark ? '#ef4444' : colors.error) : (isDark ? '#2DD4BF' : colors.tint);
    const currentMember = members.find(m => m.userId === currentUserId);
    const canRemove = currentMember?.role === 'admin' && item.userId !== currentUserId;

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            memberSwipeableRefs.current.set(item.userId, ref);
          } else {
            memberSwipeableRefs.current.delete(item.userId);
          }
        }}
        renderRightActions={canRemove ? (progress, dragX) => renderMemberRightActions(progress, dragX, item) : undefined}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        overshootFriction={8}
        enableTrackpadTwoFingerGesture
        containerStyle={{ overflow: 'visible' }}>
        <View style={[styles.memberCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
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
              <ThemedText style={[styles.memberBalanceAmount, { color: balanceColor }]}>
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
      </Swipeable>
    );
  }

  // Start animations when data loads
  useEffect(() => {
    if (!loading && group) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading, group]);

  if (loading) {
    return <LoadingState message="Loading group details..." />;
  }

  if (!group) {
    return null;
  }

  const currentUserBalance = balances.get(currentUserId) || 0;
  const balanceColor = currentUserBalance > 0 ? '#10b981' : currentUserBalance < 0 ? '#ef4444' : '#2DD4BF';
  const balanceGradient = currentUserBalance > 0 
    ? ['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.05)']
    : currentUserBalance < 0 
    ? ['rgba(239, 68, 68, 0.2)', 'rgba(239, 68, 68, 0.05)']
    : ['rgba(45, 212, 191, 0.2)', 'rgba(45, 212, 191, 0.05)'];

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
      
      {/* Animated background orbs */}
      <View style={styles.orbContainer}>
        <View style={[styles.orb, styles.orb1]} />
        <View style={[styles.orb, styles.orb2]} />
        <View style={[styles.orb, styles.orb3]} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={[styles.backButtonRect, { 
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', 
            borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' 
          }]}>
          <IconSymbol size={20} name="chevron.left" color={isDark ? '#2DD4BF' : colors.tint} />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        
        {/* Group Hero */}
        <Animated.View style={[
          styles.heroSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          }
        ]}>
          <View style={styles.groupIconWrapper}>
            <LinearGradient
              colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
              style={styles.groupIconGlow}
            />
            <View style={[styles.groupIcon, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]}>
              <LinearGradient
                colors={isDark ? ['rgba(45, 212, 191, 0.3)', 'rgba(45, 212, 191, 0.1)'] : ['rgba(34, 197, 94, 0.3)', 'rgba(34, 197, 94, 0.1)']}
                style={styles.groupIconInner}>
                <IconSymbol size={32} name="person.3.fill" color={isDark ? '#2DD4BF' : colors.tint} />
              </LinearGradient>
            </View>
          </View>
          <ThemedText type="title" style={[styles.groupName, !isDark && { color: colors.text }]}>
            {group.name}
          </ThemedText>
          <ThemedText style={[styles.memberCount, !isDark && { color: colors.textSecondary }]}>
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </ThemedText>
        </Animated.View>

        {/* Balance Card with glassmorphism */}
        <Animated.View style={[
          styles.balanceCardWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }
        ]}>
          <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.balanceCard}>
            <LinearGradient
              colors={balanceGradient as [string, string]}
              style={styles.balanceGradientOverlay}
            />
            <View style={styles.balanceContent}>
              {currentUserBalance !== 0 ? (
                <>
                  <View style={styles.balanceHeader}>
                    <View style={[styles.balanceIndicator, { backgroundColor: balanceColor }]} />
                    <ThemedText style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
                      {currentUserBalance > 0 ? 'You are owed' : 'You owe'}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                    ${Math.abs(currentUserBalance).toFixed(2)}
                  </ThemedText>
                </>
              ) : (
                <View style={styles.settledContainer}>
                  <View style={styles.settledIconWrapper}>
                    <LinearGradient
                      colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
                      style={styles.settledIcon}>
                      <IconSymbol size={28} name="checkmark" color="#fff" />
                    </LinearGradient>
                  </View>
                  <ThemedText style={[styles.settledText, !isDark && { color: colors.text }]}>
                    All settled up!
                  </ThemedText>
                </View>
              )}
            </View>
          </BlurView>
        </Animated.View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push(`/add-expense?groupId=${id}`)}>
            <LinearGradient
              colors={gradients.buttonPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickActionGradient}>
              <IconSymbol size={20} name="plus.circle.fill" color="#0A0A0F" />
              <ThemedText style={[styles.quickActionText, { color: '#0A0A0F' }]}>Add Expense</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleSettleUp}>
            <LinearGradient
              colors={['#10b981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickActionGradient}>
              <IconSymbol size={20} name="checkmark.circle.fill" color="#fff" />
              <ThemedText style={styles.quickActionText}>Settle Up</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
              Members
            </ThemedText>
            <TouchableOpacity 
              style={[styles.addButton, { 
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', 
                borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' 
              }]}
              onPress={() => setMemberModalVisible(true)}>
              <IconSymbol size={16} name="plus" color={isDark ? '#2DD4BF' : colors.tint} />
            </TouchableOpacity>
          </View>
          {members.map((member, index) => (
            <Animated.View 
              key={member.id}
              style={{
                opacity: fadeAnim,
                transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value((index + 1) * 0.15)) }],
              }}>
              {renderMember({ item: member })}
            </Animated.View>
          ))}
        </View>

        {/* Expenses Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
              Expenses
            </ThemedText>
            <ThemedText style={[styles.expenseCount, !isDark && { color: colors.textSecondary }]}>
              {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
            </ThemedText>
          </View>
          {expenses.length === 0 ? (
            <View style={styles.emptySection}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
                <IconSymbol size={32} name="dollarsign.circle" color={isDark ? '#2DD4BF' : colors.tint} />
              </View>
              <ThemedText style={[styles.emptyTitle, !isDark && { color: colors.text }]}>No expenses yet</ThemedText>
              <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
                Add an expense to start splitting costs
              </ThemedText>
            </View>
          ) : (
            expenses.map((expense, index) => (
              <Animated.View 
                key={expense.id}
                style={{
                  opacity: fadeAnim,
                  transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value((index + 1) * 0.1)) }],
                }}>
                {renderExpense({ item: expense })}
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>

      <AddExpenseModal
        visible={expenseModalVisible}
        onClose={() => setExpenseModalVisible(false)}
        description={description}
        setDescription={setDescription}
        amount={amount}
        setAmount={setAmount}
        onSubmit={addExpense}
      />

      <AddMemberModal
        visible={memberModalVisible}
        onClose={() => setMemberModalVisible(false)}
        availableUsers={availableUsers}
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
        onSubmit={addMember}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    top: -100,
    right: -100,
  },
  orb2: {
    width: 200,
    height: 200,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    bottom: 200,
    left: -50,
  },
  orb3: {
    width: 150,
    height: 150,
    backgroundColor: 'rgba(45, 212, 191, 0.08)',
    bottom: 50,
    right: -30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingBottom: 8,
  },
  backButtonRect: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSpinner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  groupIconWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  groupIconGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 20,
    opacity: 0.3,
    top: -4,
    left: -4,
  },
  groupIcon: {
    width: 80,
    height: 80,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  groupIconInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 4,
  },
  memberCount: {
    fontSize: 14,
    opacity: 0.6,
  },
  balanceCardWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  balanceCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  balanceGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  balanceContent: {
    padding: 24,
    alignItems: 'center',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  balanceLabel: {
    fontSize: 14,
    opacity: 0.8,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 48,
  },
  memberBalanceAmount: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  settledContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  settledIconWrapper: {
    marginBottom: 12,
  },
  settledIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settledText: {
    fontSize: 18,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  quickActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  quickActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseCount: {
    fontSize: 13,
    opacity: 0.6,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 35, 38, 0.4)',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 2,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  settledLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDate: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
  },
  swipeActionLeft: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: 80,
    borderRadius: 14,
    marginBottom: 10,
  },
  swipeActionRight: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 80,
    borderRadius: 14,
    marginBottom: 10,
  },
  swipeActionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    gap: 4,
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
