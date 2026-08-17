import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { GenericSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { activityService } from '@/services/activity-service';
import { calculateBalances } from '@/services/balance-utils';
import type { GroupDetailReadModel } from '@/services/group-detail-read-model';
import { applySettlementToGroupReadModel } from '@/services/group-detail-read-model';
import { groupService } from '@/services/group-service';
import { queryKeys } from '@/services/query-keys';
import { settlementService } from '@/services/settlement-service';
import { userService } from '@/services/user-service';
import type { Group, GroupMember, User } from '@/types/database';
import {
  canSubmitGroupSettlement,
  getDefaultGroupSettleMember,
  getGroupSettleAmount,
  isSettleableGroupBalance,
} from '@/utils/group-settle-selection';
import { normalizeCurrencyInput } from '@/utils/validation';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useState } from 'react';
import {
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
  const { colors, settle, isDark } = useThemeColors();
  const balance = item.balance;
  const owesYou = balance < 0;
  const youOwe = balance > 0;
  const isSettleable = isSettleableGroupBalance(balance);

  const cardStyle = {
    backgroundColor: isSelected
      ? settle.selectedCardBackground
      : (isDark ? 'rgba(20, 35, 38, 0.95)' : '#FFFFFF'),
    borderRadius: 12,
    borderWidth: isSelected ? 0 : 1,
    borderColor: isSelected ? 'transparent' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(191, 201, 195, 0.3)'),
  };

  return (
    <TouchableOpacity
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`Select ${item.user?.name || 'member'} to settle $${Math.abs(item.balance).toFixed(2)}`}
      accessibilityState={{ selected: isSelected }}
      onPress={() => onSelect(item)}
      disabled={!isSettleable}
      style={[
        styles.memberCard,
        cardStyle,
        !isSettleable && styles.memberCardDisabled,
      ]}>
      <View style={styles.memberContent}>
        <View style={styles.memberLeft}>
          <View style={[styles.avatar, { backgroundColor: '#ffffff' }]}>
            <Text style={[styles.avatarText, { color: isSelected ? settle.accentText : colors.text }]}>
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
                      ? (isDark ? '#2DD4BF' : '#004F34')
                      : youOwe
                        ? (isDark ? '#F87171' : '#A83639')
                        : colors.textSecondary,
                  },
                ]}>
                {owesYou
                  ? `Owes you $${Math.abs(balance).toFixed(2)}`
                  : youOwe
                    ? `You owe $${Math.abs(balance).toFixed(2)}`
                    : 'Settled up'}
              </Text>
            )}
          </View>
        </View>
        {isSelected ? (
          <View style={[styles.checkCircle, { backgroundColor: settle.buttonBackground }]}>
            <IconSymbol size={14} name="checkmark" color="#ffffff" />
          </View>
        ) : (
          <View style={[styles.radioCircle, { borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#707974' }]} />
        )}
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

  const applyGroupDetail = useCallback((groupDetail: GroupDetailReadModel) => {
    const membersWithBalances = groupDetail.members
      .filter(member => member.userId !== currentUserId)
      .map(member => ({
        ...member,
        balance: groupDetail.balances.get(member.userId) || 0,
      }));
    const defaultMember = getDefaultGroupSettleMember(membersWithBalances);

    setGroup(groupDetail.group);
    setMembers(membersWithBalances);
    setSelectedMember(defaultMember);
    setAmount(defaultMember ? getGroupSettleAmount(defaultMember.balance) : '');
  }, [currentUserId]);

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
      const defaultMember = getDefaultGroupSettleMember(membersWithBalances);

      setMembers(membersWithBalances);
      setSelectedMember(defaultMember);
      setAmount(defaultMember ? getGroupSettleAmount(defaultMember.balance) : '');
    } catch (error) {
      console.error('Error loading data:', error);
      setLoadError(getFetchErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [applyGroupDetail, currentUserId, id, queryClient]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectMember = useCallback((member: MemberWithBalance) => {
    setSelectedMember(member);
    setAmount(getGroupSettleAmount(member.balance));
  }, []);

  const handleSettle = async () => {
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

    try {
      setSettling(true);

      const isReceiving = selectedMember.balance < 0;
      const fromUserId = isReceiving ? selectedMember.userId : currentUserId;
      const toUserId = isReceiving ? currentUserId : selectedMember.userId;

      const settlement = await settlementService.create({
        groupId: id,
        fromUserId,
        toUserId,
        amount: amountNum,
        currency: 'USD',
        date: Date.now(),
      });
      const groupDetailQueryKey = queryKeys.groups.detail(currentUserId, id);
      queryClient.setQueryData<GroupDetailReadModel | null>(
        groupDetailQueryKey,
        current => current ? applySettlementToGroupReadModel(current, settlement) : current
      );
      queryClient.invalidateQueries({ queryKey: groupDetailQueryKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.list(currentUserId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.home(currentUserId) });

      if (group && user && selectedMember.user) {
        try {
          await activityService.logSettlementCreated({
            settlementId: settlement.id,
            fromUserId,
            fromUserName: isReceiving ? selectedMember.user.name : user.name,
            toUserName: isReceiving ? user.name : selectedMember.user.name,
            amount: amountNum,
            groupId: id,
            groupName: group.name,
          });
        } catch {
          // Activity logging non-blocking
        }
      }

      Alert.alert('Success', `Settled $${amountNum.toFixed(2)} with ${selectedMember.user?.name}`);
      router.back();
    } catch (error) {
      console.error('Error settling up:', error);
      Alert.alert('Error', 'Failed to record settlement');
    } finally {
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
        <NavigationHeader title="Settle Up" onBack={() => router.back()} />
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
        <NavigationHeader title="Settle Up" onBack={() => router.back()} />
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <NavigationHeader title="Settle Up" onBack={() => router.back()} />

        <KeyboardAwareScroll
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            {/* Group Info */}
            <View style={styles.groupInfo}>
              <ThemedText style={[styles.groupLabel, { color: colors.textSecondary }]}>
                SETTLING IN
              </ThemedText>
              <ThemedText style={[styles.groupName, { color: colors.text }]}>
                {group?.name}
              </ThemedText>
            </View>

            {/* Amount Input - Hero Card */}
            <View style={[styles.amountSection, { backgroundColor: settle.heroBackground, borderColor: settle.heroBorder }]}>
              <View style={styles.amountInputRow}>
                <Text style={[styles.currencySymbol, { color: settle.accentText }]}>$</Text>
                <TextInput
                  style={[styles.amountInput, { color: settle.accentText }]}
                  value={amount}
                  onChangeText={(text) => setAmount(normalizeCurrencyInput(text))}
                  placeholder="0.00"
                  placeholderTextColor={isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(6, 78, 59, 0.3)'}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  maxFontSizeMultiplier={1.4}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
            </View>

            {/* Members List */}
            <View style={styles.membersSection}>
              <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                SELECT MEMBER TO SETTLE WITH
              </ThemedText>
              <FlatList
                data={members}
                renderItem={renderMember}
                keyExtractor={(item) => item.userId}
                contentContainerStyle={styles.membersList}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <IconSymbol
                      size={48}
                      name="person.2.slash"
                      color={colors.textSecondary}
                    />
                    <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                      No other members in this group
                    </ThemedText>
                  </View>
                }
              />
            </View>
          </View>
        </KeyboardAwareScroll>

        {/* Bottom Action Button */}
        <View style={[styles.bottomActionsContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            onPress={handleSettle}
            disabled={!canSubmitSettlement}
            style={[
              styles.settleButton,
              {
                backgroundColor: canSubmitSettlement
                  ? settle.buttonBackground
                  : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
              },
            ]}>
            <Text
              style={[
                styles.settleButtonText,
                {
                  color: canSubmitSettlement ? '#ffffff' : colors.textSecondary,
                },
              ]}>
              {settling ? 'Settling...' : 'Record Settlement'}
            </Text>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  content: {
    gap: 24,
  },
  groupInfo: {
    marginTop: 4,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  groupName: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    marginTop: 2,
  },
  amountSection: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    height: 110,
    paddingHorizontal: 24,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 36,
    fontWeight: '800',
    minWidth: 60,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
    textAlign: 'center',
  },
  membersSection: {
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  membersList: {
    gap: 12,
  },
  memberCard: {
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  memberCardDisabled: {
    opacity: 0.55,
  },
  memberContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  bottomActionsContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  settleButton: {
    width: '100%',
    height: 56,
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
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
