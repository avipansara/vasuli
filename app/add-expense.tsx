import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { expenseService, groupService, initDatabase, userService } from '@/services/api';
import type { Group, User } from '@/types/database';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type SplitType = 'group' | 'friends';

export default function AddExpenseScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const { groupId: preselectedGroupId } = useLocalSearchParams<{ groupId?: string }>();
  const currentUserId = user?.id || '';

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitType, setSplitType] = useState<SplitType>(preselectedGroupId ? 'group' : 'group');
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(preselectedGroupId || '');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

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

  async function loadData() {
    try {
      await initDatabase();
      const [allGroups, allUsers] = await Promise.all([
        groupService.getAll(),
        userService.getAll(),
      ]);
      setGroups(allGroups);
      setFriends(allUsers.filter((u: User) => u.id !== currentUserId));
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
    (splitType === 'group' ? selectedGroupId : selectedFriendIds.length > 0);

  async function handleSubmit() {
    if (!isValid) return;

    setLoading(true);
    try {
      const amountNum = parseFloat(amount);

      if (splitType === 'group') {
        const members = await groupService.getMembers(selectedGroupId);
        const splitAmount = amountNum / members.length;

        await expenseService.create(
          {
            groupId: selectedGroupId,
            description: description.trim(),
            amount: amountNum,
            currency: 'USD',
            paidBy: currentUserId,
            date: Date.now(),
          },
          members.map((member: { userId: string }) => ({
            userId: member.userId,
            amount: splitAmount,
            splitType: 'equal' as const,
          }))
        );
      } else {
        const allParticipants = [currentUserId, ...selectedFriendIds];
        const splitAmount = amountNum / allParticipants.length;

        await expenseService.create(
          {
            description: description.trim(),
            amount: amountNum,
            currency: 'USD',
            paidBy: currentUserId,
            date: Date.now(),
          },
          allParticipants.map(userId => ({
            userId,
            amount: splitAmount,
            splitType: 'equal' as const,
          }))
        );
      }

      router.back();
    } catch (error) {
      console.error('Error creating expense:', error);
      Alert.alert('Error', 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, {
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
            borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
          }]}>
          <IconSymbol size={20} name="xmark" color={isDark ? '#2DD4BF' : colors.tint} />
        </TouchableOpacity>
        <ThemedText type="subtitle" style={[styles.headerTitle, !isDark && { color: colors.text }]}>
          Add Expense
        </ThemedText>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Amount Input - Hero Style */}
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
                  autoFocus
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
                  style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Dinner, Groceries, Uber..."
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                />
              </View>
            </View>

            {/* Split Type Toggle */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Split with
              </ThemedText>
              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    splitType === 'group' && styles.toggleButtonActive,
                    !isDark && splitType !== 'group' && { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => setSplitType('group')}>
                  <IconSymbol
                    name="person.3.fill"
                    size={18}
                    color={splitType === 'group' ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                  />
                  <ThemedText style={[
                    styles.toggleText,
                    splitType === 'group' && styles.toggleTextActive,
                    !isDark && splitType !== 'group' && { color: colors.text },
                  ]}>
                    Group
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    splitType === 'friends' && styles.toggleButtonActive,
                    !isDark && splitType !== 'friends' && { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => setSplitType('friends')}>
                  <IconSymbol
                    name="person.2.fill"
                    size={18}
                    color={splitType === 'friends' ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                  />
                  <ThemedText style={[
                    styles.toggleText,
                    splitType === 'friends' && styles.toggleTextActive,
                    !isDark && splitType !== 'friends' && { color: colors.text },
                  ]}>
                    Friends
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Selection List */}
            <View style={styles.selectionSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                {splitType === 'group' ? 'Select a group' : 'Select friends'}
              </ThemedText>

              {dataLoading ? (
                <View style={styles.loadingContainer}>
                  <ThemedText style={{ opacity: 0.6 }}>Loading...</ThemedText>
                </View>
              ) : splitType === 'group' ? (
                <View style={styles.optionsList}>
                  {groups.length === 0 ? (
                    <View style={styles.emptyState}>
                      <IconSymbol name="person.3" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                      <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
                        No groups yet
                      </ThemedText>
                    </View>
                  ) : (
                    groups.map(group => (
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
                        onPress={() => setSelectedGroupId(group.id)}>
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
                    ))
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
                          onPress={() => toggleFriend(friend.id)}>
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

            {/* Split Preview */}
            {isValid && (
              <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={styles.previewCard}>
                <View style={[styles.previewContent, !isDark && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
                  <IconSymbol name="divide.circle" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
                  <ThemedText style={[styles.previewText, !isDark && { color: colors.textSecondary }]}>
                    Split equally: ${(parseFloat(amount) / (splitType === 'group' ? 1 : selectedFriendIds.length + 1)).toFixed(2)} each
                  </ThemedText>
                </View>
              </BlurView>
            )}
          </Animated.View>
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!isValid || loading}
            style={[styles.submitButton, (!isValid || loading) && styles.submitButtonDisabled]}>
            <LinearGradient
              colors={isValid ? (isDark ? ['#2DD4BF', '#22D3EE'] : ['#22C55E', '#10B981']) : ['#6B7280', '#4B5563']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitButtonGradient}>
              {loading ? (
                <ThemedText style={styles.submitButtonText}>Adding...</ThemedText>
              ) : (
                <>
                  <IconSymbol name="plus.circle.fill" size={20} color="#fff" />
                  <ThemedText style={styles.submitButtonText}>Add Expense</ThemedText>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
