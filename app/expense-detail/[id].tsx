import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { ExpenseDetailSkeleton } from '@/components/ui/skeleton';
import { ThemedIconButton } from '@/components/ui/themed-icon-button';
import { useAuth } from '@/contexts/auth-context-otp';
import { useAnalytics } from '@/contexts/analytics-context';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import { groupService } from '@/services/group-service';
import { buildFriendshipStatus } from '@/services/group-detail-read-model';
import { friendshipService } from '@/services/friendship-service';
import { createExpenseDeletedNotification, notificationService } from '@/services/notification-service';
import { getExpenseDeletionInvalidationKeys } from '@/services/expense-deletion-invalidation';
import { trackExpenseDeleted } from '@/lib/analytics/track';
import { invalidateFriendRelationshipSurfaces } from '@/services/friend-relationship-invalidation';
import { queryKeys } from '@/services/query-keys';
import { userService } from '@/services/user-service';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { formatExpenseDate } from '@/utils/expense-date';
import { formatRecurringLocalDate } from '@/utils/recurring-management';
import { useRecurringExpenseRule } from '@/hooks/use-recurring-expense-queries';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';

export default function ExpenseDetailScreen() {
  const { colors, expenseDetail, friends, isDark, recurring } = useThemeColors();
  const { user } = useAuth();
  const { service: analytics } = useAnalytics();
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
    enabled: !!id && !!currentUserId,
    queryFn: async () => {
      const expenseData = await expenseService.getById(id);
      if (!expenseData) return null;

      const [splitsData, payer, group, activities, friendships] = await Promise.all([
        expenseService.getSplits(id),
        userService.getById(expenseData.paidBy),
        expenseData.groupId ? groupService.getById(expenseData.groupId) : Promise.resolve(null),
        activityService.getByTarget(id),
        friendshipService.getAllFriendships(currentUserId),
      ]);
      const splitUsers = await userService.getByIds(splitsData.map(split => split.userId));
      const usersById = new Map(splitUsers.map(user => [user.id, user]));

      return {
        expense: expenseData,
        splits: splitsData.map(split => ({ ...split, user: usersById.get(split.userId) })),
        payer,
        group,
        activities,
        friendshipStatus: buildFriendshipStatus(currentUserId, friendships),
      };
    },
  });
  const expense = expenseQueryData?.expense ?? null;
  const recurringRuleQuery = useRecurringExpenseRule(currentUserId, expense?.recurringRuleId ?? '');
  const splits = expenseQueryData?.splits ?? [];
  const payer = expenseQueryData?.payer ?? null;
  const group = expenseQueryData?.group ?? null;
  const activities = expenseQueryData?.activities ?? [];
  const friendshipStatus = expenseQueryData?.friendshipStatus ?? new Map();
  const [requestingFriendId, setRequestingFriendId] = useState<string | null>(null);
  const loading = isLoading;
  const loadError = error ? getFetchErrorMessage(error) : null;

  const handleAddFriend = async (friendId: string) => {
    if (
      requestingFriendId
      || (friendshipStatus.get(friendId) !== 'none' && friendshipStatus.get(friendId) !== undefined)
    ) return;

    try {
      setRequestingFriendId(friendId);
      await friendshipService.create(currentUserId, friendId);
      queryClient.setQueryData(expenseQueryKey, (current: typeof expenseQueryData) => {
        if (!current) return current;
        const nextFriendshipStatus = new Map(current.friendshipStatus);
        nextFriendshipStatus.set(friendId, 'pending_sent');
        return { ...current, friendshipStatus: nextFriendshipStatus };
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.invitations.sentRequests(currentUserId) }),
        invalidateFriendRelationshipSurfaces(queryClient, currentUserId, friendId),
      ]);
    } catch (requestError) {
      console.error('Error sending friend request:', requestError);
      Alert.alert('Error', 'Failed to send friend request');
    } finally {
      setRequestingFriendId(null);
    }
  };

  useRefetchOnFocus({
    enabled: !!id && !!currentUserId,
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
              trackExpenseDeleted(analytics, {
                groupId: expense?.groupId,
                currency: expense?.currency,
              });
              const otherParticipantIds = splits
                .map(split => split.userId)
                .filter((userId, index) => splits[index].amount > 0)
                .filter(userId => userId !== currentUserId);
              await Promise.allSettled(
                getExpenseDeletionInvalidationKeys(currentUserId, {
                  expenseId: id,
                  recurringRuleId: expense?.recurringRuleId,
                  groupId: group?.id,
                  paidBy: expense?.paidBy,
                  participantIds: otherParticipantIds,
                }).map(queryKey => Promise.resolve().then(() => queryClient.invalidateQueries({ queryKey }))),
              );
              router.back();
              if (expense) {
                try {
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
                } catch (notificationError) {
                  console.warn('Expense deletion notification failed:', notificationError);
                }
              }
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

  const dateStr = expense.effectiveDate
    ? formatExpenseDate(expense)
    : formatDate(expense.date, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const isCreator = expense.createdBy === currentUserId || (!expense.createdBy && expense.paidBy === currentUserId);
  const isPayer = expense.paidBy === currentUserId;
  const isDeleted = Boolean(expense.deletedAt);
  const canManageExpense = !isDeleted && (isCreator || isPayer);
  const canEditFutureRule = recurringRuleQuery.data?.ownerId === currentUserId;
  const payerName = isPayer ? 'You' : payer?.name || 'Unknown';

  const cardStyle = {
    backgroundColor: isDark ? '#000000' : '#ffffff',
    borderWidth: 0,
    shadowColor: isDark ? '#64748b' : '#475569',
    shadowOffset: { width: 0, height: isDark ? 4 : 3 },
    shadowOpacity: isDark ? 0.15 : 0.09,
    shadowRadius: isDark ? 4 : 10,
    elevation: 1,
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
              <ThemedIconButton
                name="pencil"
                size={18}
                shape='square'
                accessibilityLabel={expense.recurringRuleId ? 'Edit this expense' : 'Edit expense'}
                testID="expense-detail-edit-button"
                onPress={() => router.push(`/edit-expense/${id}` as any)}
              />
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
                  <IconSymbol name="trash.fill" size={18} color={expenseDetail.danger} />
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
                  {formatCurrency(expense.amount, expense.currency)}
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

          {expense.recurringRuleId && (
            <View
              testID="expense-detail-recurring-banner"
              style={[
                styles.recurringBanner,
                {
                  backgroundColor: recurring.cardBackground,
                  borderColor: recurring.cardBorder,
                },
              ]}
            >
              <View style={styles.recurringBannerHeader}>
                <View style={[styles.recurringIconBadge, { backgroundColor: recurring.iconBackground }]}>
                  <IconSymbol name="arrow.trianglehead.2.clockwise" size={16} color={recurring.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.recurringBannerTitle, { color: colors.text }]}>
                    {recurringRuleQuery.data?.cadence
                      ? `Repeats ${recurringRuleQuery.data.cadence}`
                      : 'Recurring expense occurrence'}
                  </ThemedText>
                  <ThemedText style={[styles.recurringBannerSubtitle, { color: colors.textSecondary }]}>
                    {expense.scheduledFor
                      ? `Scheduled for ${formatRecurringLocalDate(expense.scheduledFor)}`
                      : 'Created automatically on schedule'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.recurringBannerActions}>
                <TouchableOpacity
                  testID="view-recurring-rule-button"
                  accessibilityRole="button"
                  accessibilityLabel="View recurring schedule"
                  onPress={() => router.push(`/recurring-expenses/${expense.recurringRuleId}` as any)}
                  style={[
                    styles.recurringActionButton,
                    {
                      backgroundColor: recurring.buttonBackground,
                      borderColor: recurring.buttonBorder,
                    },
                  ]}
                >
                  <ThemedText style={[styles.recurringActionText, { color: colors.tint }]}>
                    View schedule
                  </ThemedText>
                  <IconSymbol name="chevron.right" size={12} color={colors.tint} />
                </TouchableOpacity>

                {canEditFutureRule && (
                  <TouchableOpacity
                    testID="edit-future-recurring-rule-button"
                    accessibilityRole="button"
                    accessibilityLabel="Edit future expenses"
                    onPress={() => router.push(`/recurring-expenses/edit/${expense.recurringRuleId}` as any)}
                    style={[
                      styles.recurringActionButton,
                      {
                        backgroundColor: recurring.secondaryActionBackground,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.recurringActionText, { color: colors.text }]}>
                      Edit future expenses
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {isDeleted && (
            <View style={[styles.deletedBanner, {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
              borderColor: isDark ? 'rgba(248, 113, 113, 0.35)' : '#fecaca',
            }]}>
              <IconSymbol name="trash.fill" size={18} color={isDark ? '#fca5a5' : '#b91c1c'} />
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
                      {!isCurrentUser && split.user && (() => {
                        const status = friendshipStatus.get(split.userId);
                        if (status === 'accepted') return null;
                        const isPending = status === 'pending_sent';
                        const isReceived = status === 'pending_received';
                        const isRequesting = requestingFriendId === split.userId;

                        return (
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={status === 'none' || status === undefined ? `Add ${split.user.name} as a friend` : isPending ? `Friend request sent to ${split.user.name}` : `Friend request received from ${split.user.name}`}
                            accessibilityState={{ disabled: status !== 'none' && status !== undefined, busy: isRequesting }}
                            disabled={isRequesting || (status !== 'none' && status !== undefined)}
                            onPress={() => void handleAddFriend(split.userId)}
                            style={[styles.friendAction, {
                              backgroundColor: isPending || isReceived ? friends.settledSurface : friends.actionSurface,
                              borderColor: friends.actionBorder,
                              opacity: isRequesting ? 0.65 : 1,
                            }]}
                            testID={`expense-detail-add-friend-${split.userId}`}>
                            {isRequesting ? (
                              <ActivityIndicator size="small" color={friends.actionIcon} />
                            ) : (
                              <IconSymbol name={isPending || isReceived ? 'clock' : 'person.badge.plus'} size={13} color={friends.actionIcon} />
                            )}
                            <ThemedText style={[styles.friendActionText, { color: friends.actionIcon }]}>
                              {status === 'none' || status === undefined ? 'Add friend' : isPending ? 'Request sent' : 'Request received'}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      })()}
                      <ThemedText style={[styles.splitType, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                        {splitMeta}
                      </ThemedText>
                      <ThemedText type="defaultSemiBold" style={[styles.splitAmount, {
                        color: isCurrentUser ? (isDark ? '#10b981' : colors.accent) : (isDark ? '#f8fafc' : colors.text),
                      }]}>
                        {formatCurrency(split.amount, expense.currency)}
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
                <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
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
                      return colors.accent;
                    case 'expense_updated':
                      return expenseDetail.warning;
                    case 'expense_deleted':
                      return colors.error;
                    default:
                      return colors.textSecondary;
                  }
                };

                let isRecurring = false;
                if (activity.metadata) {
                  try {
                    const parsed = typeof activity.metadata === 'string' ? JSON.parse(activity.metadata) : activity.metadata;
                    isRecurring = Boolean(parsed?.recurring);
                  } catch {}
                }

                return (
                  <View style={[styles.activityCard, cardStyle]} key={activity.id}>
                    <View style={[styles.activityIcon, {
                      backgroundColor: expenseDetail.avatarSurface,
                    }]}>
                      <IconSymbol
                        name={getActivityIcon()}
                        size={20}
                        color={getActivityColor()}
                      />
                    </View>
                    <View style={styles.activityContent}>
                      <ThemedText type="defaultSemiBold" style={[styles.activityDescription, { color: colors.text }]}>
                        {activity.description}
                      </ThemedText>
                      <View style={[styles.activityMeta, isRecurring && styles.recurringActivityMeta]}>
                        {isRecurring && (
                          <ThemedText style={[styles.activityUser, { color: recurring.badgeActiveText, fontWeight: '700' }]}>
                            Created automatically
                          </ThemedText>
                        )}
                        <View style={styles.activityMetaDetails}>
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
                    </View>
                    {activity.amount && (
                      <ThemedText type="defaultSemiBold" style={[styles.activityAmount, { color: colors.text }]}>
                        {formatCurrency(activity.amount, expense.currency)}
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
  friendAction: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderRadius: 8,
  },
  friendActionText: {
    fontSize: 10,
    fontWeight: '700',
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
  recurringActivityMeta: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  activityMetaDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
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
  recurringBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  recurringBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recurringIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recurringBannerTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  recurringBannerSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  recurringBannerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  recurringActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  recurringActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
