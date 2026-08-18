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
  ActivityIndicator,
  Alert,
  Keyboard,
  StyleSheet,
  Text,
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
  const { colors, settle, isDark } = useThemeColors();
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

    const amountCents = Math.round(amountNum * 100);
    const maxCents = Math.round(Math.abs(friend.balance) * 100);
    if (amountCents > maxCents) {
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
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />
        <View style={styles.skeletonContainer}>
          <View style={{ height: 60, borderRadius: 24, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', marginBottom: 16 }} />
          <View style={{ height: 120, borderRadius: 24, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', marginBottom: 16 }} />
          <View style={{ height: 48, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', marginBottom: 16 }} />
        </View>
      </View>
    );
  }

  if (loadError || !friend) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />
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
  const amountNum = parseFloat(amount) || 0;
  const isValidAmount = amountNum > 0 && Math.round(amountNum * 100) <= Math.round(maxAmount * 100);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { backgroundColor: isDark ? '#0b1326' : colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />

        <KeyboardAwareScroll
          contentContainerStyle={styles.scrollContent}>

          {/* User Identity Card */}
          <View style={[styles.profileCard, { backgroundColor: settle.cardBackground, borderColor: settle.cardBorder }]}>
            <View style={styles.profileRow}>
              <View style={[styles.avatar, { backgroundColor: settle.avatarSelectedBackground }]}>
                <Text style={[styles.avatarText, { color: settle.avatarText }]}>
                  {friend.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileTextContainer}>
                <ThemedText style={[styles.profileName, { color: isDark ? '#dae2fd' : colors.text }]}>
                  {friend.name}
                </ThemedText>
                <ThemedText style={[styles.profileEmail, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
                  {friend.email || `${friend.name.toLowerCase().replace(/\s+/g, '.')}@vasuli.app`}
                </ThemedText>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: settle.cardBorder }]} />
            <View style={styles.balanceRow}>
              <ThemedText style={[styles.balanceLabelText, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
                Total balance
              </ThemedText>
              <ThemedText style={[styles.balanceValueText, { color: settle.accentText }]}>
                ${maxAmount.toFixed(2)}
              </ThemedText>
            </View>
          </View>

          {/* Amount to Settle Display */}
          <View style={styles.formContainer}>
            <ThemedText style={[styles.inputLabel, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
              AMOUNT TO SETTLE
            </ThemedText>
            <View style={[styles.inputWrapper, {
              backgroundColor: settle.heroBackground,
              borderColor: settle.heroBorder,
            }]}>
              <View style={styles.inputInnerRow}>
                <Text style={[styles.currency, { color: settle.accentText }]}>$</Text>
                <TextInput
                  style={[styles.input, { color: settle.accentText }]}
                  value={amount}
                  onChangeText={handleAmountChange}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(6, 78, 59, 0.3)'}
                  selectTextOnFocus
                  maxFontSizeMultiplier={1.4}
                />
              </View>
            </View>

            {/* Quick Action Pills */}
            <View style={styles.quickSelectRow}>
              <TouchableOpacity
                onPress={() => handleQuickPercent(0.5)}
                style={[styles.quickSelectButton, { backgroundColor: settle.pillBackground }]}>
                <Text style={[styles.quickSelectText, { color: isDark ? '#dae2fd' : colors.text }]}>50%</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleQuickPercent(1.0)}
                style={[styles.quickSelectButton, { backgroundColor: settle.pillBackground }]}>
                <Text style={[styles.quickSelectText, { color: isDark ? '#dae2fd' : colors.text }]}>Full Balance</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirmation Text */}
          <ThemedText style={[styles.helperText, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
            This records that {isOwed ? `${friend.name} paid you ` : `you paid ${friend.name} `}
            <Text style={[styles.helperBoldAmount, { color: isDark ? '#dae2fd' : colors.text }]}>
              ${amountNum.toFixed(2)}
            </Text>
            {' to settle up.'}
          </ThemedText>
        </KeyboardAwareScroll>

        {/* Bottom Action Area */}
        <View style={[styles.bottomActionsContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.cancelButton}>
            <Text style={[styles.cancelButtonText, { color: isDark ? '#bbcabf' : colors.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!isValidAmount || settling}
            onPress={handleSettle}
            style={[
              styles.submitButton,
              { backgroundColor: settle.buttonBackground },
              (!isValidAmount || settling) && styles.submitButtonDisabled
            ]}>
            {settling ? (
              <ActivityIndicator size="small" color={isDark ? '#003824' : '#ffffff'} />
            ) : (
              <Text style={[styles.submitButtonText, { color: isDark ? '#003824' : '#ffffff' }]}>Record Payment</Text>
            )}
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
  scrollContent: {
    padding: 20,
    gap: 28,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  profileCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  profileTextContainer: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 2,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 20,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabelText: {
    fontSize: 15,
    fontWeight: '400',
  },
  balanceValueText: {
    fontSize: 20,
    fontWeight: '600',
  },
  formContainer: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 4,
  },
  inputWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    height: 110,
    paddingHorizontal: 24,
    borderWidth: 1,
  },
  inputInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  currency: {
    fontSize: 44,
    fontWeight: '800',
    marginRight: 2,
    textAlignVertical: 'center',
  },
  input: {
    fontSize: 44,
    fontWeight: '800',
    minWidth: 60,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
    textAlign: 'left',
  },
  quickSelectRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  quickSelectButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickSelectText: {
    fontSize: 14,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  helperBoldAmount: {
    fontWeight: '700',
  },
  bottomActionsContainer: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 8,
    alignItems: 'center',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitButton: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#003527',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.45,
    elevation: 0,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
