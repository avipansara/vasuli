import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { groupService, initDatabase } from '@/services/api';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
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

export default function CreateGroupScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('person.3.fill');
  const [loading, setLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Input refs for focus management
  const groupNameInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  useEffect(() => {
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

  const isValid = groupName.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;

    setLoading(true);
    try {
      await initDatabase();
      const newGroup = await groupService.create({
        name: groupName.trim(),
        description: description.trim() || undefined,
      });

      // Add current user as first member
      await groupService.addMember(newGroup.id, currentUserId, 'admin');

      router.back();
    } catch (error) {
      console.error('Error creating group:', error);
      Alert.alert('Error', 'Failed to create group');
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
          Create Group
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
              Create
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Icon Preview */}
            {/* <View style={styles.iconPreviewSection}>
              <View style={[styles.iconPreview, {
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
              }]}>
                <IconSymbol name={selectedIcon as any} size={48} color={isDark ? '#2DD4BF' : colors.tint} />
              </View>
              <ThemedText style={[styles.iconPreviewLabel, !isDark && { color: colors.textSecondary }]}>
                {groupName || 'New Group'}
              </ThemedText>
            </View> */}

            {/* Group Name Input */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Group Name *
              </ThemedText>
              <View style={[styles.inputContainer, {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              }]}>
                <IconSymbol name="pencil" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
                <TextInput
                  ref={groupNameInputRef}
                  style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="e.g. Summer Trip 2024"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                  returnKeyType="next"
                  onSubmitEditing={() => descriptionInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            {/* Description Input */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Description (Optional)
              </ThemedText>
              <View style={[styles.textAreaContainer, {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              }]}>
                <TextInput
                  ref={descriptionInputRef}
                  style={[styles.textArea, { color: isDark ? '#fff' : colors.text }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What is this group for?"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}  
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => {
                    Keyboard.dismiss();
                    if (isValid) handleSubmit();
                  }}
                />
              </View>
            </View>

            {/* Icon Selection */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Choose an Icon
              </ThemedText>
              <View style={styles.iconGrid}>
                {GROUP_ICONS.map((item) => (
                  <TouchableOpacity
                    key={item.icon}
                    style={[
                      styles.iconOption,
                      selectedIcon === item.icon && styles.iconOptionSelected,
                      {
                        backgroundColor: selectedIcon === item.icon
                          ? (isDark ? '#2DD4BF' : colors.tint)
                          : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                        borderColor: selectedIcon === item.icon
                          ? (isDark ? '#2DD4BF' : colors.tint)
                          : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                      },
                    ]}
                    onPress={() => setSelectedIcon(item.icon)}>
                    <IconSymbol
                      name={item.icon as any}
                      size={24}
                      color={selectedIcon === item.icon ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Info Card */}
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={styles.infoCard}>
              <View style={[styles.infoContent, !isDark && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
                <IconSymbol name="info.circle" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
                <ThemedText style={[styles.infoText, !isDark && { color: colors.textSecondary }]}>
                  You can add members to your group after creating it.
                </ThemedText>
              </View>
            </BlurView>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
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
  iconPreviewSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 16,
  },
  iconPreview: {
    width: 100,
    height: 100,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 16,
  },
  iconPreviewLabel: {
    fontSize: 20,
    fontWeight: '600',
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
  textAreaContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  textArea: {
    fontSize: 16,
    minHeight: 80,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconOption: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  iconOptionSelected: {
    borderWidth: 2,
  },
  infoCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  infoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
  },
  infoText: {
    flex: 1,
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
