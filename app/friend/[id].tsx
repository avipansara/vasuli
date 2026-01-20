import { SettleUpModal } from '@/components/friends/settle-up-modal';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { activityService } from '@/services/activity-service';
import { calculateFriendBalance, expenseService, initDatabase, settlementService, userService } from '@/services/api';
import { friendshipService } from '@/services/friendship-service';
import type { Expense, ExpenseSplit, User } from '@/types/database';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';

interface UserWithBalance extends User {
  balance: number;
}

interface ExpenseWithSplit extends Expense {
  yourShare: number;
  friendShare: number;
  paidByName: string;
}

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gradients, colors, isDark } = useThemeColors();
  const [friend, setFriend] = useState<UserWithBalance | null>(null);
  const [expenses, setExpenses] = useState<ExpenseWithSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [isRemovingFriend, setIsRemovingFriend] = useState(false);
  const [isSettlingUp, setIsSettlingUp] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!loading && friend) {
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

      // Pulse animation for balance
      if (friend.balance !== 0) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.05,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    }
  }, [loading, friend]);

  useFocusEffect(
    useCallback(() => {
      loadFriendData();
    }, [id])
  );

  const loadFriendData = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      await initDatabase();
      
      // Get friend info
      const friendData = await userService.getById(id);
      
      if (!friendData) {
        Alert.alert('Error', 'Friend not found');
        router.back();
        return;
      }

      // Calculate balance (includes all shared expenses - friend-only and group)
      const balance = await calculateFriendBalance(currentUserId, id);
      setFriend({ ...friendData, balance });

      // Get expenses involving the current user and filter for ones involving both users
      const allExpenses = await expenseService.getUserExpenses(currentUserId);
      const allSplits = await Promise.all(
        allExpenses.map(async (expense: Expense) => {
          const splits = await expenseService.getSplits(expense.id);
          return { expense, splits };
        })
      );

      // Filter expenses where both current user and friend are involved
      const sharedExpenses: ExpenseWithSplit[] = [];
      for (const { expense, splits } of allSplits) {
        const currentUserSplit = splits.find((s: ExpenseSplit) => s.userId === currentUserId);
        const friendSplit = splits.find((s: ExpenseSplit) => s.userId === id);
        
        if (currentUserSplit && friendSplit) {
          sharedExpenses.push({
            ...expense,
            yourShare: currentUserSplit.amount,
            friendShare: friendSplit.amount,
            paidByName: expense.paidBy === currentUserId ? 'You' : friendData.name,
          });
        }
      }

      // Sort by date descending
      sharedExpenses.sort((a, b) => b.date - a.date);
      setExpenses(sharedExpenses);
    } catch (error) {
      console.error('Error loading friend data:', error);
      Alert.alert('Error', 'Failed to load friend data');
    } finally {
      setLoading(false);
    }
  }

  const handleSettleUp = async (friendId: string, amount: number) => {
    try {
      if (!friend || !user) return;

      let settlement;
      if (friend.balance > 0) {
        // Friend owes current user
        settlement = await settlementService.create({
          fromUserId: friendId,
          toUserId: currentUserId,
          amount,
          currency: 'USD',
          date: Date.now(),
        });
        
        // Log activity
        await activityService.logSettlementCreated({
          settlementId: settlement.id,
        });
      }

      setSettleModalVisible(false);
      loadFriendData();
    } catch (error) {
      console.error('Error settling up:', error);
      Alert.alert('Error', 'Failed to settle up');
    } finally {
      setIsSettlingUp(false);
    }
  };

  function handleEditExpense(expenseId: string) {
    swipeableRefs.current.get(expenseId)?.close();
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
              loadFriendData();
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

  const handleRemoveFriend = () => {
    if (isRemovingFriend) return;
    
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend?.name} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsRemovingFriend(true);
              await friendshipService.remove(currentUserId, id);
              router.back();
              Alert.alert('Success', `${friend?.name} has been removed from your friends`);
            } catch (error) {
              console.error('Error removing friend:', error);
              Alert.alert('Error', 'Failed to remove friend');
              setIsRemovingFriend(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return <LoadingState message="Loading friend details..." />;
  }

  if (!friend) {
    return null;
  }

  const balance = friend.balance;
  const balanceColor = balance > 0 ? '#10b981' : balance < 0 ? '#ef4444' : '#2DD4BF';
  const balanceGradient = balance > 0 
    ? ['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.05)']
    : balance < 0 
    ? ['rgba(239, 68, 68, 0.2)', 'rgba(239, 68, 68, 0.05)']
    : ['rgba(45, 212, 191, 0.2)', 'rgba(45, 212, 191, 0.05)'];

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
      
      {/* Animated background orbs */}
      <View style={styles.orbContainer}>
        <Animated.View style={[styles.orb, styles.orb1, { transform: [{ scale: pulseAnim }] }]} />
        <Animated.View style={[styles.orb, styles.orb2]} />
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
        <View style={styles.headerActions}>
          <TouchableOpacity 
            onPress={handleRemoveFriend}
            style={[styles.headerActionButton, { 
              backgroundColor: 'rgba(239, 68, 68, 0.15)', 
              borderColor: 'rgba(239, 68, 68, 0.3)' 
            }]}>
            <IconSymbol size={18} name="trash" color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

      {/* Profile Hero Section */}
      <Animated.View style={[
        styles.heroSection,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        }
      ]}>
        {/* Large Avatar with glow effect */}
        <View style={styles.avatarWrapper}>
          <LinearGradient
            colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
            style={styles.avatarGlow}
          />
          <View style={[styles.avatar, { backgroundColor: isDark ? '#0A0A0F' : '#fff' }]}>
            <LinearGradient
              colors={isDark ? ['rgba(45, 212, 191, 0.3)', 'rgba(45, 212, 191, 0.1)'] : ['rgba(34, 197, 94, 0.3)', 'rgba(34, 197, 94, 0.1)']}
              style={styles.avatarInner}>
              <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                {friend.name.charAt(0).toUpperCase()}
              </ThemedText>
            </LinearGradient>
          </View>
        </View>

        {/* Name and email */}
        <ThemedText type="title" style={[styles.friendName, !isDark && { color: colors.text }]}>
          {friend.name}
        </ThemedText>
        {friend.email && (
          <ThemedText style={[styles.friendEmail, !isDark && { color: colors.textSecondary }]}>
            {friend.email}
          </ThemedText>
        )}
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
            {balance !== 0 ? (
              <>
                <View style={styles.balanceHeader}>
                  <View style={[styles.balanceIndicator, { backgroundColor: balanceColor }]} />
                  <ThemedText style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
                    {balance > 0 ? `${friend.name.split(' ')[0]} owes you` : `You owe ${friend.name.split(' ')[0]}`}
                  </ThemedText>
                </View>
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                    ${Math.abs(balance).toFixed(2)}
                  </ThemedText>
                </Animated.View>
                <TouchableOpacity
                  onPress={() => setSettleModalVisible(true)}
                  activeOpacity={0.8}
                  style={styles.settleButtonContainer}>
                  <LinearGradient
                    colors={balance > 0 ? ['#10b981', '#059669'] : ['#ef4444', '#dc2626']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.settleButton}>
                    <IconSymbol size={18} name="checkmark.circle.fill" color="#fff" style={{ marginRight: 8 }} />
                    <ThemedText style={styles.settleButtonText}>Settle Up</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
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
                <ThemedText style={[styles.settledSubtext, !isDark && { color: colors.textSecondary }]}>
                  No outstanding balance with {friend.name.split(' ')[0]}
                </ThemedText>
              </View>
            )}
          </View>
        </BlurView>
      </Animated.View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={[styles.quickActionButton, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}
          onPress={() => router.push({ pathname: '/add-expense', params: { friendId: id } })}>
          <IconSymbol size={20} name="plus.circle.fill" color={isDark ? '#2DD4BF' : colors.tint} />
          <ThemedText style={[styles.quickActionText, { color: isDark ? '#2DD4BF' : colors.tint }]}>Add Expense</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quickActionButton, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
          <IconSymbol size={20} name="bell.fill" color={isDark ? '#2DD4BF' : colors.tint} />
          <ThemedText style={[styles.quickActionText, { color: isDark ? '#2DD4BF' : colors.tint }]}>Remind</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Expense History */}
      <View style={styles.historySection}>
        <View style={styles.sectionHeader}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
            Activity
          </ThemedText>
          <ThemedText style={[styles.expenseCount, !isDark && { color: colors.textSecondary }]}>
            {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
          </ThemedText>
        </View>

        {expenses.length === 0 ? (
          <View style={styles.emptyHistory}>
            <View style={[styles.emptyIconWrapper, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
              <IconSymbol size={32} name="doc.text" color={isDark ? '#2DD4BF' : colors.tint} />
            </View>
            <ThemedText style={[styles.emptyTitle, !isDark && { color: colors.text }]}>
              No expenses yet
            </ThemedText>
            <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
              Add an expense to start tracking with {friend.name.split(' ')[0]}
            </ThemedText>
          </View>
        ) : (
          expenses.map((item, index) => (
            <Swipeable
              key={item.id}
              ref={(ref) => {
                if (ref) {
                  swipeableRefs.current.set(item.id, ref);
                } else {
                  swipeableRefs.current.delete(item.id);
                }
              }}
              renderLeftActions={(progress, dragX) => (
                <Animated.View style={[styles.swipeActionLeft, { opacity: dragX.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
                  <TouchableOpacity onPress={() => handleEditExpense(item.id)} style={styles.swipeActionButton}>
                    <IconSymbol name="pencil" size={20} color="#fff" />
                    <ThemedText style={styles.swipeActionText}>Edit</ThemedText>
                  </TouchableOpacity>
                </Animated.View>
              )}
              renderRightActions={(progress, dragX) => (
                <Animated.View style={[styles.swipeActionRight, { opacity: dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
                  <TouchableOpacity onPress={() => handleDeleteExpense(item.id)} style={styles.swipeActionButton}>
                    <IconSymbol name="trash" size={20} color="#fff" />
                    <ThemedText style={styles.swipeActionText}>Delete</ThemedText>
                  </TouchableOpacity>
                </Animated.View>
              )}
              overshootLeft={false}
              overshootRight={false}
              friction={2}
              overshootFriction={8}
              enableTrackpadTwoFingerGesture
              containerStyle={{ overflow: 'visible' }}>
              <Animated.View
                style={[
                  styles.expenseCard,
                  !isDark && { backgroundColor: colors.card },
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value((index + 1) * 0.2)) }],
                  }
                ]}>
              <View style={[
                styles.expenseIcon,
                { backgroundColor: item.paidBy === currentUserId ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }
              ]}>
                <IconSymbol 
                  size={18} 
                  name={item.paidBy === currentUserId ? 'arrow.up.right' : 'arrow.down.left'} 
                  color={item.paidBy === currentUserId ? '#10b981' : '#ef4444'} 
                />
              </View>
              <View style={styles.expenseInfo}>
                <ThemedText style={[styles.expenseDescription, !isDark && { color: colors.text }]}>
                  {item.description}
                </ThemedText>
                <ThemedText style={[styles.expenseDate, !isDark && { color: colors.textSecondary }]}>
                  {formatDate(item.date)} • {item.paidByName} paid
                </ThemedText>
              </View>
              <View style={styles.expenseAmounts}>
                <ThemedText style={[styles.expenseTotal, !isDark && { color: colors.textSecondary }]}>
                  ${item.amount.toFixed(2)}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.expenseShare,
                    { color: item.paidBy === currentUserId ? '#10b981' : '#ef4444' },
                  ]}>
                  {item.paidBy === currentUserId
                    ? `+$${item.friendShare.toFixed(2)}`
                    : `-$${item.yourShare.toFixed(2)}`}
                </ThemedText>
              </View>
            </Animated.View>
            </Swipeable>
          ))
        )}
      </View>

      </ScrollView>

      <SettleUpModal
        visible={settleModalVisible}
        onClose={() => setSettleModalVisible(false)}
        friend={friend}
        onConfirm={handleSettleUp}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButtonRect: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 20,
    opacity: 0.3,
    top: -4,
    left: -4,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 42,
  },
  friendName: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 4,
  },
  friendEmail: {
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
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 56,
    marginBottom: 20,
  },
  settleButtonContainer: {
    width: '100%',
  },
  settleButton: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settleButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  settledSubtext: {
    fontSize: 14,
    opacity: 0.6,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  historySection: {
    paddingHorizontal: 16,
    marginBottom: 20,
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
  expenseCount: {
    fontSize: 13,
    opacity: 0.6,
  },
  emptyHistory: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
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
  expenseList: {
    paddingBottom: 100,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
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
  expenseDescription: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 3,
  },
  expenseDate: {
    fontSize: 12,
    opacity: 0.5,
  },
  expenseAmounts: {
    alignItems: 'flex-end',
  },
  expenseTotal: {
    fontSize: 12,
    opacity: 0.5,
    marginBottom: 2,
  },
  expenseShare: {
    fontSize: 16,
    fontWeight: '700',
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
