import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { friendDetailModule } from '@/services/friend-detail-module';
import { settlementModule, createPaymentIntentId, CombinedSettlementError } from '@/services/settlement-service';
import type { FriendRelationshipProjection } from '@/services/friend-detail-service';
import type { User } from '@/types/database';
import { formatCurrencyInput, normalizeCurrencyInput } from '@/utils/validation';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [relationship, setRelationship] = useState<FriendRelationshipProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [settling, setSettling] = useState(false);
  const paymentIntentIdRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      setLoading(true);

      const data = await friendDetailModule.getDetail(currentUserId, id);
      if (!data || !data.friend) {
        Alert.alert('Error', 'Friend not found');
        router.back();
        return;
      }
      setFriend(data.friend);
      const nextRelationship = data.relationship ?? null;
      setRelationship(nextRelationship);
      if (__DEV__ && nextRelationship) {
        console.log('[Settlement][screen-load]', {
          friendId: id,
          directBalance: nextRelationship.directBalance,
          settleableTotal: nextRelationship.settleableTotal,
          groupBalances: nextRelationship.groupBalances.map(group => ({
            groupId: group.groupId,
            amount: group.amount,
            currency: group.currency,
            direction: group.direction,
          })),
        });
      }
      const settleableTotal = nextRelationship?.settleableTotal;
      setAmount(settleableTotal ? Math.abs(settleableTotal.amount).toFixed(2) : nextRelationship?.zeroNetCurrency ? '0.00' : '');
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
    const isZeroNet = Boolean(relationship?.zeroNetCurrency && !relationship.settleableTotal);
    if (isNaN(amountNum) || amountNum < 0 || (amountNum === 0 && !isZeroNet)) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const settleableTotal = relationship?.settleableTotal;
    if (!settleableTotal && !isZeroNet) {
      Alert.alert('Choose a currency', 'This relationship has balances in multiple currencies. Open the Friend detail page and choose one currency to settle.');
      return;
    }
    if (!relationship) return;

    const combinedBalance = settleableTotal?.amount ?? 0;
    const settlementCurrency = settleableTotal?.currency ?? relationship?.zeroNetCurrency;
    if (!settlementCurrency) return;
    const amountCents = Math.round(amountNum * 100);
    const maxCents = Math.round(Math.abs(combinedBalance) * 100);
    if (amountCents > maxCents) {
      Alert.alert('Error', 'Settlement amount cannot exceed the combined outstanding balance.');
      return;
    }

    const paymentIntentId = paymentIntentIdRef.current ?? createPaymentIntentId();
    paymentIntentIdRef.current = paymentIntentId;

    const commitSettlement = async () => {
      try {
        setSettling(true);

        const receipt = await settlementModule.commit({
          currentUserId,
          friendId: id,
          paymentIntentId,
          currency: settlementCurrency,
          amount: amountNum,
          expectedBalance: combinedBalance,
          directBalance: relationship.directBalance,
          groupBalances: relationship.groupBalances,
          date: Date.now(),
          friend,
          currentUser: user!,
          queryClient,
        });
        const settlements = receipt.settlements;

        if (settlements.length === 0 && !receipt.transfers?.length) {
          Alert.alert('Choose a scope', 'There is no outstanding balance to settle.');
          return;
        }

        Alert.alert('Success', `Recorded settlement of ${formatCurrency(receipt.totalAmount, receipt.currency)} with ${friend.name}`);
        paymentIntentIdRef.current = null;
        router.back();
      } catch (error) {
        console.error('[Settlement][friend-screen] commit failed', {
          friendId: id,
          currency: settlementCurrency,
          amount: amountNum,
          expectedBalance: combinedBalance,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
        });
        if (error instanceof CombinedSettlementError && error.code === 'stale_balance') {
          Alert.alert('Balance changed', error.message, [{ text: 'Refresh', onPress: loadData }, { text: 'Cancel', style: 'cancel' }]);
          return;
        }
        if (error instanceof CombinedSettlementError) {
          if (error.code === 'transient') {
            Alert.alert('Payment not confirmed', error.message, [{ text: 'Retry' }, { text: 'Cancel', style: 'cancel' }]);
            return;
          }
          Alert.alert(error.code === 'unauthorized' ? 'Settlement unavailable' : 'Invalid settlement', error.message);
          return;
        }
        console.error('Error settling up:', error);
        Alert.alert('Error', 'Failed to settle up');
      } finally {
        setSettling(false);
      }
    };

    const previewLines = [
      ...((allocationPreview?.allocations ?? []).map(allocation =>
        `${allocation.groupId ? relationship.groupBalances.find(group => group.groupId === allocation.groupId)?.groupName ?? 'Group' : 'Direct'}: ${formatCurrency(allocation.amount, allocation.currency)} cash`
      )),
      ...((allocationPreview?.transfers ?? []).map(transfer =>
        `${relationship.groupBalances.find(group => group.groupId === transfer.groupId)?.groupName ?? 'Group'}: ${formatCurrency(Math.abs(transfer.signedGroupBalanceDelta), transfer.currency)} internal offset`
      )),
    ];
    Alert.alert(
      'Confirm Settle Up',
      [
        `Cash payment: ${formatCurrency(amountNum, settlementCurrency)}`,
        ...(amountNum === 0 ? ['No money changes hands; internal offsets only.'] : []),
        ...previewLines,
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => { void commitSettlement(); } },
      ],
    );
  };

  const handleAmountChange = (text: string) => {
    setAmount(normalizeCurrencyInput(text));
  };

  const handleAmountBlur = () => {
    setAmount(current => formatCurrencyInput(current));
  };

  const handleQuickPercent = (percent: number) => {
    if (!friend) return;
    const value = Math.abs(relationship?.settleableTotal?.amount ?? 0) * percent;
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

  const settleableTotal = relationship?.settleableTotal;
  const zeroNetCurrency = relationship?.zeroNetCurrency;
  const isZeroNet = Boolean(zeroNetCurrency && !settleableTotal);
  const combinedBalance = settleableTotal?.amount ?? 0;
  const isOwed = combinedBalance > 0;
  const maxAmount = Math.abs(combinedBalance);
  const amountNum = parseFloat(amount) || 0;
  const settlementCurrency = settleableTotal?.currency ?? zeroNetCurrency;
  let allocationPreview: ReturnType<typeof settlementModule.preview> | null = null;
  if (relationship && settlementCurrency && Number.isFinite(amountNum)) {
    try {
      allocationPreview = settlementModule.preview({
        currentUserId,
        friendId: id,
        currency: settlementCurrency,
        amount: amountNum,
        directBalance: relationship.directBalance,
        groupBalances: relationship.groupBalances,
      });
    } catch {
      allocationPreview = null;
    }
  }
  const isValidAmount = isZeroNet
    ? amountNum === 0
    : amountNum > 0 && Math.round(amountNum * 100) <= Math.round(maxAmount * 100);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />

        <KeyboardAwareScroll
          contentContainerStyle={styles.scrollContent}>

          {/* User Identity Card */}
          <View style={[styles.profileCard, {
            backgroundColor: settle.cardBackground,
            borderColor: settle.cardBorder,
            borderWidth: isDark ? 1 : 0,
            shadowColor: '#000000',
            shadowOpacity: isDark ? 0.32 : 0.12,
            elevation: 5,
          }]}>
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
                Combined relationship summary
              </ThemedText>
              <ThemedText style={[styles.balanceValueText, { color: settle.accentText }]}>
              {formatCurrency(maxAmount, settleableTotal?.currency ?? zeroNetCurrency)}
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
                <Text style={[styles.currency, { color: settle.accentText }]}>{getCurrencySymbol(settlementCurrency)}</Text>
                <TextInput
                  style={[styles.input, { color: settle.accentText }]}
                  value={amount}
                  onChangeText={handleAmountChange}
                  onBlur={handleAmountBlur}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(6, 78, 59, 0.3)'}
                  selectTextOnFocus
                  accessibilityLabel={`Settlement amount in ${getCurrencySymbol(settlementCurrency)}`}
                  accessibilityHint={settleableTotal ? `Enter up to ${formatCurrency(maxAmount, settlementCurrency)}` : undefined}
                  maxFontSizeMultiplier={1.4}
                />
              </View>
            </View>

            {/* Quick Action Pills */}
            <View style={styles.quickSelectRow}>
              <TouchableOpacity
                onPress={() => handleQuickPercent(0.5)}
                disabled={!settleableTotal}
                accessibilityState={{ disabled: !settleableTotal }}
                style={[styles.quickSelectButton, { backgroundColor: settle.pillBackground, opacity: settleableTotal ? 1 : 0.45 }]}>
                <Text style={[styles.quickSelectText, { color: isDark ? '#dae2fd' : colors.text }]}>50%</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleQuickPercent(1.0)}
                disabled={!settleableTotal}
                accessibilityState={{ disabled: !settleableTotal }}
                style={[styles.quickSelectButton, { backgroundColor: settle.pillBackground, opacity: settleableTotal ? 1 : 0.45 }]}>
                <Text style={[styles.quickSelectText, { color: isDark ? '#dae2fd' : colors.text }]}>Full Balance</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirmation Text */}
          <ThemedText
            style={[styles.helperText, { color: isDark ? '#bbcabf' : colors.textSecondary }]}
          >
            {isZeroNet
              ? 'This moves outstanding group scopes into the friendship balance and records the relationship as cleared. '
              : settleableTotal
              ? `This records that ${isOwed ? `${friend.name} paid you ` : `you paid ${friend.name} `}`
              : 'Choose one currency with an outstanding balance before settling.'}
            <Text style={[styles.helperBoldAmount, { color: isDark ? '#dae2fd' : colors.text }]}>
              {formatCurrency(amountNum, settleableTotal?.currency ?? zeroNetCurrency)}
            </Text>
            {isZeroNet ? '' : ' to settle up.'}
          </ThemedText>

          {allocationPreview && (allocationPreview.allocations.length > 0 || allocationPreview.transfers.length > 0) && (
            <View style={[styles.previewCard, { backgroundColor: settle.cardBackground, borderColor: settle.cardBorder }]}>
              <ThemedText style={[styles.previewTitle, { color: colors.text }]}>Settlement preview</ThemedText>
              {allocationPreview.allocations.map((allocation, index) => (
                <View key={`allocation-${allocation.groupId ?? 'direct'}-${index}`} style={styles.previewRow}>
                  <ThemedText style={[styles.previewLabel, { color: colors.textSecondary }]}>
                    {allocation.groupId ? relationship?.groupBalances.find(group => group.groupId === allocation.groupId)?.groupName ?? 'Group' : 'Direct'}
                  </ThemedText>
                  <ThemedText style={[styles.previewValue, { color: colors.text }]}>
                    {formatCurrency(allocation.amount, allocation.currency)} cash
                  </ThemedText>
                </View>
              ))}
              {allocationPreview.transfers.map(transfer => (
                <View key={`transfer-${transfer.groupId}`} style={styles.previewRow}>
                  <ThemedText style={[styles.previewLabel, { color: colors.textSecondary }]}>
                    {relationship?.groupBalances.find(group => group.groupId === transfer.groupId)?.groupName ?? 'Group'}
                  </ThemedText>
                  <ThemedText style={[styles.previewValue, { color: colors.text }]}>
                    {formatCurrency(Math.abs(transfer.signedGroupBalanceDelta), transfer.currency)} internal offset
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
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
              <Text style={[styles.submitButtonText, { color: isDark ? '#003824' : '#ffffff' }]}>{isZeroNet ? 'Clear Balances' : 'Record Payment'}</Text>
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
    gap: 10,
    width: '100%',
    height: '100%',
  },
  currency: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlignVertical: 'center',
  },
  input: {
    fontSize: 48,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    width: 160,
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
  previewCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewLabel: {
    flex: 1,
    fontSize: 14,
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
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
