import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { friendDetailService } from '@/services/friend-detail-service';
import type { GroupDetailReadModel } from '@/services/group-detail-read-model';
import { applySettlementToGroupReadModel } from '@/services/group-detail-read-model';
import { queryKeys } from '@/services/query-keys';
import { settlementService } from '@/services/settlement-service';
import type { User } from '@/types/database';
import { normalizeCurrencyInput } from '@/utils/validation';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserWithBalance extends User {
  balance: number;
}

export default function FriendSettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { gradients, colors, isDark } = useThemeColors();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();

  const [friend, setFriend] = useState<UserWithBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [settling, setSettling] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      setLoading(true);

      const friendDetailQueryKey = queryKeys.friends.detail(currentUserId, id);
      const data = await friendDetailService.getDetail(currentUserId, id);
      if (!data || !data.friend) {
        Alert.alert('Error', 'Friend not found');
        router.back();
        return;
      }
      setFriend(data.friend);
      setAmount(Math.abs(data.friend.balance).toFixed(2));
    } catch (error) {
      console.error('Error loading friend data:', error);
      setLoadError(getFetchErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSettle = async () => {
    if (!friend) return;

    if (!amount.trim()) {
      Alert.alert('Error', 'Please enter an amount');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const maxAmount = Math.abs(friend.balance);
    if (amountNum > maxAmount) {
      Alert.alert('Error', 'Settlement amount cannot exceed the outstanding balance.');
      return;
    }

    const friendsHomeQueryKey = queryKeys.friends.home(currentUserId);
    const friendDetailQueryKey = queryKeys.friends.detail(currentUserId, id);

    let previousHomeFriends: any[] | undefined;
    let previousDetail: any | undefined;

    try {
      setSettling(false);

      // Optimistic updates
      const optimisticBalance = friend.balance > 0
        ? friend.balance - amountNum
        : friend.balance + amountNum;
      const normalizedOptimisticBalance = Math.abs(optimisticBalance) < 0.01 ? 0 : optimisticBalance;

      await queryClient.cancelQueries({ queryKey: friendsHomeQueryKey });
      await queryClient.cancelQueries({ queryKey: friendDetailQueryKey });

      previousHomeFriends = queryClient.getQueryData<any[]>(friendsHomeQueryKey);
      previousDetail = queryClient.getQueryData<any>(friendDetailQueryKey);

      queryClient.setQueryData<any[] | undefined>(friendsHomeQueryKey, (current: any) => current?.map((homeFriend: any) => (
        homeFriend.id === id
          ? {
            ...homeFriend,
            balance: normalizedOptimisticBalance,
            recentExpenses: normalizedOptimisticBalance === 0 ? [] : homeFriend.recentExpenses,
          }
          : homeFriend
      )));

      queryClient.setQueryData<any | null>(friendDetailQueryKey, (current: any) => current ? {
        ...current,
        friend: { ...current.friend, balance: normalizedOptimisticBalance },
      } : current);

      setSettling(true);

      const settlements = await settlementService.createPairSettlements({
        currentUserId,
        friendId: id,
        amount: amountNum,
        currency: 'USD',
        date: Date.now(),
      });

      try {
        for (const settlement of settlements) {
          const currentUserPaid = settlement.fromUserId === currentUserId;
          await activityService.logSettlementCreated({
            settlementId: settlement.id,
            fromUserId: settlement.fromUserId,
            fromUserName: currentUserPaid ? user!.name : friend.name,
            toUserName: currentUserPaid ? friend.name : user!.name,
            amount: settlement.amount,
            groupId: settlement.groupId,
          });
        }
      } catch {
        // Activity logging should not block a completed settlement.
      }

      const settledGroupIds = [...new Set(settlements.flatMap(settlement => settlement.groupId ? [settlement.groupId] : []))];
      for (const groupId of settledGroupIds) {
        const groupSettlements = settlements.filter(settlement => settlement.groupId === groupId);
        queryClient.setQueryData<GroupDetailReadModel | null>(
          queryKeys.groups.detail(currentUserId, groupId),
          current => groupSettlements.reduce(
            (model, settlement) => model ? applySettlementToGroupReadModel(model, settlement) : model,
            current,
          )
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: friendDetailQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.list(currentUserId) }),
        ...settledGroupIds.map(groupId => queryClient.invalidateQueries({
          queryKey: queryKeys.groups.detail(currentUserId, groupId),
        })),
      ]);

      Alert.alert('Success', `Recorded settlement of $${amountNum.toFixed(2)} with ${friend.name}`);
      router.back();
    } catch (error) {
      if (previousDetail) {
        queryClient.setQueryData(friendDetailQueryKey, previousDetail);
      }
      if (previousHomeFriends) {
        queryClient.setQueryData(friendsHomeQueryKey, previousHomeFriends);
      }
      console.error('Error settling up:', error);
      Alert.alert('Error', 'Failed to settle up');
    } finally {
      setSettling(false);
      queryClient.invalidateQueries({ queryKey: friendsHomeQueryKey });
    }
  };

  const handleAmountChange = (text: string) => {
    setAmount(normalizeCurrencyInput(text));
  };

  const handleQuickPercent = (percent: number) => {
    if (!friend) return;
    const value = Math.abs(friend.balance) * percent;
    setAmount(value.toFixed(2));
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="Settle Up" onBack={() => router.back()} />
        <View style={styles.skeletonContainer}>
          <View style={{ height: 60, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', marginBottom: 16 }} />
          <View style={{ height: 120, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', marginBottom: 16 }} />
          <View style={{ height: 48, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', marginBottom: 16 }} />
        </View>
      </View>
    );
  }

  if (loadError || !friend) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="Settle Up" onBack={() => router.back()} />
        <AsyncErrorState
          message={loadError || 'Unable to load friend details'}
          onRetry={loadData}
          title="Loading failed"
        />
      </View>
    );
  }

  const isOwed = friend.balance > 0;
  const maxAmount = Math.abs(friend.balance);
  const isValidAmount = parseFloat(amount) > 0;

  const brandAccent = isDark ? '#2DD4BF' : '#0F4C3A';
  const brandGradient = isDark ? (['#2DD4BF', '#14B8A6'] as const) : (['#22c55e', '#16a34a'] as const);
  const avatarBg = isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(15, 76, 58, 0.1)';

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />

        <KeyboardAwareScroll
          contentContainerStyle={styles.scrollContent}>

          {/* Friend Profile Card */}
          <View style={[styles.profileCard, { backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff' }]}>
            <View style={styles.profileRow}>
              <View style={[styles.avatar, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : '#E8FDF5' }]}>
                <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}>
                  {friend.name.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.profileTextContainer}>
                <ThemedText type="subtitle" style={{ color: colors.text, fontWeight: '600' }}>
                  {friend.name}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {friend.email || `${friend.name.toLowerCase().replace(' ', '.')}@vasuli.app`}
                </ThemedText>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]} />
            <View style={styles.balanceRow}>
              <ThemedText style={[styles.balanceLabelText, { color: colors.textSecondary }]}>
                Total balance
              </ThemedText>
              <ThemedText type='subtitle' style={[styles.balanceValueText, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}>
                ${maxAmount.toFixed(2)}
              </ThemedText>
            </View>
          </View>

          {/* Amount Form */}
          <View style={styles.formContainer}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Amount to Settle
            </ThemedText>
            <View style={[styles.inputWrapper, { backgroundColor: isDark ? 'rgba(243, 244, 253, 0.06)' : '#EAEFFF' }]}>
              <ThemedText style={[styles.currency, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}>$</ThemedText>
              <TextInput
                style={[styles.input, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}
                value={amount}
                onChangeText={handleAmountChange}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(15, 76, 58, 0.3)'}
                selectTextOnFocus
              />
            </View>

            {/* Quick selectors */}
            <View style={styles.quickSelectRow}>
              <TouchableOpacity
                onPress={() => handleQuickPercent(0.5)}
                style={[styles.quickSelectButton, { backgroundColor: isDark ? 'rgba(243, 244, 253, 0.08)' : '#E0E7FF' }]}>
                <ThemedText style={[styles.quickSelectText, { color: colors.textSecondary }]}>50%</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleQuickPercent(1.0)}
                style={[styles.quickSelectButton, { backgroundColor: isDark ? 'rgba(243, 244, 253, 0.08)' : '#E0E7FF' }]}>
                <ThemedText style={[styles.quickSelectText, { color: colors.textSecondary }]}>Full Balance</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          <ThemedText style={[styles.helperText, { color: colors.textSecondary, marginTop: 12 }]}>
            This records that {friend.name} paid you{' '}
            <ThemedText style={{ fontWeight: '700', color: colors.text }}>
              ${(parseFloat(amount) || 0).toFixed(2)}
            </ThemedText>{' '}
            to settle up.
          </ThemedText>
        </KeyboardAwareScroll>

        {/* Bottom Sticky Action Buttons */}
        <View style={[styles.bottomActionsContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.cancelButton}>
            <ThemedText style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
              Cancel
            </ThemedText>
          </TouchableOpacity>

          {/* Confirm Button */}
          <TouchableOpacity
            disabled={!isValidAmount || settling}
            onPress={handleSettle}
            style={[
              styles.submitButton,
              { backgroundColor: isDark ? '#0F3E3A' : '#0F4C3A' },
              (!isValidAmount || settling) && styles.submitButtonDisabled
            ]}>
            <ThemedText style={styles.submitButtonText}>
              {settling ? 'Recording...' : 'Record Payment'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skeletonContainer: {
    padding: 20,
    gap: 16,
  },
  skeleton: {
    width: '100%',
  },
  scrollContent: {
    padding: 16,
    gap: 24,
  },
  profileCard: {
    padding: 18,
    borderRadius: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  profileTextContainer: {
    flex: 1,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabelText: {
    fontSize: 14,
    fontWeight: '500',
  },
  balanceValueText: {
    fontSize: 18,
    fontWeight: '700',
  },
  formContainer: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    height: 110,
    paddingHorizontal: 24,
  },
  currency: {
    fontSize: 32,
    fontWeight: '600',
    marginRight: 6,
    textAlignVertical: 'center',
  },
  input: {
    fontSize: 38,
    fontWeight: '700',
    minWidth: 180,
    paddingVertical: 0,
    margin: 0,
    textAlignVertical: 'center',
  },
  quickSelectRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickSelectButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickSelectText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomActionsContainer: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
    alignItems: 'center',
  },
  helperText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  cancelButton: {
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.45,
    elevation: 0,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
