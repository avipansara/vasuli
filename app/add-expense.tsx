import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { activityService } from '@/services/activity-service';
import { expenseService, groupService, initDatabase, userService } from '@/services/api';
import type { Group, User } from '@/types/database';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

enum SplitType {
  GROUP = 'group',
  FRIENDS = 'friends',
}

enum SplitMethod {
  EQUAL = 'equal',
  UNEQUAL = 'unequal',
  PERCENTAGE = 'percentage',
  SHARES = 'shares',
}

const SPLIT_METHODS = [
  { id: SplitMethod.EQUAL, label: 'Equal', icon: 'divide.circle' as const, description: 'Split evenly' },
  { id: SplitMethod.UNEQUAL, label: 'Unequal', icon: 'plusminus' as const, description: 'Enter amounts' },
  { id: SplitMethod.PERCENTAGE, label: 'Percentage', icon: 'percent' as const, description: 'By percent' },
  { id: SplitMethod.SHARES, label: 'Shares', icon: 'chart.pie' as const, description: 'By shares' },
];

export default function AddExpenseScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const { groupId: preselectedGroupId, friendId: preselectedFriendId } = useLocalSearchParams<{ groupId?: string; friendId?: string }>();
  const currentUserId = user?.id || '';

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitType, setSplitType] = useState<SplitType>(preselectedFriendId ? SplitType.FRIENDS : (preselectedGroupId ? SplitType.GROUP : SplitType.GROUP));
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(preselectedGroupId || '');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>(preselectedFriendId ? [preselectedFriendId] : []);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(SplitMethod.EQUAL);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [customPercentages, setCustomPercentages] = useState<Record<string, string>>({});
  const [customShares, setCustomShares] = useState<Record<string, string>>({});

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Input refs for focus management
  const amountInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadData();
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
  }, []);

  useEffect(() => {
    async function loadGroupMembers() {
      if (selectedGroupId) {
        try {
          const members = await groupService.getMembers(selectedGroupId);
          setGroupMembers(members.map((m: { userId: string }) => m.userId));
        } catch (error) {
          console.error('Error loading group members:', error);
        }
      } else {
        setGroupMembers([]);
      }
    }
    loadGroupMembers();
  }, [selectedGroupId]);

  async function loadData() {
    if (!currentUserId) return;
    try {
      await initDatabase();
      const [allGroups, userFriends] = await Promise.all([
        groupService.getUserGroups(currentUserId),
        userService.getUserFriends(currentUserId),
      ]);
      setGroups(allGroups);
      setFriends(userFriends);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setDataLoading(false);
    }
  }

  const toggleFriend = (friendId: string) => {
    if (selectedFriendIds.includes(friendId)) {
      setSelectedFriendIds(selectedFriendIds.filter(id => id !== friendId));
    } else {
      setSelectedFriendIds([...selectedFriendIds, friendId]);
    }
  };

  const isValid = description.trim() && amount.trim() && parseFloat(amount) > 0 &&
    (splitType === SplitType.GROUP ? selectedGroupId : selectedFriendIds.length > 0);

  async function handleSubmit() {
    if (!isValid) return;

    setLoading(true);
    try {
      const amountNum = parseFloat(amount);

      if (splitType === SplitType.GROUP) {
        const members = await groupService.getMembers(selectedGroupId);
        const splits = calculateSplits(members.map((m: { userId: string }) => m.userId), amountNum);
        
        if (!splits) {
          setLoading(false);
          return;
        }

        const expense = await expenseService.create(
          {
            groupId: selectedGroupId,
            description: description.trim(),
            amount: amountNum,
            currency: 'USD',
            paidBy: currentUserId,
            date: Date.now(),
          },
          splits
        );

        // Log activity
        const group = groups.find(g => g.id === selectedGroupId);
        await activityService.logExpenseCreated({
          expenseId: expense.id,
          userId: currentUserId,
          userName: user?.name || 'Someone',
          description: description.trim(),
          amount: amountNum,
          groupId: selectedGroupId,
          groupName: group?.name,
        });
      } else {
        const allParticipants = [currentUserId, ...selectedFriendIds];
        const splits = calculateSplits(allParticipants, amountNum);
        
        if (!splits) {
          setLoading(false);
          return;
        }

        const expense = await expenseService.create(
          {
            description: description.trim(),
            amount: amountNum,
            currency: 'USD',
            paidBy: currentUserId,
            date: Date.now(),
          },
          splits
        );

        // Log activity
        await activityService.logExpenseCreated({
          expenseId: expense.id,
          userId: currentUserId,
          userName: user?.name || 'Someone',
          description: description.trim(),
          amount: amountNum,
        });
      }

      router.back();
    } catch (error) {
      console.error('Error creating expense:', error);
      Alert.alert('Error', 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  }

  function calculateSplits(userIds: string[], totalAmount: number): { userId: string; amount: number; splitType: 'equal' | 'exact' | 'percentage' }[] | null {
    if (splitMethod === SplitMethod.EQUAL) {
      const splitAmount = totalAmount / userIds.length;
      return userIds.map(userId => ({
        userId,
        amount: splitAmount,
        splitType: 'equal' as const,
      }));
    }

    if (splitMethod === SplitMethod.UNEQUAL) {
      const splits = userIds.map(userId => {
        const customAmount = parseFloat(customAmounts[userId] || '0');
        return { userId, amount: customAmount, splitType: 'exact' as const };
      });

      const total = splits.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(total - totalAmount) > 0.01) {
        Alert.alert('Invalid Split', `Amounts must add up to $${totalAmount.toFixed(2)}. Current total: $${total.toFixed(2)}`);
        return null;
      }

      return splits;
    }

    if (splitMethod === SplitMethod.PERCENTAGE) {
      const percentages = userIds.map(userId => parseFloat(customPercentages[userId] || '0'));
      const totalPercentage = percentages.reduce((sum, p) => sum + p, 0);

      if (Math.abs(totalPercentage - 100) > 0.01) {
        Alert.alert('Invalid Split', `Percentages must add up to 100%. Current total: ${totalPercentage.toFixed(1)}%`);
        return null;
      }

      return userIds.map((userId, index) => ({
        userId,
        amount: (totalAmount * percentages[index]) / 100,
        splitType: 'percentage' as const,
      }));
    }

    if (splitMethod === SplitMethod.SHARES) {
      const shares = userIds.map(userId => parseFloat(customShares[userId] || '0'));
      const totalShares = shares.reduce((sum, s) => sum + s, 0);

      if (totalShares === 0) {
        Alert.alert('Invalid Split', 'Please enter at least one share');
        return null;
      }

      return userIds.map((userId, index) => ({
        userId,
        amount: (totalAmount * shares[index]) / totalShares,
        splitType: 'exact' as const,
      }));
    }

    return null;
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      <NavigationHeader 
        title="Add Expense" 
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!isValid || loading}
            style={[
              styles.headerButton,
              {
                backgroundColor: isValid && !loading ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? '#374151' : '#E5E7EB'),
              },
            ]}>
            {loading ? (
              <ThemedText style={[styles.headerButtonText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>...</ThemedText>
            ) : (
              <ThemedText style={[styles.headerButtonText, { color: isValid ? '#0A0A0F' : (isDark ? '#9CA3AF' : '#6B7280') }]}>
                Add
              </ThemedText>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Amount Input - Hero Style */}
            <View style={styles.amountSection}>
              <ThemedText style={[styles.amountLabel, !isDark && { color: colors.textSecondary }]}>
                How much?
              </ThemedText>
              <View style={styles.amountInputRow}>
                <Text style={[styles.currencySymbol, { color: isDark ? '#2DD4BF' : colors.tint }]}>$</Text>
                <TextInput
                  ref={amountInputRef}
                  style={[styles.amountInput, { color: isDark ? '#fff' : colors.text }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => descriptionInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            {/* Description Input */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                What&apos;s it for?
              </ThemedText>
              <View style={[styles.inputContainer, {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              }]}>
                <IconSymbol name="doc.text" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
                <TextInput
                  ref={descriptionInputRef}
                  style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Dinner, Groceries, Uber..."
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
            </View>

            {/* Split Type Toggle - only show if not pre-selected from friend/group screen */}
            {!preselectedGroupId && !preselectedFriendId && (
              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                  Split with
                </ThemedText>
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                      splitType === SplitType.GROUP && styles.toggleButtonActive,
                      !isDark && splitType !== SplitType.GROUP && { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                    onPress={() => setSplitType(SplitType.GROUP)}>
                    <IconSymbol
                      name="person.3.fill"
                      size={18}
                      color={splitType === SplitType.GROUP ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                    />
                    <ThemedText style={[
                      styles.toggleText,
                      splitType === SplitType.GROUP && styles.toggleTextActive,
                      !isDark && splitType !== SplitType.GROUP && { color: colors.text },
                    ]}>
                      Group
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                      splitType === SplitType.FRIENDS && styles.toggleButtonActive,
                      !isDark && splitType !== SplitType.FRIENDS && { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                    onPress={() => setSplitType(SplitType.FRIENDS)}>
                    <IconSymbol
                      name="person.2.fill"
                      size={18}
                      color={splitType === SplitType.FRIENDS ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                    />
                    <ThemedText style={[
                      styles.toggleText,
                      splitType === SplitType.FRIENDS && styles.toggleTextActive,
                      !isDark && splitType !== SplitType.FRIENDS && { color: colors.text },
                    ]}>
                      Friends
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Split Method Selection */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                How to split?
              </ThemedText>
              <View style={styles.splitMethodContainer}>
                {SPLIT_METHODS.map(method => {
                  const isActive = splitMethod === method.id;
                  return (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.splitMethodButton,
                        isActive && styles.splitMethodButtonActive,
                        {
                          backgroundColor: isActive
                            ? (isDark ? '#2DD4BF' : colors.tint)
                            : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                          borderColor: isActive
                            ? (isDark ? '#2DD4BF' : colors.tint)
                            : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                        },
                      ]}
                      onPress={() => setSplitMethod(method.id)}>
                      <IconSymbol
                        name={method.icon}
                        size={18}
                        color={isActive ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                      />
                      <ThemedText style={[
                        styles.splitMethodText,
                        isActive && styles.splitMethodTextActive,
                        !isDark && !isActive && { color: colors.text },
                      ]}>
                        {method.label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selection List */}
            <View style={styles.selectionSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                {splitType === SplitType.GROUP ? 'Select a group' : 'Select friends'}
              </ThemedText>

              {dataLoading ? (
                <View style={styles.loadingContainer}>
                  <ThemedText style={{ opacity: 0.6 }}>Loading...</ThemedText>
                </View>
              ) : splitType === SplitType.GROUP ? (
                <View style={styles.optionsList}>
                  {groups.length === 0 ? (
                    <View style={styles.emptyState}>
                      <IconSymbol name="person.3" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                      <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
                        No groups yet
                      </ThemedText>
                    </View>
                  ) : (
                    groups.map(group => {
                      // If preselected from group screen, only show that group and make it non-interactive
                      if (preselectedGroupId && group.id !== preselectedGroupId) return null;
                      
                      return (
                      <TouchableOpacity
                        key={group.id}
                        style={[
                          styles.optionCard,
                          selectedGroupId === group.id && styles.optionCardSelected,
                          {
                            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                            borderColor: selectedGroupId === group.id
                              ? (isDark ? '#2DD4BF' : colors.tint)
                              : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                          },
                        ]}
                        onPress={() => !preselectedGroupId && setSelectedGroupId(group.id)}
                        disabled={!!preselectedGroupId}>
                        <View style={[styles.optionIcon, {
                          backgroundColor: selectedGroupId === group.id
                            ? (isDark ? '#2DD4BF' : colors.tint)
                            : (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)'),
                        }]}>
                          <IconSymbol
                            name="person.3.fill"
                            size={16}
                            color={selectedGroupId === group.id ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                          />
                        </View>
                        <ThemedText style={[styles.optionText, !isDark && { color: colors.text }]}>
                          {group.name}
                        </ThemedText>
                        {selectedGroupId === group.id && (
                          <IconSymbol name="checkmark.circle.fill" size={22} color={isDark ? '#2DD4BF' : colors.tint} />
                        )}
                      </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              ) : (
                <View style={styles.optionsList}>
                  {friends.length === 0 ? (
                    <View style={styles.emptyState}>
                      <IconSymbol name="person.2" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                      <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
                        No friends yet
                      </ThemedText>
                    </View>
                  ) : (
                    friends.map(friend => {
                      // If preselected from friend screen, only show that friend and make it non-interactive
                      if (preselectedFriendId && friend.id !== preselectedFriendId) return null;
                      
                      const isSelected = selectedFriendIds.includes(friend.id);
                      return (
                        <TouchableOpacity
                          key={friend.id}
                          style={[
                            styles.optionCard,
                            isSelected && styles.optionCardSelected,
                            {
                              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                              borderColor: isSelected
                                ? (isDark ? '#2DD4BF' : colors.tint)
                                : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                            },
                          ]}
                          onPress={() => !preselectedFriendId && toggleFriend(friend.id)}
                          disabled={!!preselectedFriendId}>
                          <View style={[styles.optionAvatar, {
                            backgroundColor: isSelected
                              ? (isDark ? '#2DD4BF' : colors.tint)
                              : (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)'),
                          }]}>
                            <ThemedText style={[styles.avatarText, {
                              color: isSelected ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint),
                            }]}>
                              {friend.name.charAt(0).toUpperCase()}
                            </ThemedText>
                          </View>
                          <ThemedText style={[styles.optionText, !isDark && { color: colors.text }]}>
                            {friend.name}
                          </ThemedText>
                          {isSelected && (
                            <IconSymbol name="checkmark.circle.fill" size={22} color={isDark ? '#2DD4BF' : colors.tint} />
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              )}
            </View>

            {/* Custom Split Inputs - Show when non-equal split is selected */}
            {splitMethod !== SplitMethod.EQUAL && (splitType === SplitType.FRIENDS ? selectedFriendIds.length > 0 : selectedGroupId) && amount && parseFloat(amount) > 0 && (() => {
              // Calculate remaining balance for unequal split
              const totalAmount = parseFloat(amount);
              const userIds = splitType === SplitType.GROUP ? groupMembers : [currentUserId, ...selectedFriendIds];
              const allocatedAmount = userIds.reduce((sum, userId) => {
                const userAmount = parseFloat(customAmounts[userId] || '0');
                return sum + userAmount;
              }, 0);
              const remaining = totalAmount - allocatedAmount;
              const isBalanced = Math.abs(remaining) < 0.01;

              return (
              <View style={styles.customSplitSection}>
                <View style={styles.customSplitHeader}>
                  <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                    {splitMethod === SplitMethod.UNEQUAL ? 'Enter amounts' : splitMethod === SplitMethod.PERCENTAGE ? 'Enter percentages' : 'Enter shares'}
                  </ThemedText>
                  {splitMethod === SplitMethod.UNEQUAL && (
                    <View style={[styles.remainingBadge, {
                      backgroundColor: isBalanced 
                        ? (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)')
                        : remaining > 0
                          ? (isDark ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.2)')
                          : (isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                    }]}>
                      <ThemedText style={[styles.remainingText, {
                        color: isBalanced
                          ? (isDark ? '#2DD4BF' : '#22c55e')
                          : remaining > 0
                            ? (isDark ? '#fbbf24' : '#f59e0b')
                            : (isDark ? '#ef4444' : '#dc2626'),
                      }]}>
                        {isBalanced ? '✓ Balanced' : `${remaining > 0 ? 'Remaining' : 'Over'}: $${Math.abs(remaining).toFixed(2)}`}
                      </ThemedText>
                    </View>
                  )}
                </View>
                
                {/* Current User */}
                <View style={[styles.customSplitCard, {
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                  borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                }]}>
                  <View style={[styles.customSplitAvatar, {
                    backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                  }]}>
                    <ThemedText style={{ color: isDark ? '#2DD4BF' : colors.tint, fontWeight: '600' }}>
                      You
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                    You (payer)
                  </ThemedText>
                  <TextInput
                    style={[styles.customSplitInput, {
                      backgroundColor: isDark ? 'rgba(20, 35, 38, 0.8)' : 'rgba(255,255,255,0.9)',
                      color: isDark ? '#fff' : colors.text,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                    }]}
                    value={splitMethod === SplitMethod.UNEQUAL ? customAmounts[currentUserId] : splitMethod === SplitMethod.PERCENTAGE ? customPercentages[currentUserId] : customShares[currentUserId]}
                    onChangeText={(text) => {
                      if (splitMethod === SplitMethod.UNEQUAL) setCustomAmounts(prev => ({ ...prev, [currentUserId]: text }));
                      else if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(prev => ({ ...prev, [currentUserId]: text }));
                      else setCustomShares(prev => ({ ...prev, [currentUserId]: text }));
                    }}
                    placeholder="0"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                    keyboardType="decimal-pad"
                  />
                  <ThemedText style={[styles.customSplitSuffix, !isDark && { color: colors.textSecondary }]}>
                    {splitMethod === SplitMethod.UNEQUAL ? '$' : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                  </ThemedText>
                </View>

                {/* Selected Friends */}
                {splitType === SplitType.FRIENDS && selectedFriendIds.map(friendId => {
                  const friend = friends.find(f => f.id === friendId);
                  if (!friend) return null;
                  return (
                    <View key={friendId} style={[styles.customSplitCard, {
                      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                      borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                    }]}>
                      <View style={[styles.customSplitAvatar, {
                        backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                      }]}>
                        <ThemedText style={{ color: isDark ? '#2DD4BF' : colors.tint, fontWeight: '600' }}>
                          {friend.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                        {friend.name}
                      </ThemedText>
                      <TextInput
                        style={[styles.customSplitInput, {
                          backgroundColor: isDark ? 'rgba(20, 35, 38, 0.8)' : 'rgba(255,255,255,0.9)',
                          color: isDark ? '#fff' : colors.text,
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                        }]}
                        value={splitMethod === SplitMethod.UNEQUAL ? customAmounts[friendId] : splitMethod === SplitMethod.PERCENTAGE ? customPercentages[friendId] : customShares[friendId]}
                        onChangeText={(text) => {
                          if (splitMethod === SplitMethod.UNEQUAL) setCustomAmounts(prev => ({ ...prev, [friendId]: text }));
                          else if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(prev => ({ ...prev, [friendId]: text }));
                          else setCustomShares(prev => ({ ...prev, [friendId]: text }));
                        }}
                        placeholder="0"
                        placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                        keyboardType="decimal-pad"
                      />
                      <ThemedText style={[styles.customSplitSuffix, !isDark && { color: colors.textSecondary }]}>
                        {splitMethod === SplitMethod.UNEQUAL ? '$' : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                      </ThemedText>
                    </View>
                  );
                })}

                {/* Group Members */}
                {splitType === SplitType.GROUP && groupMembers.filter(memberId => memberId !== currentUserId).map(memberId => {
                  const member = friends.find(f => f.id === memberId);
                  if (!member) return null;
                  return (
                    <View key={memberId} style={[styles.customSplitCard, {
                      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                      borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                    }]}>
                      <View style={[styles.customSplitAvatar, {
                        backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                      }]}>
                        <ThemedText style={{ color: isDark ? '#2DD4BF' : colors.tint, fontWeight: '600' }}>
                          {member.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                        {member.name}
                      </ThemedText>
                      <TextInput
                        style={[styles.customSplitInput, {
                          backgroundColor: isDark ? 'rgba(20, 35, 38, 0.8)' : 'rgba(255,255,255,0.9)',
                          color: isDark ? '#fff' : colors.text,
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                        }]}
                        value={splitMethod === SplitMethod.UNEQUAL ? customAmounts[memberId] : splitMethod === SplitMethod.PERCENTAGE ? customPercentages[memberId] : customShares[memberId]}
                        onChangeText={(text) => {
                          if (splitMethod === SplitMethod.UNEQUAL) setCustomAmounts(prev => ({ ...prev, [memberId]: text }));
                          else if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(prev => ({ ...prev, [memberId]: text }));
                          else setCustomShares(prev => ({ ...prev, [memberId]: text }));
                        }}
                        placeholder="0"
                        placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                        keyboardType="decimal-pad"
                      />
                      <ThemedText style={[styles.customSplitSuffix, !isDark && { color: colors.textSecondary }]}>
                        {splitMethod === SplitMethod.UNEQUAL ? '$' : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
              );
            })()}

            {/* Split Preview */}
            {isValid && (
              <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={styles.previewCard}>
                <View style={[styles.previewContent, !isDark && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
                  <IconSymbol name="divide.circle" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
                  <ThemedText style={[styles.previewText, !isDark && { color: colors.textSecondary }]}>
                    {splitMethod === SplitMethod.EQUAL 
                      ? `Split equally: $${(parseFloat(amount) / (splitType === SplitType.GROUP ? groupMembers.length : selectedFriendIds.length + 1)).toFixed(2)} each`
                      : splitMethod === SplitMethod.UNEQUAL
                        ? 'Custom amounts per person'
                        : splitMethod === SplitMethod.PERCENTAGE
                          ? 'Split by percentage'
                          : 'Split by shares'}
                  </ThemedText>
                </View>
              </BlurView>
            )}
        </Animated.View>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 44,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  content: {
    flex: 1,
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
    minWidth: 120,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    opacity: 0.8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  toggleButtonActive: {
    backgroundColor: '#2DD4BF',
    borderColor: '#2DD4BF',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  toggleTextActive: {
    color: '#0A0A0F',
  },
  splitMethodContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  splitMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: '22%',
  },
  splitMethodButtonActive: {
    borderWidth: 1.5,
  },
  splitMethodText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  splitMethodTextActive: {
    color: '#0A0A0F',
  },
  customSplitSection: {
    marginBottom: 16,
  },
  customSplitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  remainingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  remainingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customSplitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  customSplitAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customSplitName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  customSplitInput: {
    width: 80,
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  customSplitSuffix: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  selectionSection: {
    marginBottom: 24,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 14,
  },
  optionCardSelected: {
    borderWidth: 2,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
  },
  previewCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
  },
  previewContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
  },
  previewText: {
    fontSize: 14,
    opacity: 0.8,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
