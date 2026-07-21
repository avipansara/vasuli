import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { expenseService, groupService, userService } from '@/services/api';
import { createExpenseDeletedNotification, notificationService } from '@/services/notification-service';
import type { Activity, Expense, ExpenseSplit, Group, User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';

interface ExpenseSplitWithUser extends ExpenseSplit {
  user?: User;
}

export default function ExpenseDetailScreen() {
  const { gradients, colors, expenseDetail } = useThemeColors();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUserId = user?.id || '';

  const [expense, setExpense] = useState<Expense | null>(null);
  const [splits, setSplits] = useState<ExpenseSplitWithUser[]>([]);
  const [payer, setPayer] = useState<User | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [fadeAnim] = useState(() => new Animated.Value(1));
  const [slideAnim] = useState(() => new Animated.Value(0));
  const hasLoadedOnce = useRef(false);

  const loadExpenseDetails = useCallback(async () => {
    setLoadError(null);
    if (!hasLoadedOnce.current) {
      setLoading(true);
    }
    try {
      const expenseData = await expenseService.getById(id);
      if (!expenseData) {
        setLoading(false);
        Alert.alert('Error', 'Expense not found');
        router.back();
        return;
      }

      setExpense(expenseData);

      const [splitsData, payerData, groupData, activitiesData] = await Promise.all([
        expenseService.getSplits(id),
        userService.getById(expenseData.paidBy),
        expenseData.groupId ? groupService.getById(expenseData.groupId) : Promise.resolve(null),
        activityService.getByTarget(id),
      ]);
      const splitUsers = await userService.getByIds(splitsData.map(split => split.userId));
      const usersById = new Map(splitUsers.map(user => [user.id, user]));
      const splitsWithUsers = splitsData.map(split => ({ ...split, user: usersById.get(split.userId) }));
      setSplits(splitsWithUsers);

      // Load payer info
      setPayer(payerData);

      // Load group info if expense is part of a group
      if (expenseData.groupId) {
        setGroup(groupData);
      }

      // Load activity history for this expense
      setActivities(activitiesData);

      hasLoadedOnce.current = true;
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
    } catch (error) {
      console.error('Error loading expense details:', error);
      setLoadError(getFetchErrorMessage(error));
      setLoading(false);
    }
  }, [fadeAnim, id, slideAnim]);

  useFocusEffect(
    useCallback(() => {
      loadExpenseDetails();
    }, [loadExpenseDetails])
  );

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
              if (expense) {
                const usersToNotify = await userService.getByIds(
                  splits
                    .map(split => split.userId)
                    .filter(userId => userId !== currentUserId)
                );
                const pushTokens = usersToNotify
                  .filter(u => u.pushToken)
                  .map(u => u.pushToken!);
                if (pushTokens.length > 0) {
                  const notification = createExpenseDeletedNotification(
                    expense.description,
                    expense.amount,
                    user?.name || 'Someone',
                    group?.name
                  );
                  await notificationService.sendNotificationToUsers(pushTokens, notification);
                }
              }
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

  if (loadError) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <NavigationHeader
          title="Expense Details"
          onBack={() => router.back()}
        />
        <AsyncErrorState
          message={loadError}
          onRetry={() => void loadExpenseDetails()}
          title="Couldn't load expense"
        />
      </View>
    );
  }

  if (loading || !expense) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <LoadingState message="Loading expense details..." />
      </View>
    );
  }


  const date = new Date(expense.date);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const isPayer = expense.paidBy === currentUserId;
  const payerName = isPayer ? 'You' : payer?.name || 'Unknown';
  const surfaceStyle = {
    backgroundColor: expenseDetail.surface,
    borderColor: expenseDetail.surfaceBorder,
  };
  const mutedSurfaceStyle = {
    backgroundColor: expenseDetail.mutedSurface,
    borderColor: expenseDetail.mutedSurfaceBorder,
  };


  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      <View pointerEvents="none" style={styles.ambientLayer}>
        <View style={[styles.ambientShape, styles.ambientTop, { backgroundColor: expenseDetail.backgroundAccentTop }]} />
        <View style={[styles.ambientShape, styles.ambientMiddle, { backgroundColor: expenseDetail.backgroundAccentMiddle }]} />
        <View style={[styles.ambientShape, styles.ambientBottom, { backgroundColor: expenseDetail.backgroundAccentBottom }]} />
      </View>

      <NavigationHeader
        title="Expense"
        onBack={() => router.back()}
        rightAction={
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push(`/edit-expense/${id}` as any)}
              disabled={isDeleting}
              style={[styles.actionButton, {
                backgroundColor: expenseDetail.accentSurface,
                borderColor: expenseDetail.accentSurfaceBorder,
                opacity: isDeleting ? 0.5 : 1,
              }]}
              accessibilityLabel="Edit expense">
              <IconSymbol name="pencil" size={18} color={expenseDetail.accent} />
            </TouchableOpacity>
            {isPayer && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                style={[styles.actionButton, {
                  backgroundColor: expenseDetail.dangerSurface,
                  borderColor: expenseDetail.dangerBorder,
                  opacity: isDeleting ? 0.5 : 1,
                }]}
                accessibilityLabel="Delete expense">
                {isDeleting ? (
                  <IconSymbol name="clock" size={18} color={expenseDetail.danger} />
                ) : (
                  <IconSymbol name="trash" size={18} color={expenseDetail.danger} />
                )}
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        <Animated.View style={[styles.mainContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={[styles.amountCard, surfaceStyle]}>
            <View style={styles.amountContent}>
              <View style={styles.amountHeader}>
                <View style={styles.expenseTitleBlock}>
                  <ThemedText style={[styles.amountLabel, { color: colors.textSecondary }]}>
                    Total
                  </ThemedText>
                  <ThemedText
                    numberOfLines={2}
                    style={[styles.description, { color: colors.text }]}>
                    {expense.description}
                  </ThemedText>
                </View>
                <ThemedText style={[styles.amount, { color: expenseDetail.accent }]}>
                  ${expense.amount.toFixed(2)}
                </ThemedText>
              </View>

              <View style={styles.amountMeta}>
                {group && (
                  <View style={[styles.metaPill, { backgroundColor: expenseDetail.accentSurface }]}>
                    <IconSymbol name="person.3.fill" size={14} color={expenseDetail.accent} />
                    <ThemedText style={[styles.metaPillText, { color: expenseDetail.accent }]}>{group.name}</ThemedText>
                  </View>
                )}
                {expense.category && (
                  <View style={[styles.metaPill, { backgroundColor: expenseDetail.neutralPillSurface }]}>
                    <ThemedText style={[styles.metaPillText, { color: colors.textSecondary }]}>{expense.category}</ThemedText>
                  </View>
                )}
              </View>

              <View style={[styles.detailGrid, { borderColor: expenseDetail.divider }]}>
                <View style={styles.detailItem}>
                  <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>
                    Paid by
                  </ThemedText>
                  <ThemedText numberOfLines={1} style={[styles.detailValue, { color: colors.text }]}>
                    {payerName}
                  </ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>
                    Date
                  </ThemedText>
                  <ThemedText numberOfLines={1} style={[styles.detailValue, { color: colors.text }]}>
                    {dateStr}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.splitSection}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
                Split
              </ThemedText>
              <ThemedText style={[styles.sectionMeta, { color: colors.textSecondary }]}>
                {splits.length} {splits.length === 1 ? 'person' : 'people'}
              </ThemedText>
            </View>

            <View style={[styles.splitList, mutedSurfaceStyle]}>
              {splits.map((split, index) => {
                const isCurrentUser = split.userId === currentUserId;
                const splitPercentage = ((split.amount / expense.amount) * 100).toFixed(1);
                const splitMeta = split.splitType === 'custom' ? 'Custom' : `${splitPercentage}%`;

                return (
                  <View
                    key={split.userId}
                    style={[styles.splitRow, {
                      backgroundColor: isCurrentUser ? expenseDetail.selectedSurface : undefined,
                      borderBottomColor: expenseDetail.divider,
                      borderBottomWidth: index === splits.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    }]}>
                    <View style={[styles.splitAvatar, {
                      backgroundColor: isCurrentUser
                        ? expenseDetail.accent
                        : expenseDetail.avatarSurface,
                    }]}>
                      <ThemedText style={[styles.splitAvatarText, {
                        color: isCurrentUser ? expenseDetail.onAccent : expenseDetail.accent,
                      }]}>
                        {isCurrentUser ? 'Y' : split.user?.name.charAt(0).toUpperCase() || '?'}
                      </ThemedText>
                    </View>
                    <ThemedText numberOfLines={1} style={[styles.splitName, { color: colors.text }]}>
                      {isCurrentUser ? 'You' : split.user?.name || 'Unknown'}
                    </ThemedText>
                    <ThemedText style={[styles.splitType, { color: colors.textSecondary }]}>
                      {splitMeta}
                    </ThemedText>
                    <ThemedText style={[styles.splitAmount, {
                      color: isCurrentUser ? expenseDetail.accent : colors.text,
                    }]}>
                      ${split.amount.toFixed(2)}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          </View>

          {activities.length > 0 && (
            <View style={styles.activitySection}>
              <View style={styles.sectionHeader}>
                <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
                  Activity
                </ThemedText>
                <ThemedText style={[styles.sectionMeta, { color: colors.textSecondary }]}>
                  {activities.length} {activities.length === 1 ? 'update' : 'updates'}
                </ThemedText>
              </View>

              {activities.map((activity) => {
                const activityDate = new Date(activity.createdAt);
                const timeStr = activityDate.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                });

                const getActivityIcon = () => {
                  switch (activity.type) {
                    case 'expense_created':
                      return 'plus.circle.fill';
                    case 'expense_updated':
                      return 'pencil.circle.fill';
                    case 'expense_deleted':
                      return 'trash.circle.fill';
                    default:
                      return 'circle.fill';
                  }
                };

                const getActivityColor = () => {
                  switch (activity.type) {
                    case 'expense_created':
                      return expenseDetail.accent;
                    case 'expense_updated':
                      return expenseDetail.warning;
                    case 'expense_deleted':
                      return expenseDetail.danger;
                    default:
                      return colors.textSecondary;
                  }
                };

                return (
                  <View style={[styles.activityCard, mutedSurfaceStyle]} key={activity.id}>
                    <View style={[styles.activityIcon, {
                      backgroundColor: expenseDetail.accentSurface,
                    }]}>
                      <IconSymbol
                        name={getActivityIcon()}
                        size={20}
                        color={getActivityColor()}
                      />
                    </View>
                    <View style={styles.activityContent}>
                      <ThemedText style={[styles.activityDescription, { color: colors.text }]}>
                        {activity.description}
                      </ThemedText>
                      <View style={styles.activityMeta}>
                        <ThemedText style={[styles.activityUser, { color: colors.textSecondary }]}>
                          {activity.userName || 'Unknown'}
                        </ThemedText>
                        <ThemedText style={[styles.activityDot, { color: colors.textSecondary }]}>
                          •
                        </ThemedText>
                        <ThemedText style={[styles.activityTime, { color: colors.textSecondary }]}>
                          {timeStr}
                        </ThemedText>
                      </View>
                    </View>
                    {activity.amount && (
                      <ThemedText style={[styles.activityAmount, { color: colors.text }]}>
                        ${activity.amount.toFixed(2)}
                      </ThemedText>
                    )}
                  </View>
                );
              })}
            </View>
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
  ambientLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  ambientShape: {
    position: 'absolute',
    borderRadius: 999,
  },
  ambientTop: {
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -94,
    right: -150,
  },
  ambientMiddle: {
    width: 320,
    height: 320,
    borderRadius: 160,
    left: -168,
    top: 292,
  },
  ambientBottom: {
    width: 280,
    height: 280,
    borderRadius: 140,
    right: -144,
    top: 600,
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
    gap: 6,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
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
    paddingBottom: 72,
  },
  mainContent: {
    gap: 10,
  },
  amountCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 2,
    overflow: 'hidden',
  },
  amountContent: {
    padding: 14,
    gap: 10,
  },
  amountHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  expenseTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  amount: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
    textAlign: 'right',
  },
  description: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: 4,
  },
  amountMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  detailItem: {
    flex: 1,
    minWidth: 0,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  splitSection: {
    gap: 6,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  splitList: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  splitRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
  },
  splitAvatar: {
    width: 24,
    height: 24,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitAvatarText: {
    fontSize: 12,
    fontWeight: '700',
  },
  splitName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
  },
  splitType: {
    width: 50,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  splitAmount: {
    width: 78,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  activitySection: {
    gap: 6,
    marginTop: 4,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 10,
  },
  activityIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  activityDescription: {
    fontSize: 14,
    fontWeight: '600',
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activityUser: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  activityDot: {
    fontSize: 12,
    opacity: 0.5,
  },
  activityTime: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
});
