import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { activityService } from '@/services/activity-service';
import { expenseService, groupService, initDatabase, userService } from '@/services/api';
import type { Group, User } from '@/types/database';
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

export default function EditExpenseScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUserId = user?.id || '';

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitType, setSplitType] = useState<SplitType>(SplitType.GROUP);
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
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

  // Input refs
  const amountInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

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

  useEffect(() => {
    async function loadExpenseData() {
      try {
        await initDatabase();
        
        const expense = await expenseService.getById(id);
        if (!expense) {
          Alert.alert('Error', 'Expense not found');
          router.back();
          return;
        }

        setDescription(expense.description);
        setAmount(expense.amount.toString());
        
        if (expense.groupId) {
          setSplitType(SplitType.GROUP);
          setSelectedGroupId(expense.groupId);
        } else {
          setSplitType(SplitType.FRIENDS);
        }

        const [groupsData, userFriends, existingSplits] = await Promise.all([
          groupService.getUserGroups(user?.id || ''),
          userService.getUserFriends(currentUserId),
          expenseService.getSplits(id),
        ]);

        // Pre-select friends from existing splits (exclude current user)
        const splitFriendIds = existingSplits
          .map(split => split.userId)
          .filter(userId => userId !== currentUserId);
        setSelectedFriendIds(splitFriendIds);

        setGroups(groupsData);
        setFriends(userFriends);
        setDataLoading(false);

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
        console.error('Error loading expense:', error);
        Alert.alert('Error', 'Failed to load expense');
        router.back();
      }
    }
    
    loadExpenseData();
  }, [id]);

  const isValid = 
    description.trim().length > 0 &&
    amount.trim().length > 0 &&
    !isNaN(parseFloat(amount)) &&
    parseFloat(amount) > 0 &&
    (splitType === SplitType.GROUP ? selectedGroupId !== '' : selectedFriendIds.length > 0);

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
      const sharesData = userIds.map(userId => ({
        userId,
        shares: parseFloat(customShares[userId] || '0'),
      }));
      
      const totalShares = sharesData.reduce((sum, item) => sum + item.shares, 0);

      if (totalShares === 0) {
        Alert.alert('Invalid Split', 'Please enter at least one share');
        return null;
      }

      // Only include users with shares > 0
      return sharesData
        .filter(item => item.shares > 0)
        .map(item => ({
          userId: item.userId,
          amount: (totalAmount * item.shares) / totalShares,
          splitType: 'exact' as const,
        }));
    }

    return null;
  }

  const handleSubmit = async () => {
    if (!isValid) return;

    setLoading(true);
    try {
      await initDatabase();
      
      const newAmount = parseFloat(amount);
      
      // Calculate splits based on split type and method
      let splits: { userId: string; amount: number; splitType: 'equal' | 'exact' | 'percentage' }[] | null = null;
      
      if (splitType === SplitType.FRIENDS) {
        const allParticipants = [currentUserId, ...selectedFriendIds];
        splits = calculateSplits(allParticipants, newAmount);
      } else {
        const members = await groupService.getMembers(selectedGroupId);
        splits = calculateSplits(members.map((m: { userId: string }) => m.userId), newAmount);
      }
      
      if (!splits) {
        setLoading(false);
        return;
      }
      
      await expenseService.update(id, {
        description: description.trim(),
        amount: newAmount,
        groupId: splitType === SplitType.GROUP ? selectedGroupId : undefined,
      }, splits);

      // Log the activity
      const group = splitType === SplitType.GROUP ? groups.find(g => g.id === selectedGroupId) : undefined;
      await activityService.logExpenseUpdated({
        expenseId: id,
        userId: currentUserId,
        userName: user?.name || 'Someone',
        description: description.trim(),
        amount: newAmount,
        groupId: group?.id,
        groupName: group?.name,
      });

      router.back();
    } catch (error) {
      console.error('Error updating expense:', error);
      Alert.alert('Error', 'Failed to update expense');
    } finally {
      setLoading(false);
    }
  }

  if (dataLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      <NavigationHeader 
        title="Edit Expense" 
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
                Save
              </ThemedText>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Amount Input */}
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
                Description *
              </ThemedText>
              <View style={[styles.inputContainer, {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              }]}>
                <IconSymbol name="text.alignleft" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
                <TextInput
                  ref={descriptionInputRef}
                  style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g., Dinner, Groceries"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
            </View>

            {/* Split Method Selection */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                How to split?
              </ThemedText>
              <View style={styles.splitMethodContainer}>
                {SPLIT_METHODS
                  .filter(method => {
                    // Hide shares option for friends
                    if (splitType === SplitType.FRIENDS && method.id === SplitMethod.SHARES) {
                      return false;
                    }
                    return true;
                  })
                  .map(method => {
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

            {/* Group/Friend Selection - locked to original type */}
            {splitType === SplitType.GROUP ? (
              <View style={styles.selectionSection}>
                <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                  Select Group *
                </ThemedText>
                {groups.length === 0 ? (
                  <View style={[styles.emptyState, !isDark && { backgroundColor: colors.card }]}>
                    <IconSymbol name="person.3.fill" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                    <ThemedText style={[styles.emptyStateText, !isDark && { color: colors.textSecondary }]}>
                      No groups yet
                    </ThemedText>
                  </View>
                ) : (
                  groups.map(group => (
                    <TouchableOpacity
                      key={group.id}
                      onPress={() => setSelectedGroupId(group.id)}
                      style={[
                        styles.selectionCard,
                        selectedGroupId === group.id && styles.selectionCardActive,
                        {
                          backgroundColor: selectedGroupId === group.id
                            ? (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.15)')
                            : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                          borderColor: selectedGroupId === group.id
                            ? (isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)')
                            : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                        },
                      ]}>
                      <IconSymbol 
                        name="person.3.fill" 
                        size={24} 
                        color={selectedGroupId === group.id ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')} 
                      />
                      <ThemedText 
                        style={[
                          styles.selectionCardText,
                          { color: selectedGroupId === group.id ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? '#fff' : colors.text) }
                        ]}>
                        {group.name}
                      </ThemedText>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : (
              <View style={styles.selectionSection}>
                <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                  Select Friends *
                </ThemedText>
                {friends.length === 0 ? (
                  <View style={[styles.emptyState, !isDark && { backgroundColor: colors.card }]}>
                    <IconSymbol name="person.2.fill" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                    <ThemedText style={[styles.emptyStateText, !isDark && { color: colors.textSecondary }]}>
                      No friends yet
                    </ThemedText>
                  </View>
                ) : (
                  friends.map(friend => (
                    <TouchableOpacity
                      key={friend.id}
                      onPress={() => {
                        setSelectedFriendIds(prev =>
                          prev.includes(friend.id)
                            ? prev.filter(id => id !== friend.id)
                            : [...prev, friend.id]
                        );
                      }}
                      style={[
                        styles.selectionCard,
                        selectedFriendIds.includes(friend.id) && styles.selectionCardActive,
                        {
                          backgroundColor: selectedFriendIds.includes(friend.id)
                            ? (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.15)')
                            : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                          borderColor: selectedFriendIds.includes(friend.id)
                            ? (isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)')
                            : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                        },
                      ]}>
                      <IconSymbol 
                        name="person.fill" 
                        size={24} 
                        color={selectedFriendIds.includes(friend.id) ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')} 
                      />
                      <ThemedText 
                        style={[
                          styles.selectionCardText,
                          { color: selectedFriendIds.includes(friend.id) ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? '#fff' : colors.text) }
                        ]}>
                        {friend.name}
                      </ThemedText>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* Custom Split Inputs - Show when non-equal split is selected */}
            {splitMethod !== SplitMethod.EQUAL && (splitType === SplitType.FRIENDS ? selectedFriendIds.length > 0 : selectedGroupId) && amount && parseFloat(amount) > 0 && (() => {
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
                  {(splitMethod === SplitMethod.PERCENTAGE || splitMethod === SplitMethod.SHARES) && (() => {
                    const totalAmount = parseFloat(amount);
                    const userIds = splitType === SplitType.GROUP ? groupMembers : [currentUserId, ...selectedFriendIds];
                    let calculatedAmount = 0;
                    if (splitMethod === SplitMethod.PERCENTAGE) {
                      const percentage = parseFloat(customPercentages[currentUserId] || '0');
                      calculatedAmount = (totalAmount * percentage) / 100;
                    } else {
                      const shares = parseFloat(customShares[currentUserId] || '0');
                      const totalShares = userIds.reduce((sum, uid) => sum + parseFloat(customShares[uid] || '0'), 0);
                      calculatedAmount = totalShares > 0 ? (totalAmount * shares) / totalShares : 0;
                    }
                    return (
                      <ThemedText style={[styles.calculatedAmount, !isDark && { color: colors.textSecondary }]}>
                        ${calculatedAmount.toFixed(2)}
                      </ThemedText>
                    );
                  })()}
                </View>

                {/* Other participants */}
                {(splitType === SplitType.FRIENDS ? selectedFriendIds : groupMembers.filter(m => m !== currentUserId)).map(userId => {
                  const participant = friends.find(f => f.id === userId);
                  if (!participant) return null;
                  return (
                    <View key={userId} style={[styles.customSplitCard, {
                      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                      borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                    }]}>
                      <View style={[styles.customSplitAvatar, {
                        backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                      }]}>
                        <ThemedText style={{ color: isDark ? '#2DD4BF' : colors.tint, fontWeight: '600' }}>
                          {participant.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.customSplitName, !isDark && { color: colors.text }]}>
                        {participant.name}
                      </ThemedText>
                      <TextInput
                        style={[styles.customSplitInput, {
                          backgroundColor: isDark ? 'rgba(20, 35, 38, 0.8)' : 'rgba(255,255,255,0.9)',
                          color: isDark ? '#fff' : colors.text,
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                        }]}
                        value={splitMethod === SplitMethod.UNEQUAL ? customAmounts[userId] : splitMethod === SplitMethod.PERCENTAGE ? customPercentages[userId] : customShares[userId]}
                        onChangeText={(text) => {
                          if (splitMethod === SplitMethod.UNEQUAL) setCustomAmounts(prev => ({ ...prev, [userId]: text }));
                          else if (splitMethod === SplitMethod.PERCENTAGE) setCustomPercentages(prev => ({ ...prev, [userId]: text }));
                          else setCustomShares(prev => ({ ...prev, [userId]: text }));
                        }}
                        placeholder="0"
                        placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                        keyboardType="decimal-pad"
                      />
                      <ThemedText style={[styles.customSplitSuffix, !isDark && { color: colors.textSecondary }]}>
                        {splitMethod === SplitMethod.UNEQUAL ? '$' : splitMethod === SplitMethod.PERCENTAGE ? '%' : 'x'}
                      </ThemedText>
                      {(splitMethod === SplitMethod.PERCENTAGE || splitMethod === SplitMethod.SHARES) && (() => {
                        const totalAmount = parseFloat(amount);
                        const userIds = splitType === SplitType.GROUP ? groupMembers : [currentUserId, ...selectedFriendIds];
                        let calculatedAmount = 0;
                        if (splitMethod === SplitMethod.PERCENTAGE) {
                          const percentage = parseFloat(customPercentages[userId] || '0');
                          calculatedAmount = (totalAmount * percentage) / 100;
                        } else {
                          const shares = parseFloat(customShares[userId] || '0');
                          const totalShares = userIds.reduce((sum, uid) => sum + parseFloat(customShares[uid] || '0'), 0);
                          calculatedAmount = totalShares > 0 ? (totalAmount * shares) / totalShares : 0;
                        }
                        return (
                          <ThemedText style={[styles.calculatedAmount, !isDark && { color: colors.textSecondary }]}>
                            ${calculatedAmount.toFixed(2)}
                          </ThemedText>
                        );
                      })()}
                    </View>
                  );
                })}
              </View>
              );
            })()}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  content: {
    gap: 24,
  },
  amountSection: {
    gap: 8,
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '700',
  },
  amountInput: {
    flex: 1,
    fontSize: 48,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },
  inputSection: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
  },
  toggleSection: {
    gap: 8,
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
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleButtonActive: {},
  toggleButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  selectionSection: {
    gap: 12,
  },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectionCardActive: {},
  selectionCardText: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderRadius: 12,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 14,
    opacity: 0.6,
  },
  splitMethodContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  splitMethodButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  splitMethodButtonActive: {},
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
  calculatedAmount: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
    opacity: 0.7,
  },
});
