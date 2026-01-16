import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
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
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Input refs
  const amountInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadExpenseData();
  }, [id]);

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

      const [groupsData, usersData] = await Promise.all([
        groupService.getAll(),
        userService.getAll(),
      ]);

      setGroups(groupsData);
      setFriends(usersData.filter(u => u.id !== currentUserId));
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

  const isValid = 
    description.trim().length > 0 &&
    amount.trim().length > 0 &&
    !isNaN(parseFloat(amount)) &&
    parseFloat(amount) > 0 &&
    (splitType === SplitType.GROUP ? selectedGroupId !== '' : selectedFriendIds.length > 0);

  async function handleSubmit() {
    if (!isValid) return;

    setLoading(true);
    try {
      await initDatabase();
      
      await expenseService.update(id, {
        description: description.trim(),
        amount: parseFloat(amount),
        groupId: splitType === SplitType.GROUP ? selectedGroupId : undefined,
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

            {/* Split Type Toggle */}
            <View style={styles.toggleSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Split with
              </ThemedText>
              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  onPress={() => setSplitType(SplitType.GROUP)}
                  style={[
                    styles.toggleButton,
                    splitType === SplitType.GROUP && styles.toggleButtonActive,
                    {
                      backgroundColor: splitType === SplitType.GROUP
                        ? (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.15)')
                        : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                      borderColor: splitType === SplitType.GROUP
                        ? (isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)')
                        : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                    },
                  ]}>
                  <IconSymbol 
                    name="person.3.fill" 
                    size={20} 
                    color={splitType === SplitType.GROUP ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')} 
                  />
                  <ThemedText 
                    style={[
                      styles.toggleButtonText,
                      { color: splitType === SplitType.GROUP ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)') }
                    ]}>
                    Group
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSplitType(SplitType.FRIENDS)}
                  style={[
                    styles.toggleButton,
                    splitType === SplitType.FRIENDS && styles.toggleButtonActive,
                    {
                      backgroundColor: splitType === SplitType.FRIENDS
                        ? (isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.15)')
                        : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                      borderColor: splitType === SplitType.FRIENDS
                        ? (isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)')
                        : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                    },
                  ]}>
                  <IconSymbol 
                    name="person.2.fill" 
                    size={20} 
                    color={splitType === SplitType.FRIENDS ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')} 
                  />
                  <ThemedText 
                    style={[
                      styles.toggleButtonText,
                      { color: splitType === SplitType.FRIENDS ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)') }
                    ]}>
                    Friends
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Group/Friend Selection */}
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
});
