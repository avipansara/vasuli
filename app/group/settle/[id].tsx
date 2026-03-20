import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { LoadingState } from '@/components/ui/loading-state';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { activityService } from '@/services/activity-service';
import { calculateBalances, groupService, settlementService, userService } from '@/services/api';
import type { Group, GroupMember, User } from '@/types/database';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

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
  const { colors, isDark } = useThemeColors();
  const balance = item.balance;
  const owesYou = balance < 0;
  const youOwe = balance > 0;

  return (
    <TouchableOpacity
      onPress={() => onSelect(item)}
      style={[
        styles.memberCard,
        isSelected && {
          borderColor: isDark ? '#2DD4BF' : colors.tint,
          borderWidth: 2,
        },
      ]}>
      <BlurView
        intensity={isDark ? 20 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.memberContent}>
        <View style={styles.memberLeft}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: isDark
                  ? 'rgba(45, 212, 191, 0.15)'
                  : 'rgba(34, 197, 94, 0.1)',
              },
            ]}>
            <ThemedText
              style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
              {item.user?.name?.charAt(0).toUpperCase() || 'U'}
            </ThemedText>
          </View>
          <View style={styles.memberInfo}>
            <ThemedText style={[styles.memberName, !isDark && { color: colors.text }]}>
              {item.user?.name || 'Unknown'}
            </ThemedText>
            {balance !== 0 && (
              <ThemedText
                style={[
                  styles.balanceText,
                  {
                    color: owesYou
                      ? '#22C55E'
                      : youOwe
                        ? '#EF4444'
                        : isDark
                          ? '#9CA3AF'
                          : colors.textSecondary,
                  },
                ]}>
                {owesYou
                  ? `Owes you $${Math.abs(balance).toFixed(2)}`
                  : youOwe
                    ? `You owe $${Math.abs(balance).toFixed(2)}`
                    : 'Settled up'}
              </ThemedText>
            )}
          </View>
        </View>
        {isSelected && (
          <IconSymbol size={24} name="checkmark.circle.fill" color={isDark ? '#2DD4BF' : colors.tint} />
        )}
      </View>
    </TouchableOpacity>
  );
}, areSettleMemberRowEqual);

export default function GroupSettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { gradients, colors, isDark } = useThemeColors();
  const currentUserId = user?.id || '';

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<MemberWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<MemberWithBalance | null>(null);
  const [amount, setAmount] = useState('');
  const [settling, setSettling] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load group
      const groupData = await groupService.getById(id);
      if (!groupData) {
        Alert.alert('Error', 'Group not found');
        router.back();
        return;
      }
      setGroup(groupData);

      // Load members
      const groupMembers = await groupService.getMembers(id);

      // Load user details for each member
      const membersWithUsers = await Promise.all(
        groupMembers.map(async (member) => {
          const userData = await userService.getById(member.userId);
          return { ...member, user: userData };
        })
      );

      // Calculate balances
      const balances = await calculateBalances(id);

      // Combine members with balances, excluding current user
      const membersWithBalances = membersWithUsers
        .filter(m => m.userId !== currentUserId)
        .map(member => ({
          ...member,
          user: member.user || undefined,
          balance: balances.get(member.userId) || 0,
        }));

      setMembers(membersWithBalances);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load group data');
    } finally {
      setLoading(false);
    }
  }, [id, currentUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

    try {
      setSettling(true);

      // Determine payer/receiver based on balance direction
      // If balance < 0 (They owe), then 'from' = Them, 'to' = Me
      // If balance > 0 (I owe), then 'from' = Me, 'to' = Them
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

      // Log activity
      if (group && user && selectedMember.user) {
        await activityService.logSettlementCreated({
          settlementId: settlement.id,
          fromUserId,
          fromUserName: isReceiving ? selectedMember.user.name : user.name,
          toUserName: isReceiving ? user.name : selectedMember.user.name,
          amount: amountNum,
          groupId: id,
          groupName: group.name,
        });
      }

      Alert.alert('Success', `Settled $${amountNum.toFixed(2)} with ${selectedMember.user?.name}`);
      router.back();
    } catch (error) {
      console.error('Error settling up:', error);
      Alert.alert('Error', 'Failed to record settlement');
    } finally {
      setSettling(false);
    }
  }

  const handleSelectMember = useCallback((item: MemberWithBalance) => {
    setSelectedMember(item);
    const balance = item.balance;
    if (Math.abs(balance) > 0) {
      setAmount(Math.abs(balance).toFixed(2));
    } else {
      setAmount('');
    }
  }, []);

  const renderMember = useCallback(
    ({ item }: { item: MemberWithBalance }) => (
      <SettleMemberRow
        item={item}
        isSelected={selectedMember?.userId === item.userId}
        onSelect={handleSelectMember}
      />
    ),
    [selectedMember?.userId, handleSelectMember]
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.container}>
          <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
          <LoadingState message="Loading members..." />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

        <NavigationHeader title="Settle Up" onBack={() => router.back()} />

        <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.content}>
              {/* Group Info */}
              <View style={styles.groupInfo}>
                <ThemedText style={[styles.groupLabel, !isDark && { color: colors.textSecondary }]}>
                  Settling in
                </ThemedText>
                <ThemedText type="subtitle" style={[styles.groupName, !isDark && { color: colors.text }]}>
                  {group?.name}
                </ThemedText>
              </View>

              {/* Amount Input - Hero Style matching add-expense */}
              <View style={styles.amountSection}>
                <ThemedText style={[styles.amountLabel, !isDark && { color: colors.textSecondary }]}>
                  How much?
                </ThemedText>
                <View style={styles.amountInputRow}>
                  <Text style={[styles.currencySymbol, { color: isDark ? '#2DD4BF' : colors.tint }]}>$</Text>
                  <TextInput
                    style={[styles.amountInput, { color: isDark ? '#fff' : colors.text }]}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
              </View>

              {/* Members List */}
              <View style={styles.membersSection}>
                <ThemedText style={[styles.sectionLabel, !isDark && { color: colors.textSecondary }]}>
                  Select member to settle with
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
                        color={isDark ? '#6B7280' : '#9CA3AF'}
                      />
                      <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
                        No other members in this group
                      </ThemedText>
                    </View>
                  }
                />
              </View>

              {/* Settle Button */}
              <TouchableOpacity
                onPress={handleSettle}
                disabled={!selectedMember || !amount.trim() || settling}
                style={[
                  styles.settleButton,
                  {
                    backgroundColor:
                      selectedMember && amount.trim() && !settling
                        ? isDark
                          ? '#2DD4BF'
                          : '#22C55E'
                        : isDark
                          ? '#374151'
                          : '#E5E7EB',
                  },
                ]}>
                <ThemedText
                  style={[
                    styles.settleButtonText,
                    {
                      color:
                        selectedMember && amount.trim() && !settling
                          ? '#0A0A0F'
                          : isDark
                            ? '#9CA3AF'
                            : '#6B7280',
                    },
                  ]}>
                  {settling ? 'Settling...' : 'Record Settlement'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAwareScroll>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  content: {
    flex: 1,
  },
  groupInfo: {
    marginBottom: 24,
  },
  groupLabel: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  groupName: {
    fontSize: 24,
    fontWeight: '700',
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 24,
  },
  amountLabel: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 12,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '700',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '700',
    minWidth: 100,
    maxWidth: 250,
    padding: 0,
  },
  membersSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    marginBottom: 12,
  },
  membersList: {
    gap: 12,
  },
  memberCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
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
    fontSize: 14,
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
  settleButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 20 : 16,
  },
  settleButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
