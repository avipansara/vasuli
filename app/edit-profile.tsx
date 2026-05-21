import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { ThemedInput } from '@/components/ui/themed-input';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { initDatabase, userService } from '@/services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
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

export default function EditProfileScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  // Input refs
  const nameInputRef = useRef<any>(null);

  useEffect(() => {
    setName(user?.name || '');

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
  }, [fadeAnim, slideAnim, user?.name]);

  const isValid = name.trim().length > 0;

  async function handleSubmit() {
    if (!isValid || !user) return;

    setLoading(true);
    try {
      await initDatabase();
      await userService.update(user.id, { name: name.trim() });
      
      // Refresh user data in auth context
      await refreshUser();
      
      Alert.alert('Success', 'Profile updated successfully');
      router.back();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

      <NavigationHeader 
        title="Edit Profile" 
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
            {/* Avatar Preview - Rectangular */}
            <View style={styles.avatarSection}>
              <View style={[styles.avatarLarge, { 
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
              }]}>
                <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                  {name.charAt(0).toUpperCase() || 'U'}
                </ThemedText>
              </View>
            </View>

            {/* Name Input */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Name *
              </ThemedText>
              <ThemedInput
                ref={nameInputRef}
                icon="person.fill"
                value={name}
                onChangeText={setName}
                placeholder="John Doe"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                autoCapitalize="words"
              />
            </View>

            {/* Info Card */}
            <View style={[styles.infoCard, {
              backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            }]}>
              <IconSymbol name="info.circle.fill" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
              <ThemedText style={[styles.infoText, !isDark && { color: colors.text }]}>
                Your name will be visible to friends and group members
              </ThemedText>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  content: {
    gap: 24,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 40,
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
