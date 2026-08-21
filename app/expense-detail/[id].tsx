import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { ExpenseDetailSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import { groupService } from '@/services/group-service';
import { createExpenseDeletedNotification, notificationService } from '@/services/notification-service';
import { queryKeys } from '@/services/query-keys';
import { userService } from '@/services/user-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';

export default function ExpenseDetailScreen() {
  const { gradients, colors, expenseDetail, isDark } = useThemeColors();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUserId = user?.id || '';

  const [isDeleting, setIsDeleting] = useState(false);

  const [fadeAnim] = useState(() => new Animated.Value(1));
  const [slideAnim] = useState(() => new Animated.Value(0));
  const queryClient = useQueryClient();
  const expenseQueryKey = useMemo(() => queryKeys.expenses.detail(id), [id]);
  const {
    data: expenseQueryData,
    error,
    isFetching,
    isLoading,
    isStale,
    refetch,
  } = useQuery({
    queryKey: expenseQueryKey,
    enabled: !!id,
    queryFn: async () => {
      const expenseData = await expenseService.getById(id);
      if (!expenseData) return null;

      const [splitsData, payer, group, activities] = await Promise.all([
        expenseService.getSplits(id),
        userService.getById(expenseData.paidBy),
        expenseData.groupId ? groupService.getById(expenseData.groupId) : Promise.resolve(null),
        activityService.getByTarget(id),
      ]);
      const splitUsers = await userService.getByIds(splitsData.map(split => split.userId));
      const usersById = new Map(splitUsers.map(user => [user.id, user]));

      return {
        expense: expenseData,
        splits: splitsData.map(split => ({ ...split, user: usersById.get(split.userId) })),
        payer,
        group,
        activities,
      };
    },
  });
  const expense = expenseQueryData?.expense ?? null;
  const splits = expenseQueryData?.splits ?? [];
  const payer = expenseQueryData?.payer ?? null;
  const group = expenseQueryData?.group ?? null;
  const activities = expenseQueryData?.activities ?? [];
  const loading = isLoading;
  const loadError = error ? getFetchErrorMessage(error) : null;

  useRefetchOnFocus({
    enabled: !!id,
    isFetching,
    isStale,
    refetch,
  });

  useEffect(() => {
    if (expenseQueryData === undefined) return;
    if (!expenseQueryData) {
      Alert.alert('Error', 'Expense not found');
      router.back();
      return;
    }

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
  }, [expenseQueryData, fadeAnim, slideAnim]);

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
                    .filter((userId, index) => splits[index].amount > 0)
                    .filter(userId => userId !== currentUserId)
                );
                const pushTokens = usersToNotify
                  .filter(u => u.pushToken)
                  .map(u => u.pushToken!);
                if (pushTokens.length > 0) {
                  const notification = createExpenseDeletedNotification(
                    id,
                    expense.description,
                    expense.amount,
                    user?.name || 'Someone',
                    group?.name,
                    group?.id
                  );
                  await notificationService.sendNotificationToUsers(pushTokens, notification);
                }
              }
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(id) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.expenses.list(currentUserId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.activity.list(currentUserId) }),
              ]);
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader
          title="Expense Details"
          onBack={() => router.back()}
        />
        <AsyncErrorState
          message={loadError}
          onRetry={() => void refetch()}
          title="Couldn't load expense"
        />
      </View>
    );
  }

  if (loading || !expense) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader
          title="Expense"
          onBack={() => router.back()}
        />
        <ExpenseDetailSkeleton />
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

  const isCreator = expense.createdBy === currentUserId || (!expense.createdBy && expense.paidBy === currentUserId);
  const isPayer = expense.paidBy === currentUserId;
  const isDeleted = Boolean(expense.deletedAt);
  const canManageExpense = !isDeleted && (isCreator || isPayer);
  const payerName = isPayer ? 'You' : payer?.name || 'Unknown';

  const cardStyle = {
    backgroundColor: isDark ? '#0b1120' : '#ffffff',
    borderWidth: 0,
    shadowColor: isDark ? '#000000' : '#475569',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.35 : 0.09,
    shadowRadius: 10,
    elevation: 3,
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#060b18' : colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <NavigationHeader
        title="Expense"
        onBack={() => router.back()}
        rightAction={
          <View style={styles.headerActions}>
            {canManageExpense && (
              <TouchableOpacity
                onPress={() => router.push(`/edit-expense/${id}` as any)}
                disabled={isDeleting}
                style={[styles.actionButton, {
                  backgroundColor: expenseDetail.accentSurface,
                  borderColor: expenseDetail.accentSurfaceBorder,
                  opacity: isDeleting ? 0.5 : 1,
                }]}
                accessibilityLabel="Edit expense"
                testID="expense-detail-edit-button">
                <IconSymbol name="pencil" size={18} color={expenseDetail.accent} />
              </TouchableOpacity>
            )}
            {canManageExpense && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                style={[styles.actionButton, {
                  backgroundColor: expenseDetail.dangerSurface,
                  borderColor: expenseDetail.dangerBorder,
                  opacity: isDeleting ? 0.5 : 1,
                }]}
                accessibilityLabel="Delete expense"
                testID="expense-detail-delete-button">
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
          <View style={[styles.amountCard, cardStyle]}>
            <View style={styles.amountContent}>
              <View style={styles.amountHeader}>
                <View style={styles.expenseTitleBlock}>
                  <ThemedText style={[styles.amountLabel, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                    Total
                  </ThemedText>
                  <ThemedText
                    type="subtitle"
                    numberOfLines={2}
                    style={[styles.description, { color: isDark ? '#f8fafc' : colors.text }]}>
                    {expense.description}
                  </ThemedText>
                </View>
                <ThemedText type='title' style={[styles.amount, { color: isDark ? '#10b981' : colors.accent }]}>
                  ${expense.amount.toFixed(2)}
                </ThemedText>
              </View>

              <View style={styles.amountMeta}>
                {group && (
                  <View style={[styles.metaPill, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 76, 58, 0.08)' }]}>
                    <IconSymbol name="person.3.fill" size={14} color={isDark ? '#10b981' : colors.accent} />
                    <ThemedText style={[styles.metaPillText, { color: isDark ? '#10b981' : colors.accent }]}>{group.name}</ThemedText>
                  </View>
                )}
                {expense.category && (
                  <View style={[styles.metaPill, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}>
                    <ThemedText style={[styles.metaPillText, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>{expense.category}</ThemedText>
                  </View>
                )}
              </View>

              <View style={[styles.detailGrid, { borderTopColor: isDark ? '#2a3441' : 'rgba(0, 0, 0, 0.06)' }]}>
                <View style={styles.detailItem}>
                  <ThemedText style={[styles.detailLabel, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                    Paid by
                  </ThemedText>
                  <ThemedText numberOfLines={1} type="defaultSemiBold" style={[styles.detailValue, { color: isDark ? '#f8fafc' : colors.text }]}>
                    {payerName}
                  </ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={[styles.detailLabel, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                    Date
                  </ThemedText>
                  <ThemedText numberOfLines={1} type="defaultSemiBold" style={[styles.detailValue, { color: isDark ? '#f8fafc' : colors.text }]}>
                    {dateStr}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>

          {isDeleted && (
            <View style={[styles.deletedBanner, {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
              borderColor: isDark ? 'rgba(248, 113, 113, 0.35)' : '#fecaca',
            }]}>
              <IconSymbol name="trash" size={18} color={isDark ? '#fca5a5' : '#b91c1c'} />
              <View style={styles.deletedBannerContent}>
                <ThemedText type="defaultSemiBold" style={{ color: isDark ? '#fecaca' : '#991b1b' }}>
                  Expense deleted
                </ThemedText>
                <ThemedText style={{ color: isDark ? '#fca5a5' : '#b91c1b' }}>
                  This is a historical record and can’t be edited or restored.
                </ThemedText>
              </View>
            </View>
          )}

          <View style={styles.splitSection}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : colors.text }]}>
                Split
              </ThemedText>
              <ThemedText style={[styles.sectionMeta, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                {splits.length} {splits.length === 1 ? 'person' : 'people'}
              </ThemedText>
            </View>

            <View style={[styles.splitCard, cardStyle]}>
              <View style={styles.splitList}>
                {splits.map((split, index) => {
                  const isCurrentUser = split.userId === currentUserId;
                  const splitPercentage = ((split.amount / expense.amount) * 100).toFixed(1);
                  const splitMeta = `${splitPercentage}%`;

                  return (
                    <View
                      key={split.userId}
                      style={[styles.splitRow, {
                        backgroundColor: isCurrentUser
                          ? (isDark ? '#0f172a' : 'rgba(15, 76, 58, 0.05)')
                          : undefined,
                        borderBottomColor: isDark ? '#2a3441' : 'rgba(0, 0, 0, 0.05)',
                        borderBottomWidth: index === splits.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      }]}>
                      <View style={[styles.splitAvatar, {
                        backgroundColor: isCurrentUser
                          ? '#10b981'
                          : (isDark ? '#162032' : 'rgba(15, 76, 58, 0.1)'),
                      }]}>
                        <ThemedText style={[styles.splitAvatarText, {
                          color: isCurrentUser ? '#003827' : (isDark ? '#10b981' : colors.accent),
                        }]}>
                          {isCurrentUser ? 'Y' : split.user?.name.charAt(0).toUpperCase() || '?'}
                        </ThemedText>
                      </View>
                      <ThemedText numberOfLines={1} type="defaultSemiBold" style={[styles.splitName, { color: isDark ? '#f8fafc' : colors.text }]}>
                        {isCurrentUser ? 'You' : split.user?.name || 'Unknown'}
                      </ThemedText>
                      <ThemedText style={[styles.splitType, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                        {splitMeta}
                      </ThemedText>
                      <ThemedText type="defaultSemiBold" style={[styles.splitAmount, {
                        color: isCurrentUser ? (isDark ? '#10b981' : colors.accent) : (isDark ? '#f8fafc' : colors.text),
                      }]}>
                        ${split.amount.toFixed(2)}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {activities.length > 0 && (
            <View style={styles.activitySection}>
              <View style={styles.sectionHeader}>
                <ThemedText type="subtitle" style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : colors.text }]}>
                  Activity
                </ThemedText>
                <ThemedText style={[styles.sectionMeta, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
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
                      return isDark ? '#10b981' : colors.accent;
                    case 'expense_updated':
                      return '#F59E0B';
                    case 'expense_deleted':
                      return '#EF4444';
                    default:
                      return isDark ? '#9ba6b8' : colors.textSecondary;
                  }
                };

                return (
                  <View style={[styles.activityCard, cardStyle]} key={activity.id}>
                    <View style={[styles.activityIcon, {
                      backgroundColor: isDark ? '#162032' : 'rgba(15, 76, 58, 0.1)',
                    }]}>
                      <IconSymbol
                        name={getActivityIcon()}
                        size={20}
                        color={getActivityColor()}
                      />
                    </View>
                    <View style={styles.activityContent}>
                      <ThemedText type="defaultSemiBold" style={[styles.activityDescription, { color: isDark ? '#f8fafc' : colors.text }]}>
                        {activity.description}
                      </ThemedText>
                      <View style={styles.activityMeta}>
                        <ThemedText style={[styles.activityUser, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                          {activity.userName || 'Unknown'}
                        </ThemedText>
                        <ThemedText style={[styles.activityDot, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                          •
                        </ThemedText>
                        <ThemedText style={[styles.activityTime, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                          {timeStr}
                        </ThemedText>
                      </View>
                    </View>
                    {activity.amount && (
                      <ThemedText type="defaultSemiBold" style={[styles.activityAmount, { color: isDark ? '#f8fafc' : colors.text }]}>
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
  splitCard: {
    borderRadius: 14,
  },
  splitList: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  splitRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  splitAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitAvatarText: {
    fontSize: 13,
    fontWeight: '700',
  },
  splitName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '600',
  },
  splitType: {
    width: 52,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  splitAmount: {
    width: 80,
    fontSize: 15,
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
    borderRadius: 14,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  deletedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  deletedBannerContent: {
    flex: 1,
    gap: 3,
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
