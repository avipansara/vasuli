import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemedInput } from '@/components/ui/themed-input';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { groupService } from '@/services/group-service';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';



export default function EditGroupScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  // Input refs for focus management
  const groupNameInputRef = useRef<any>(null);
  const descriptionInputRef = useRef<any>(null);

  const loadGroupData = useCallback(async () => {
    try {
      setLoadError(null);
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
      setLoadError(getFetchErrorMessage(error));
      setInitialLoading(false);
    }
  }, [fadeAnim, id, slideAnim]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial async load hydrates local editable group state.
    loadGroupData();
  }, [loadGroupData]);

  const isValid = groupName.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;

    setLoading(true);
    try {
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
        <NavigationHeader
          title="Edit Group"
          onBack={() => router.back()}
        />
        <View style={styles.scrollContent}>
          <View style={[styles.inputSection, { marginTop: 24 }]}>
            <Skeleton width={100} height={16} style={{ marginBottom: 8 }} />
            <Skeleton height={50} borderRadius={12} />
          </View>
          <View style={[styles.inputSection, { marginTop: 24 }]}>
            <Skeleton width={150} height={16} style={{ marginBottom: 8 }} />
            <Skeleton height={80} borderRadius={12} />
          </View>
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <NavigationHeader
          title="Edit Group"
          onBack={() => router.back()}
        />
        <AsyncErrorState
          message={loadError}
          onRetry={() => void loadGroupData()}
          title="Couldn't load group"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      <NavigationHeader
        title="Edit Group"
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
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <ThemedText style={[styles.headerButtonText, { color: isValid ? '#ffffff' : (isDark ? '#9CA3AF' : '#6B7280') }]}>
                Save
              </ThemedText>
            )}
          </TouchableOpacity>
        }
      />

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
    fontFamily: 'Manrope_400Regular',
  },
  textArea: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    minHeight: 80,
  },
});
