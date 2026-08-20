import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader, HeaderActionButton } from '@/components/ui/screen-header';
import { ThemedInput } from '@/components/ui/themed-input';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { groupService } from '@/services/group-service';
import { queryKeys } from '@/services/query-keys';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useRef } from 'react';
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

export default function CreateGroupScreen() {
  const { colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();

  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('person.3.fill');
  const [loading, setLoading] = useState(false);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  // Input refs for focus management
  const groupNameInputRef = useRef<any>(null);
  const descriptionInputRef = useRef<any>(null);

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
  }, [fadeAnim, slideAnim]);

  const isValid = groupName.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;

    setLoading(true);
    try {
      console.log('[CreateGroup] Creating group with user:', currentUserId);
      const newGroup = await groupService.create({
        name: groupName.trim(),
        description: description.trim() || undefined,
      });
      console.log('[CreateGroup] Group created:', newGroup.id);

      // Add current user as first member (admin)
      console.log('[CreateGroup] Adding creator as admin member');
      await groupService.addMember(newGroup.id, currentUserId, 'admin');
      console.log('[CreateGroup] Creator added successfully');

      await queryClient.invalidateQueries({
        queryKey: queryKeys.groups.list(currentUserId),
        refetchType: 'all',
      });
      router.back();
    } catch (error: any) {
      console.error('Error creating group:', error);
      Alert.alert('Error', error?.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  }

  const cardStyle = {
    backgroundColor: colors.card,
    borderWidth: 0,
    shadowColor: isDark ? '#000000' : '#475569',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.35 : 0.09,
    shadowRadius: 10,
    elevation: 3,
    borderRadius: 14,
  };

  const primaryBtnColor = isDark ? '#0D9488' : '#0F4C3A';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NavigationHeader
        title="Create Group"
        onBack={() => router.back()}
        rightAction={
          <HeaderActionButton
            label="Create"
            onPress={handleSubmit}
            disabled={!isValid}
            loading={loading}
            testID="create-group-submit-button"
          />
        }
      />

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Group Name Input */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Group Name *
            </ThemedText>
            <ThemedInput
              ref={groupNameInputRef}
              icon="pencil"
              value={groupName}
              onChangeText={setGroupName}
              testID="create-group-name-input"
              placeholder="e.g. Summer Trip 2024"
              returnKeyType="next"
              onSubmitEditing={() => descriptionInputRef.current?.focus()}
              autoCapitalize="words"
            />
          </View>

          {/* Description Input */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Description (Optional)
            </ThemedText>
            <ThemedInput
              ref={descriptionInputRef}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              style={{ minHeight: 80 }}
            />
          </View>

          {/* Icon Selection */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Choose an Icon
            </ThemedText>
            <View style={styles.iconGrid}>
              {GROUP_ICONS.map((item) => {
                const isSelected = selectedIcon === item.icon;
                return (
                  <TouchableOpacity
                    key={item.icon}
                    style={[
                      styles.iconOption,
                      cardStyle,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? 'rgba(13, 148, 136, 0.16)' : 'rgba(15, 76, 58, 0.08)')
                          : colors.card,
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: isSelected ? primaryBtnColor : 'transparent',
                      },
                    ]}
                    onPress={() => setSelectedIcon(item.icon)}>
                    <IconSymbol
                      name={item.icon as any}
                      size={24}
                      color={isSelected ? primaryBtnColor : colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Info Card */}
          <View style={[styles.infoCard, cardStyle]}>
            <View style={[styles.infoContent, { backgroundColor: colors.infoSurface }]}>
              <IconSymbol name="info.circle" size={20} color={primaryBtnColor} />
              <ThemedText style={[styles.infoText, { color: colors.textSecondary }]}>
                You can add members to your group after creating it.
              </ThemedText>
            </View>
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
