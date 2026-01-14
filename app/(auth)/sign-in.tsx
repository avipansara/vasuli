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
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

export default function SignInScreen() {
  const { colors, isDark } = useThemeColors();
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

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

    // Floating animation for decorative elements
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

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!resetEmail.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    setResetLoading(true);
    try {
      await resetPassword(resetEmail.trim());
      setShowForgotModal(false);
      setResetEmail('');
      Alert.alert(
        'Check Your Email',
        'If an account exists with this email, you will receive a password reset link.'
      );
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  }

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
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            transform: [{ translateY: floatTranslate }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.orb2,
          {
            backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(59, 130, 246, 0.1)',
            transform: [{ translateY: Animated.multiply(floatTranslate, -1) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.orb3,
          {
            backgroundColor: isDark ? 'rgba(236, 72, 153, 0.08)' : 'rgba(236, 72, 153, 0.08)',
            transform: [{ translateY: floatTranslate }],
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
                colors={isDark ? ['#2DD4BF', '#22D3EE'] : ['#22C55E', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGradient}>
                <IconSymbol name="dollarsign.circle.fill" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={[styles.appName, { color: isDark ? '#fff' : colors.text }]}>
              Vasuli
            </Text>
            <Text style={[styles.tagline, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
              Split expenses, not friendships
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
                <Text style={[styles.cardTitle, { color: isDark ? '#fff' : colors.text }]}>
                  Welcome back
                </Text>
                <Text style={[styles.cardSubtitle, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary }]}>
                  Sign in to your account
                </Text>

                {/* Email Input */}
                <View style={styles.inputWrapper}>
                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                        borderColor: focusedField === 'email'
                          ? (isDark ? '#2DD4BF' : '#22C55E')
                          : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                      },
                    ]}>
                    <IconSymbol
                      name="envelope.fill"
                      size={18}
                      color={focusedField === 'email' ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')}
                    />
                    <TextInput
                      style={[styles.input, { color: isDark ? '#fff' : colors.text }]}
                      placeholder="Email address"
                      placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                    />
                  </View>
                </View>

                {/* Password Input */}
                <View style={styles.inputWrapper}>
                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                        borderColor: focusedField === 'password'
                          ? (isDark ? '#2DD4BF' : '#22C55E')
                          : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                      },
                    ]}>
                    <IconSymbol
                      name="lock.fill"
                      size={18}
                      color={focusedField === 'password' ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')}
                    />
                    <TextInput
                      style={[styles.input, { color: isDark ? '#fff' : colors.text }]}
                      placeholder="Password"
                      placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry
                      autoComplete="password"
                    />
                  </View>
                </View>

                {/* Forgot Password */}
                <Pressable
                  style={styles.forgotPassword}
                  onPress={() => {
                    setResetEmail(email);
                    setShowForgotModal(true);
                  }}>
                  <Text style={[styles.forgotPasswordText, { color: isDark ? '#2DD4BF' : '#22C55E' }]}>
                    Forgot password?
                  </Text>
                </Pressable>

                {/* Sign In Button */}
                <Pressable
                  onPress={handleSignIn}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.signInButton,
                    pressed && styles.signInButtonPressed,
                  ]}>
                  <LinearGradient
                    colors={isDark ? ['#2DD4BF', '#22D3EE'] : ['#22C55E', '#10B981']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.signInButtonGradient, loading && styles.signInButtonDisabled]}>
                    {loading ? (
                      <Text style={styles.signInButtonText}>Signing in...</Text>
                    ) : (
                      <>
                        <Text style={styles.signInButtonText}>Sign In</Text>
                        <IconSymbol name="arrow.right" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>

                {/* Divider */}
                <View style={styles.divider}>
                  <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
                  <Text style={[styles.dividerText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
                    or continue with
                  </Text>
                  <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
                </View>

                {/* Social Buttons */}
                <View style={styles.socialButtons}>
                  <Pressable
                    style={[
                      styles.socialButton,
                      { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)' },
                    ]}
                    onPress={() => Alert.alert('Coming Soon', 'Google sign in coming soon!')}>
                    <IconSymbol name="globe" size={20} color={isDark ? '#fff' : colors.text} />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.socialButton,
                      { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)' },
                    ]}
                    onPress={() => Alert.alert('Coming Soon', 'Apple sign in coming soon!')}>
                    <IconSymbol name="apple.logo" size={20} color={isDark ? '#fff' : colors.text} />
                  </Pressable>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          {/* Footer */}
          <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
            <Text style={[styles.footerText, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary }]}>
              {"Don't have an account? "}
            </Text>
            <Link href="/sign-up" asChild>
              <Pressable>
                <Text style={[styles.linkText, { color: isDark ? '#2DD4BF' : '#22C55E' }]}>
                  Create one
                </Text>
              </Pressable>
            </Link>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowForgotModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowForgotModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[
                styles.modalContent,
                { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)' }
              ]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: isDark ? '#fff' : colors.text }]}>
                    Reset Password
                  </Text>
                  <TouchableOpacity onPress={() => setShowForgotModal(false)}>
                    <IconSymbol name="xmark" size={24} color={isDark ? '#fff' : colors.text} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.modalDescription, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
                  Enter your email address and we&apos;ll send you a link to reset your password.
                </Text>

                <View style={[
                  styles.inputContainer,
                  {
                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                    borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                  }
                ]}>
                  <IconSymbol
                    name="envelope.fill"
                    size={18}
                    color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                  />
                  <TextInput
                    style={[styles.input, { color: isDark ? '#fff' : colors.text }]}
                    placeholder="Email address"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  onPress={handleResetPassword}
                  disabled={resetLoading}
                  style={styles.modalButton}>
                  <LinearGradient
                    colors={isDark ? ['#2DD4BF', '#22D3EE'] : ['#22C55E', '#10B981']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.modalButtonGradient, resetLoading && { opacity: 0.7 }]}>
                    <Text style={styles.modalButtonText}>
                      {resetLoading ? 'Sending...' : 'Send Reset Link'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: width * 0.8,
    height: width * 0.8,
    top: -width * 0.3,
    right: -width * 0.3,
  },
  orb2: {
    width: width * 0.6,
    height: width * 0.6,
    bottom: height * 0.1,
    left: -width * 0.3,
  },
  orb3: {
    width: width * 0.4,
    height: width * 0.4,
    top: height * 0.4,
    right: -width * 0.1,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoWrapper: {
    marginBottom: 16,
  },
  logoGradient: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2DD4BF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 15,
    fontFamily: 'Nunito_500Medium',
  },
  cardWrapper: {
    marginBottom: 24,
  },
  glassCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardTitle: {
    fontSize: 24,
    fontFamily: 'Nunito_700Bold',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    marginBottom: 24,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Nunito_500Medium',
    textAlignVertical: 'center',
    paddingVertical: 0,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
  },
  signInButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
  },
  signInButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  signInButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  signInButtonDisabled: {
    opacity: 0.7,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 12,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalButton: {
    marginTop: 8,
  },
  modalButtonGradient: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
