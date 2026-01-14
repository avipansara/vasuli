import { SettleUpModal } from '@/components/friends/settle-up-modal';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { calculateFriendBalance, expenseService, initDatabase, settlementService, userService } from '@/services/api';
import type { Expense, ExpenseSplit, User } from '@/types/database';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

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
  const currentUserId = 'current-user';

  useFocusEffect(
    useCallback(() => {
      loadFriendData();
    }, [id])
  );

  async function loadFriendData() {
    if (!id) return;
    
    try {
      setLoading(true);
      await initDatabase();
      
      console.log('[FriendDetail] Loading friend with id:', id);
      
      // Get friend info
      const friendData = await userService.getById(id);
      console.log('[FriendDetail] Friend data:', friendData);
      
      if (!friendData) {
        Alert.alert('Error', 'Friend not found');
        router.back();
        return;
      }

      // Calculate balance
      const balance = await calculateFriendBalance(currentUserId, id);
      console.log('[FriendDetail] Balance:', balance);
      setFriend({ ...friendData, balance });

      // Get all expenses and filter for ones involving both users
      const allExpenses = await expenseService.getAll();
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

  async function handleSettleUp(friendId: string, amount: number) {
    try {
      if (!friend) return;

      if (friend.balance > 0) {
        // Friend owes current user
        await settlementService.create({
          fromUserId: friendId,
          toUserId: currentUserId,
          amount,
          currency: 'USD',
          date: Date.now(),
        });
      } else {
        // Current user owes friend
        await settlementService.create({
          fromUserId: currentUserId,
          toUserId: friendId,
          amount,
          currency: 'USD',
          date: Date.now(),
        });
      }

      Alert.alert('Settled!', `Successfully settled up with ${friend.name}`);
      loadFriendData();
    } catch (error) {
      console.error('Error settling up:', error);
      Alert.alert('Error', 'Failed to settle up');
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading || !friend) {
    return (
      <LinearGradient colors={gradients.screenBackground} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </LinearGradient>
    );
  }

  const balance = friend.balance;
  const balanceColor = balance > 0 ? '#10b981' : balance < 0 ? '#ef4444' : '#2DD4BF';

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol size={24} name="chevron.left" color={isDark ? '#fff' : colors.text} />
        </TouchableOpacity>
        <ThemedText type="title" style={[styles.headerTitle, !isDark && { color: colors.text }]}>
          {friend.name}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      {/* Friend Summary Card */}
      <View style={[styles.summaryCard, !isDark && { backgroundColor: colors.card }]}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' },
          ]}>
          <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
            {friend.name.charAt(0).toUpperCase()}
          </ThemedText>
        </View>
        
        <View style={styles.summaryInfo}>
          <ThemedText type="subtitle" style={[styles.friendName, !isDark && { color: colors.text }]}>
            {friend.name}
          </ThemedText>
          {friend.email && (
            <ThemedText style={[styles.friendEmail, !isDark && { color: colors.textSecondary }]}>
              {friend.email}
            </ThemedText>
          )}
        </View>

        <View style={styles.balanceSection}>
          {balance !== 0 ? (
            <>
              <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                ${Math.abs(balance).toFixed(2)}
              </ThemedText>
              <ThemedText style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
                {balance > 0 ? 'owes you' : 'you owe'}
              </ThemedText>
            </>
          ) : (
            <ThemedText style={[styles.settledText, !isDark && { color: colors.textSecondary }]}>
              All settled up!
            </ThemedText>
          )}
        </View>

        {balance !== 0 && (
          <TouchableOpacity
            onPress={() => setSettleModalVisible(true)}
            activeOpacity={0.8}
            style={styles.settleButtonContainer}>
            <LinearGradient
              colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.settleButton}>
              <ThemedText style={styles.settleButtonText}>Settle Up</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* Expense History */}
      <View style={styles.historySection}>
        <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
          Expense History
        </ThemedText>

        {expenses.length === 0 ? (
          <View style={styles.emptyHistory}>
            <IconSymbol size={48} name="doc.text" color={isDark ? 'rgba(255,255,255,0.3)' : colors.textSecondary} />
            <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
              No expenses with {friend.name} yet
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={[styles.expenseCard, !isDark && { backgroundColor: colors.card }]}>
                <View style={styles.expenseLeft}>
                  <ThemedText style={[styles.expenseDescription, !isDark && { color: colors.text }]}>
                    {item.description}
                  </ThemedText>
                  <ThemedText style={[styles.expenseDate, !isDark && { color: colors.textSecondary }]}>
                    {formatDate(item.date)} • Paid by {item.paidByName}
                  </ThemedText>
                </View>
                <View style={styles.expenseRight}>
                  <ThemedText style={[styles.expenseTotal, !isDark && { color: colors.text }]}>
                    ${item.amount.toFixed(2)}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.expenseShare,
                      {
                        color:
                          item.paidBy === currentUserId
                            ? '#10b981'
                            : '#ef4444',
                      },
                    ]}>
                    {item.paidBy === currentUserId
                      ? `+$${item.friendShare.toFixed(2)}`
                      : `-$${item.yourShare.toFixed(2)}`}
                  </ThemedText>
                </View>
              </View>
            )}
            contentContainerStyle={styles.expenseList}
          />
        )}
      </View>

      <SettleUpModal
        visible={settleModalVisible}
        onClose={() => setSettleModalVisible(false)}
        friend={friend}
        onConfirm={handleSettleUp}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    color: '#fff',
  },
  headerSpacer: {
    width: 40,
  },
  summaryCard: {
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '600',
  },
  summaryInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  friendName: {
    fontSize: 20,
    color: '#fff',
  },
  friendEmail: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.7,
  },
  balanceSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
  },
  balanceLabel: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.7,
  },
  settledText: {
    fontSize: 16,
    opacity: 0.7,
  },
  settleButtonContainer: {
    width: '100%',
  },
  settleButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  settleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0F',
  },
  historySection: {
    flex: 1,
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 16,
    color: '#fff',
  },
  emptyHistory: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    marginTop: 12,
    opacity: 0.6,
  },
  expenseList: {
    paddingBottom: 100,
  },
  expenseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  expenseLeft: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 4,
  },
  expenseDate: {
    fontSize: 12,
    opacity: 0.6,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  expenseTotal: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 2,
  },
  expenseShare: {
    fontSize: 14,
    fontWeight: '600',
  },
});
