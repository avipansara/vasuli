import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { expenseService, groupService, userService } from '@/services/api';
import type { Expense, ExpenseSplit, Group, User } from '@/types/database';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

interface ExpenseSplitWithUser extends ExpenseSplit {
  user?: User;
}

export default function ExpenseDetailScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUserId = user?.id || '';

  const [expense, setExpense] = useState<Expense | null>(null);
  const [splits, setSplits] = useState<ExpenseSplitWithUser[]>([]);
  const [payer, setPayer] = useState<User | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadExpenseDetails();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadExpenseDetails();
    }, [id])
  );

  const loadExpenseDetails = async () => {
    try {
      const expenseData = await expenseService.getById(id);
      if (!expenseData) {
        Alert.alert('Error', 'Expense not found');
        router.back();
        return;
      }

      setExpense(expenseData);

      // Load splits with user info
      const splitsData = await expenseService.getSplits(id);
      const splitsWithUsers = await Promise.all(
        splitsData.map(async (split) => {
          const userData = await userService.getById(split.userId);
          return { ...split, user: userData || undefined };
        })
      );
      setSplits(splitsWithUsers);

      // Load payer info
      const payerData = await userService.getById(expenseData.paidBy);
      setPayer(payerData);

      // Load group info if expense is part of a group
      if (expenseData.groupId) {
        const groupData = await groupService.getById(expenseData.groupId);
        setGroup(groupData);
      }

      setLoading(false);

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
      ]).start();

      // Pulse animation for orbs
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
    } catch (error) {
      console.error('Error loading expense details:', error);
      Alert.alert('Error', 'Failed to load expense details');
      router.back();
    }
  }

  const handleDelete = () => {
    if (isDeleting) return;
    
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${expense?.description}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await expenseService.delete(id, currentUserId, user?.name || 'Unknown');
              router.back();
            } catch (error) {
              console.error('Error deleting expense:', error);
              Alert.alert('Error', 'Failed to delete expense');
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !expense) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 60 : 54 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, {
              backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
            }]}>
            <IconSymbol name="chevron.left" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Expense Details</ThemedText>
          <View style={styles.editButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </View>
    );
  }

  const date = new Date(expense.date);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const userSplit = splits.find(s => s.userId === currentUserId);
  const isPayer = expense.paidBy === currentUserId;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
      
      {/* Animated background orbs */}
      <View style={styles.orbContainer}>
        <Animated.View style={[styles.orb, styles.orb1, { transform: [{ scale: pulseAnim }] }]} />
        <Animated.View style={[styles.orb, styles.orb2]} />
        <View style={[styles.orb, styles.orb3]} />
      </View>

      <NavigationHeader 
        title="Expense Details" 
        onBack={() => router.back()}
        rightAction={
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push(`/edit-expense/${id}` as any)}
              disabled={isDeleting}
              style={[styles.actionButton, {
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                opacity: isDeleting ? 0.5 : 1,
              }]}>
              <IconSymbol name="pencil" size={18} color={isDark ? '#2DD4BF' : colors.tint} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              disabled={isDeleting}
              style={[styles.actionButton, {
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                opacity: isDeleting ? 0.5 : 1,
              }]}>
              {isDeleting ? (
                <ThemedText style={{ fontSize: 18 }}>⏳</ThemedText>
              ) : (
                <IconSymbol name="trash" size={18} color="#ef4444" />
              )}
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        
        <Animated.View style={[styles.mainContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Amount Card */}
          <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.amountCard}>
            <LinearGradient
              colors={isDark ? ['rgba(45, 212, 191, 0.15)', 'rgba(45, 212, 191, 0.05)'] : ['rgba(34, 197, 94, 0.15)', 'rgba(34, 197, 94, 0.05)']}
              style={styles.amountGradient}
            />
            <View style={styles.amountContent}>
              <ThemedText style={[styles.amountLabel, !isDark && { color: colors.textSecondary }]}>
                Total Amount
              </ThemedText>
              <ThemedText style={[styles.amount, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                ${expense.amount.toFixed(2)}
              </ThemedText>
              <ThemedText style={[styles.description, !isDark && { color: colors.text }]}>
                {expense.description}
              </ThemedText>
            </View>
          </BlurView>

          {/* Info Cards */}
          <View style={styles.infoSection}>
            {/* Payer Info */}
            <View style={[styles.infoCard, {
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            }]}>
              <View style={styles.infoHeader}>
                <IconSymbol name="person.circle.fill" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
                <ThemedText style={[styles.infoLabel, !isDark && { color: colors.textSecondary }]}>
                  Paid by
                </ThemedText>
              </View>
              <ThemedText style={[styles.infoValue, !isDark && { color: colors.text }]}>
                {isPayer ? 'You' : payer?.name || 'Unknown'}
              </ThemedText>
            </View>

            {/* Date Info */}
            <View style={[styles.infoCard, {
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            }]}>
              <View style={styles.infoHeader}>
                <IconSymbol name="calendar" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
                <ThemedText style={[styles.infoLabel, !isDark && { color: colors.textSecondary }]}>
                  Date
                </ThemedText>
              </View>
              <ThemedText style={[styles.infoValue, !isDark && { color: colors.text }]}>
                {dateStr}
              </ThemedText>
            </View>

            {/* Group Info */}
            {group && (
              <View style={[styles.infoCard, {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              }]}>
                <View style={styles.infoHeader}>
                  <IconSymbol name="person.3.fill" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
                  <ThemedText style={[styles.infoLabel, !isDark && { color: colors.textSecondary }]}>
                    Group
                  </ThemedText>
                </View>
                <ThemedText style={[styles.infoValue, !isDark && { color: colors.text }]}>
                  {group.name}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Split Details */}
          <View style={styles.splitSection}>
            <ThemedText style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
              Split Details
            </ThemedText>
            
            {splits.map((split) => {
              const isCurrentUser = split.userId === currentUserId;
              const splitPercentage = ((split.amount / expense.amount) * 100).toFixed(1);
              
              return (
                <View 
                  key={split.userId}
                  style={[styles.splitCard, {
                    backgroundColor: isCurrentUser 
                      ? (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.15)')
                      : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                    borderColor: isCurrentUser
                      ? (isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)')
                      : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                  }]}>
                  <View style={[styles.splitAvatar, {
                    backgroundColor: isCurrentUser
                      ? (isDark ? '#2DD4BF' : colors.tint)
                      : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                  }]}>
                    <ThemedText style={[styles.splitAvatarText, {
                      color: isCurrentUser ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint),
                    }]}>
                      {isCurrentUser ? 'You'.charAt(0) : split.user?.name.charAt(0).toUpperCase() || '?'}
                    </ThemedText>
                  </View>
                  <View style={styles.splitInfo}>
                    <ThemedText style={[styles.splitName, !isDark && { color: colors.text }]}>
                      {isCurrentUser ? 'You' : split.user?.name || 'Unknown'}
                    </ThemedText>
                    <View style={styles.splitDetails}>
                      <ThemedText style={[styles.splitType, !isDark && { color: colors.textSecondary }]}>
                        {split.splitType === 'equal' ? 'Equal split' : split.splitType === 'percentage' ? `${splitPercentage}%` : 'Custom amount'}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={[styles.splitAmount, {
                    color: isCurrentUser ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? '#fff' : colors.text),
                  }]}>
                    ${split.amount.toFixed(2)}
                  </ThemedText>
                </View>
              );
            })}
          </View>

          {/* Your Share Summary */}
          {userSplit && (
            <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.summaryCard}>
              <LinearGradient
                colors={isPayer 
                  ? (isDark ? ['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.05)'] : ['rgba(34, 197, 94, 0.2)', 'rgba(34, 197, 94, 0.05)'])
                  : (isDark ? ['rgba(239, 68, 68, 0.2)', 'rgba(239, 68, 68, 0.05)'] : ['rgba(239, 68, 68, 0.2)', 'rgba(239, 68, 68, 0.05)'])
                }
                style={styles.summaryGradient}
              />
              <View style={styles.summaryContent}>
                <ThemedText style={[styles.summaryLabel, !isDark && { color: colors.textSecondary }]}>
                  Your Share
                </ThemedText>
                <ThemedText style={[styles.summaryAmount, {
                  color: isPayer ? '#10b981' : '#ef4444',
                }]}>
                  ${userSplit.amount.toFixed(2)}
                </ThemedText>
                {isPayer && (
                  <ThemedText style={[styles.summaryNote, !isDark && { color: colors.textSecondary }]}>
                    You paid ${expense.amount.toFixed(2)} and are owed ${(expense.amount - userSplit.amount).toFixed(2)}
                  </ThemedText>
                )}
              </View>
            </BlurView>
          )}
        </Animated.View>
      </ScrollView>
    </View>
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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  mainContent: {
    gap: 20,
  },
  amountCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 8,
  },
  amountGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  amountContent: {
    padding: 32,
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
  },
  amount: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 12,
    lineHeight: 42,
  },
  description: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  infoSection: {
    gap: 12,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    opacity: 0.7,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 28,
  },
  splitSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  splitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  splitAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  splitInfo: {
    flex: 1,
    gap: 4,
  },
  splitName: {
    fontSize: 16,
    fontWeight: '600',
  },
  splitDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitType: {
    fontSize: 13,
    opacity: 0.7,
  },
  splitAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 8,
  },
  summaryGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  summaryContent: {
    padding: 24,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 34,
  },
  summaryNote: {
    fontSize: 13,
    opacity: 0.7,
    textAlign: 'center',
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
    bottom: -50,
    right: 50,
  },
});
