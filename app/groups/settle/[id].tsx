import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { GenericSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { calculateBalances } from '@/services/balance-utils';
import type { GroupDetailReadModel } from '@/services/group-detail-read-model';
import { friendDetailModule } from '@/services/friend-detail-module';
import { commitGroupSettlement } from '@/services/group-settlement-commit';
import { groupPairTotalsService, type GroupPairTotal } from '@/services/group-pair-totals-service';
import { groupService } from '@/services/group-service';
import { queryKeys } from '@/services/query-keys';
import { CombinedSettlementError, createPaymentIntentId } from '@/services/settlement-service';
import { userService } from '@/services/user-service';
import type { Group, GroupMember, User } from '@/types/database';
import {
  canSubmitGroupSettlement,
  getDefaultGroupSettleMember,
  getGroupSettleAmount,
  isSettleableGroupBalance,
} from '@/utils/group-settle-selection';
import { formatCurrencyInput, normalizeCurrencyInput } from '@/utils/validation';
import { formatCurrency, getCurrencySymbol, getPreferredCurrency } from '@/utils/currency';
import { toSettleableBalance } from '@/utils/group-settle-pairs';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MemberWithBalance extends GroupMember {
  user?: User;
  balance: number;
}

interface SettleMemberRowProps {
  item: MemberWithBalance;
  isSelected: boolean;
  onSelect: (item: MemberWithBalance) => void;
}

function areSettleMemberRowEqual(prev: SettleMemberRowProps, next: SettleMemberRowProps): boolean {
  return (
    prev.onSelect === next.onSelect &&
    prev.isSelected === next.isSelected &&
    prev.item.userId === next.item.userId &&
    prev.item.balance === next.item.balance &&
    prev.item.user?.name === next.item.user?.name
  );
}

const SettleMemberRow = memo(function SettleMemberRow({ item, isSelected, onSelect }: SettleMemberRowProps) {
  const { colors, settle } = useThemeColors();
  const balance = item.balance;
  const owesYou = balance < 0;
  const youOwe = balance > 0;
  const isSettleable = isSettleableGroupBalance(balance);

  return (
    <TouchableOpacity
      accessible={true}
      accessibilityRole="radio"
      accessibilityLabel={`Select ${item.user?.name || 'member'} to settle ${formatCurrency(Math.abs(item.balance))}`}
      accessibilityState={{ selected: isSelected, disabled: !isSettleable }}
      onPress={() => onSelect(item)}
      disabled={!isSettleable}
      style={[
        styles.memberCard,
        {
          backgroundColor: isSelected ? settle.selectedCardBackground : settle.cardBackground,
          borderColor: isSelected ? settle.selectedCardBorder : settle.cardBorder,
        },
        !isSettleable && styles.memberCardDisabled,
      ]}>
      <View style={styles.memberContent}>
        <View style={styles.memberLeft}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: isSelected
                  ? settle.avatarSelectedBackground
                  : settle.avatarUnselectedBackground,
              },
            ]}>
            <Text style={[styles.avatarText, { color: isSelected ? settle.avatarText : colors.text }]}>
              {item.user?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={styles.memberInfo}>
            <Text style={[styles.memberName, { color: isSelected ? settle.accentText : colors.text }]}>
              {item.user?.name || 'Unknown'}
            </Text>
            {balance !== 0 && (
              <Text
                style={[
                  styles.balanceText,
                  {
                    color: owesYou
                      ? settle.positiveText
                      : youOwe
                        ? settle.negativeText
                        : colors.textSecondary,
                  },
                ]}>
                 {owesYou
                  ? `Owes you ${formatCurrency(Math.abs(balance))}`
                  : youOwe
                    ? `You owe ${formatCurrency(Math.abs(balance))}`
                    : 'Settled up'}
              </Text>
            )}
          </View>
        </View>
        <View
          style={[
            styles.radioCircle,
            { borderColor: isSelected ? settle.accentText : settle.unselectedBorder },
          ]}
        >
          {isSelected ? <View style={[styles.radioDot, { backgroundColor: settle.accentText }]} /> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}, areSettleMemberRowEqual);

export default function GroupSettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, settle, isDark } = useThemeColors();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<MemberWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberWithBalance | null>(null);
  const [amount, setAmount] = useState('');
  const [settling, setSettling] = useState(false);
  // ADR-0001 ticket 03 corrective: one payment intent per submission chain so
  // retried taps return the original operation receipt (`reused: true`) instead
  // of recording a duplicate group payment. Cleared only after success.
  const paymentIntentIdRef = useRef<string | null>(null);
  const settlingRef = useRef(false);

  // Row balances are bilateral with the viewer (what the pair owes each
  // other), not global group nets. Falls back to global when pair totals
  // are unavailable (e.g. RPC not deployed yet).
  const applyBilateralBalances = useCallback((
    candidates: MemberWithBalance[],
    pairTotals: GroupPairTotal[],
  ): MemberWithBalance[] => {
    const currency = getPreferredCurrency();
    return candidates.map(member => ({
      ...member,
      balance: toSettleableBalance({
        pairTotals,
        memberUserId: member.userId,
        viewerUserId: currentUserId,
        preferredCurrency: currency,
        fallbackGlobalBalance: member.balance,
      }) ?? member.balance,
    }));
  }, [currentUserId]);

  const applyGroupDetail = useCallback((groupDetail: GroupDetailReadModel) => {
    const membersWithBalances = groupDetail.members
      .filter(member => member.userId !== currentUserId)
      .map(member => ({
        ...member,
        balance: groupDetail.balances.get(member.userId) || 0,
      }));
    const cachedTotals = queryClient.getQueryData<GroupPairTotal[]>(
      queryKeys.groups.pairTotals(currentUserId, id),
    ) ?? [];
    const displayMembers = applyBilateralBalances(membersWithBalances, cachedTotals);
    const defaultMember = getDefaultGroupSettleMember(displayMembers);

    setGroup(groupDetail.group);
    setMembers(displayMembers);
    setSelectedMember(defaultMember);
    setAmount(defaultMember ? getGroupSettleAmount(defaultMember.balance) : '');
  }, [currentUserId, id, queryClient, applyBilateralBalances]);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const groupDetailQueryKey = queryKeys.groups.detail(currentUserId, id);
      const cachedGroupDetail = queryClient.getQueryData<GroupDetailReadModel | null>(groupDetailQueryKey);

      if (cachedGroupDetail) {
        applyGroupDetail(cachedGroupDetail);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const groupData = await groupService.getById(id);
      if (!groupData) {
        Alert.alert('Error', 'Group not found');
        router.back();
        return;
      }
      setGroup(groupData);

      const groupMembers = await groupService.getMembers(id);

      const [memberUsers, balances] = await Promise.all([
        userService.getByIds(groupMembers.map(member => member.userId)),
        calculateBalances(id),
      ]);
      const usersById = new Map(memberUsers.map(user => [user.id, user]));
      const membersWithUsers = groupMembers.map(member => ({
        ...member,
        user: usersById.get(member.userId),
      }));

      const membersWithBalances = membersWithUsers
        .filter(m => m.userId !== currentUserId)
        .map(member => ({
          ...member,
          user: member.user || undefined,
          balance: balances.get(member.userId) || 0,
        }));
      let pairTotals: GroupPairTotal[] = [];
      try {
        pairTotals = await queryClient.fetchQuery({
          queryKey: queryKeys.groups.pairTotals(currentUserId, id),
          queryFn: () => groupPairTotalsService.getByGroup(id),
        });
      } catch {
        // Pre-RPC builds: fall back to global nets (previous behavior).
      }
      const displayMembers = applyBilateralBalances(membersWithBalances, pairTotals);
      const defaultMember = getDefaultGroupSettleMember(displayMembers);

      setMembers(displayMembers);
      setSelectedMember(defaultMember);
      setAmount(defaultMember ? getGroupSettleAmount(defaultMember.balance) : '');
    } catch (error) {
      console.error('Error loading data:', error);
      setLoadError(getFetchErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [applyGroupDetail, applyBilateralBalances, currentUserId, id, queryClient]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectMember = useCallback((member: MemberWithBalance) => {
    setSelectedMember(member);
    setAmount(getGroupSettleAmount(member.balance));
  }, []);

  const handleAmountChange = useCallback((text: string) => {
    setAmount(normalizeCurrencyInput(text));
  }, []);

  const handleAmountBlur = useCallback(() => {
    setAmount(current => formatCurrencyInput(current));
  }, []);

  const handleQuickPercent = useCallback((percent: number) => {
    if (!selectedMember) return;
    setAmount((Math.abs(selectedMember.balance) * percent).toFixed(2));
  }, [selectedMember]);

  const handleSettle = async () => {
    // Pending double-taps share one submission: the button disables via
    // canSubmitGroupSettlement, and this ref guard covers the state-update gap.
    if (settlingRef.current) return;
    if (!selectedMember) {
      Alert.alert('Error', 'Please select a member to settle with');
      return;
    }

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
    const maxCents = Math.round(Math.abs(selectedMember.balance) * 100);
    if (amountCents > maxCents) {
      Alert.alert('Error', 'Settlement amount cannot exceed the outstanding balance.');
      return;
    }
    if (!user) {
      Alert.alert('Error', 'Please sign in again to record a settlement.');
      return;
    }

    const currency = getPreferredCurrency();
    const isReceiving = selectedMember.balance < 0;
    const fromUserId = isReceiving ? selectedMember.userId : currentUserId;
    const toUserId = isReceiving ? currentUserId : selectedMember.userId;

    const paymentIntentId = paymentIntentIdRef.current ?? createPaymentIntentId();
    paymentIntentIdRef.current = paymentIntentId;

    try {
      settlingRef.current = true;
      setSettling(true);

      // The group-mode commit still validates the full relationship balance,
      // so load it through the authorized Friend read. Never guess it from a
      // group-local row or an unrelated balance.
      const friendDetail = await friendDetailModule.getDetail(currentUserId, selectedMember.userId);
      const expectedBalance = friendDetail?.relationship.totalsByCurrency
        .find(total => total.currency === currency)?.amount;
      if (friendDetail === null || expectedBalance === undefined || !Number.isFinite(expectedBalance)) {
        Alert.alert('Balance changed', 'Refresh and try again.', [
          { text: 'Refresh', onPress: () => { void loadData(); } },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }

      const friendUser = selectedMember.user;
      const receipt = await commitGroupSettlement({
        paymentIntentId,
        friendId: selectedMember.userId,
        groupId: id,
        amount: amountNum,
        currency,
        date: Date.now(),
        expectedBalance,
        fromUserId,
        toUserId,
        currentUserId,
        friend: {
          id: selectedMember.userId,
          name: friendUser?.name ?? 'Friend',
          isActive: true,
          createdAt: Date.now(),
        },
        currentUser: { id: currentUserId, name: user.name, isActive: true, createdAt: Date.now() },
        queryClient,
      });

      paymentIntentIdRef.current = null;
      if (receipt.reused) {
        Alert.alert('Already recorded', `Settled ${formatCurrency(amountNum)} with ${selectedMember.user?.name}`);
      } else {
        Alert.alert('Success', `Settled ${formatCurrency(amountNum)} with ${selectedMember.user?.name}`);
      }
      router.back();
    } catch (error) {
      console.error('Error settling up:', error);
      if (error instanceof CombinedSettlementError && error.code === 'stale_balance') {
        Alert.alert('Balance changed', 'Refresh and try again.', [
          { text: 'Refresh', onPress: () => { void loadData(); } },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      if (error instanceof CombinedSettlementError && error.code === 'unauthorized') {
        Alert.alert('Settlement unavailable', error.message);
        return;
      }
      if (error instanceof CombinedSettlementError && error.code === 'conflict') {
        Alert.alert('Already submitted', 'This payment was already submitted with different details. Refresh to see it.');
        return;
      }
      if (error instanceof CombinedSettlementError) {
        Alert.alert('Invalid settlement', error.message);
        return;
      }
      Alert.alert('Error', 'Failed to record settlement');
    } finally {
      settlingRef.current = false;
      setSettling(false);
    }
  };

  const renderMember = useCallback(
    ({ item }: { item: MemberWithBalance }) => (
      <SettleMemberRow
        item={item}
        isSelected={selectedMember?.userId === item.userId}
        onSelect={handleSelectMember}
      />
    ),
    [handleSelectMember, selectedMember?.userId]
  );

  const canSubmitSettlement = canSubmitGroupSettlement(selectedMember, amount, settling);

  if (loading && !group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />
        <View style={{ padding: 20 }}>
          <GenericSkeleton />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />
        <AsyncErrorState
          message={loadError}
          onRetry={() => void loadData()}
          title="Couldn't load group"
        />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { backgroundColor: settle.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="SETTLE UP" onBack={() => router.back()} />

        <KeyboardAwareScroll
          contentContainerStyle={styles.memberScrollContent}>
          <View
            style={[
              styles.groupCard,
              {
                backgroundColor: settle.cardBackground,
                borderColor: settle.cardBorder,
                shadowOpacity: isDark ? 0.32 : 0.12,
              },
            ]}
          >
            <ThemedText style={[styles.groupEyebrow, { color: settle.textSecondary }]}>Group</ThemedText>
            <ThemedText numberOfLines={2} style={[styles.groupName, { color: settle.textPrimary }]}>{group?.name}</ThemedText>
          </View>

          <View style={styles.membersSection}>
            <ThemedText style={[styles.sectionLabel, { color: settle.textSecondary }]}>Choose someone to settle with</ThemedText>
            <FlatList
              data={members}
              renderItem={renderMember}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={styles.membersList}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={[styles.emptyState, { backgroundColor: settle.cardBackground, borderColor: settle.cardBorder }]}>
                  <IconSymbol size={40} name="person.2.slash" color={settle.textSecondary} />
                  <ThemedText style={[styles.emptyText, { color: settle.textSecondary }]}>No other members in this group</ThemedText>
                </View>
              }
            />
          </View>

          <View style={styles.amountForm}>
            <ThemedText style={[styles.sectionLabel, { color: settle.textSecondary }]}>Amount to settle</ThemedText>
            <View style={[styles.amountSection, { backgroundColor: settle.heroBackground, borderColor: settle.heroBorder }]}>
              <View style={styles.amountInputRow}>
                <Text style={[styles.currencySymbol, { color: settle.accentText }]}>{getCurrencySymbol()}</Text>
                <TextInput
                  style={[styles.amountInput, { color: settle.accentText }]}
                  value={amount}
                  onChangeText={handleAmountChange}
                  onBlur={handleAmountBlur}
                  placeholder="0.00"
                  placeholderTextColor={settle.textSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                  accessibilityLabel={`Group settlement amount in ${getCurrencySymbol()}`}
                  accessibilityHint={selectedMember ? `Enter up to ${formatCurrency(Math.abs(selectedMember.balance))}` : undefined}
                  testID="group-settle-amount-input"
                  maxFontSizeMultiplier={1.4}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
            </View>

            <View style={styles.quickSelectRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Settle half the group balance"
                disabled={!selectedMember}
                onPress={() => handleQuickPercent(0.5)}
                style={[styles.quickSelectButton, { backgroundColor: settle.pillBackground, opacity: selectedMember ? 1 : 0.45 }]}
              >
                <Text style={[styles.quickSelectText, { color: settle.textPrimary }]}>50%</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Settle the full group balance"
                disabled={!selectedMember}
                onPress={() => handleQuickPercent(1)}
                style={[styles.quickSelectButton, { backgroundColor: settle.pillBackground, opacity: selectedMember ? 1 : 0.45 }]}
              >
                <Text style={[styles.quickSelectText, { color: settle.textPrimary }]}>Full Balance</Text>
              </TouchableOpacity>
            </View>
          </View>

          {selectedMember ? (
            <ThemedText style={[styles.helperText, { color: settle.textSecondary }]}>
              This records that {selectedMember.balance < 0 ? `${selectedMember.user?.name ?? 'this member'} paid you` : `you paid ${selectedMember.user?.name ?? 'this member'}`}{' '}
              <Text style={[styles.helperAmount, { color: settle.textPrimary }]}>{formatCurrency(Number.parseFloat(amount) || 0)}</Text> in {group?.name}.
            </ThemedText>
          ) : null}

          <View style={[styles.bottomActionsContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel settlement" onPress={() => router.back()} style={styles.cancelButton}>
              <Text style={[styles.cancelButtonText, { color: settle.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSettle}
              disabled={!canSubmitSettlement}
              accessibilityRole="button"
              accessibilityLabel="Record settlement"
              accessibilityState={{ disabled: !canSubmitSettlement }}
              testID="group-record-settlement-button"
              style={[
                styles.settleButton,
                {
                  backgroundColor: canSubmitSettlement
                    ? settle.buttonBackground
                    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                },
              ]}>
              {settling ? (
                <ActivityIndicator size="small" color={settle.buttonText} />
              ) : (
                <Text
                  style={[
                    styles.settleButtonText,
                    {
                      color: canSubmitSettlement ? settle.buttonText : settle.textSecondary,
                    },
                  ]}>
                  Record Settlement
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAwareScroll>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  memberScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 16,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  groupCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 5,
  },
  groupEyebrow: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  groupName: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
  },
  amountForm: { gap: 10 },
  amountSection: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    minHeight: 104,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '700',
  },
  amountInput: {
    fontSize: 40,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    width: '72%',
    maxWidth: 260,
    flexShrink: 1,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
    textAlign: 'left',
  },
  membersSection: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 4,
  },
  membersList: {
    gap: 8,
  },
  memberCard: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 72,
    justifyContent: 'center',
  },
  memberCardDisabled: {
    opacity: 0.55,
  },
  memberContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  balanceText: {
    fontSize: 13,
    fontWeight: '500',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  bottomActionsContainer: {
    gap: 4,
    alignItems: 'center',
  },
  cancelButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  settleButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#003527',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 3,
  },
  settleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  quickSelectRow: { flexDirection: 'row', gap: 10 },
  quickSelectButton: { flex: 1, minHeight: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  quickSelectText: { fontSize: 15, fontWeight: '600' },
  helperText: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
  helperAmount: { fontWeight: '700' },
});
