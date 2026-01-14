import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { ThemedInput } from '@/components/ui/themed-input';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { groupService, initDatabase } from '@/services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Keyboard,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

const GROUP_ICONS = [
  { icon: 'house.fill', label: 'Home' },
  { icon: 'airplane', label: 'Trip' },
  { icon: 'fork.knife', label: 'Food' },
  { icon: 'cart.fill', label: 'Shopping' },
  { icon: 'heart.fill', label: 'Couple' },
  { icon: 'person.3.fill', label: 'Friends' },
  { icon: 'briefcase.fill', label: 'Work' },
  { icon: 'gamecontroller.fill', label: 'Fun' },
];

export default function EditGroupScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('person.3.fill');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Input refs for focus management
  const groupNameInputRef = useRef<any>(null);
  const descriptionInputRef = useRef<any>(null);

  useEffect(() => {
    loadGroupData();
  }, [id]);

  async function loadGroupData() {
    try {
      const group = await groupService.getById(id);
      if (!group) {
        Alert.alert('Error', 'Group not found');
        router.back();
        return;
      }
      setGroupName(group.name);
      setDescription(group.description || '');
      setInitialLoading(false);

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
      console.error('Error loading group:', error);
      Alert.alert('Error', 'Failed to load group');
      router.back();
    }
  }

  const isValid = groupName.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;

    setLoading(true);
    try {
      await initDatabase();
      await groupService.update(id, {
        name: groupName.trim(),
        description: description.trim() || undefined,
      });

      router.back();
    } catch (error) {
      console.error('Error updating group:', error);
      Alert.alert('Error', 'Failed to update group');
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
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
          Edit Group
        </ThemedText>
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
            <ThemedText style={[styles.headerButtonText, { color: isValid && !loading ? '#FFFFFF' : (isDark ? '#9CA3AF' : '#6B7280') }]}>
              Save
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Group Name Input */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Group Name *
              </ThemedText>
              <ThemedInput
                ref={groupNameInputRef}
                icon="person.3.fill"
                value={groupName}
                onChangeText={setGroupName}
                placeholder="e.g., Weekend Trip, Roommates"
                returnKeyType="next"
                onSubmitEditing={() => descriptionInputRef.current?.focus()}
                autoCapitalize="words"
              />
            </View>

            {/* Description Input */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Description (Optional)
              </ThemedText>
              <ThemedInput
                ref={descriptionInputRef}
                icon="text.alignleft"
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={{ minHeight: 80 }}
              />
            </View>
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
  textArea: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    minHeight: 80,
  },
});
