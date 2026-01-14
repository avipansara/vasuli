import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

export default function SignUpScreen() {
  const { colors, isDark } = useThemeColors();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const floatTranslate = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -15],
  });

  async function handleSignUp() {
    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  const renderInput = (
    field: string,
    icon: string,
    placeholder: string,
    value: string,
    onChangeText: (text: string) => void,
    options?: {
      secureTextEntry?: boolean;
      keyboardType?: 'default' | 'email-address';
      autoCapitalize?: 'none' | 'words';
      autoComplete?: 'name' | 'email' | 'new-password';
    }
  ) => (
    <View style={styles.inputWrapper}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)',
            borderColor: focusedField === field
              ? (isDark ? '#2DD4BF' : '#22C55E')
              : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
          },
        ]}>
        <IconSymbol
          name={icon as any}
          size={18}
          color={focusedField === field ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')}
        />
        <TextInput
          style={[styles.input, { color: isDark ? '#fff' : colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocusedField(field)}
          onBlur={() => setFocusedField(null)}
          secureTextEntry={options?.secureTextEntry}
          keyboardType={options?.keyboardType}
          autoCapitalize={options?.autoCapitalize}
          autoComplete={options?.autoComplete}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Animated Background */}
      <LinearGradient
        colors={isDark ? ['#0A0A0F', '#0F172A', '#0A0A0F'] : ['#F0FDF4', '#ECFDF5', '#F0FDF4']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Decorative Floating Orbs */}
      <Animated.View
        style={[
          styles.orb,
          styles.orb1,
          {
            backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(59, 130, 246, 0.12)',
            transform: [{ translateY: floatTranslate }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.orb2,
          {
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            transform: [{ translateY: Animated.multiply(floatTranslate, -1) }],
          },
        ]}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          
          {/* Hero Section */}
          <Animated.View
            style={[
              styles.heroSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
              },
            ]}>
            <View style={styles.logoWrapper}>
              <LinearGradient
                colors={isDark ? ['#8B5CF6', '#6366F1'] : ['#3B82F6', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGradient}>
                <IconSymbol name="person.badge.plus" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={[styles.appName, { color: isDark ? '#fff' : colors.text }]}>
              Join Vasuli
            </Text>
            <Text style={[styles.tagline, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
              Create your account in seconds
            </Text>
          </Animated.View>

          {/* Glass Card */}
          <Animated.View
            style={[
              styles.cardWrapper,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}>
            <BlurView
              intensity={isDark ? 40 : 80}
              tint={isDark ? 'dark' : 'light'}
              style={styles.glassCard}>
              <View style={[
                styles.cardInner,
                { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }
              ]}>
                {/* Progress Indicator */}
                <View style={styles.progressContainer}>
                  <View style={[styles.progressStep, { backgroundColor: name ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)') }]} />
                  <View style={[styles.progressStep, { backgroundColor: email ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)') }]} />
                  <View style={[styles.progressStep, { backgroundColor: password ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)') }]} />
                  <View style={[styles.progressStep, { backgroundColor: confirmPassword ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)') }]} />
                </View>

                {renderInput('name', 'person.fill', 'Full name', name, setName, { autoCapitalize: 'words', autoComplete: 'name' })}
                {renderInput('email', 'envelope.fill', 'Email address', email, setEmail, { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email' })}
                {renderInput('password', 'lock.fill', 'Create password', password, setPassword, { secureTextEntry: true, autoComplete: 'new-password' })}
                {renderInput('confirmPassword', 'lock.shield.fill', 'Confirm password', confirmPassword, setConfirmPassword, { secureTextEntry: true, autoComplete: 'new-password' })}

                {/* Password Requirements */}
                <View style={styles.requirements}>
                  <View style={styles.requirementRow}>
                    <IconSymbol
                      name={password.length >= 6 ? 'checkmark.circle.fill' : 'circle'}
                      size={14}
                      color={password.length >= 6 ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)')}
                    />
                    <Text style={[styles.requirementText, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>
                      At least 6 characters
                    </Text>
                  </View>
                  <View style={styles.requirementRow}>
                    <IconSymbol
                      name={password && password === confirmPassword ? 'checkmark.circle.fill' : 'circle'}
                      size={14}
                      color={password && password === confirmPassword ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)')}
                    />
                    <Text style={[styles.requirementText, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>
                      Passwords match
                    </Text>
                  </View>
                </View>

                {/* Sign Up Button */}
                <Pressable
                  onPress={handleSignUp}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.signUpButton,
                    pressed && styles.signUpButtonPressed,
                  ]}>
                  <LinearGradient
                    colors={isDark ? ['#8B5CF6', '#6366F1'] : ['#3B82F6', '#6366F1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.signUpButtonGradient, loading && styles.signUpButtonDisabled]}>
                    {loading ? (
                      <Text style={styles.signUpButtonText}>Creating account...</Text>
                    ) : (
                      <>
                        <Text style={styles.signUpButtonText}>Create Account</Text>
                        <IconSymbol name="arrow.right" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>

                {/* Terms */}
                <Text style={[styles.termsText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
                  By signing up, you agree to our Terms of Service and Privacy Policy
                </Text>
              </View>
            </BlurView>
          </Animated.View>

          {/* Footer */}
          <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
            <Text style={[styles.footerText, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary }]}>
              {"Already have an account? "}
            </Text>
            <Link href="/sign-in" asChild>
              <Pressable>
                <Text style={[styles.linkText, { color: isDark ? '#8B5CF6' : '#6366F1' }]}>
                  Sign in
                </Text>
              </Pressable>
            </Link>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 40,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: width * 0.7,
    height: width * 0.7,
    top: -width * 0.2,
    left: -width * 0.2,
  },
  orb2: {
    width: width * 0.5,
    height: width * 0.5,
    bottom: height * 0.15,
    right: -width * 0.2,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoWrapper: {
    marginBottom: 12,
  },
  logoGradient: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
  },
  cardWrapper: {
    marginBottom: 20,
  },
  glassCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  progressStep: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  inputWrapper: {
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  requirements: {
    marginBottom: 16,
    gap: 6,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requirementText: {
    fontSize: 12,
    fontWeight: '500',
  },
  signUpButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  signUpButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  signUpButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  signUpButtonDisabled: {
    opacity: 0.7,
  },
  signUpButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
