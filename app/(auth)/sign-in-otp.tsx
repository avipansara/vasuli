/* eslint-disable react-hooks/refs -- OTP focus is advanced from native input events, not during render. */
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { PENDING_INVITE_PATH_KEY } from '@/lib/invite-deeplink';
import { otpService } from '@/services/otp-service';
import { isEmailValid, normalizeEmail } from '@/utils/validation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View
} from 'react-native';

const { width, height } = Dimensions.get('window');

type Step = 'contact' | 'otp';

export default function SignInOTPScreen() {
  const { colors, isDark } = useThemeColors();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<Step>('contact');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpInputs = useRef<(TextInput | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));
  const [floatAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Floating animation for orbs
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Pulse animation for icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fadeAnim, slideAnim, floatAnim, pulseAnim]);

  const floatTranslate = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const isContactValid = () => isEmailValid(email);

  async function handleSendCode() {
    if (!isEmailValid(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const result = await otpService.sendSignInCode({
        email: normalizeEmail(email),
      });

      if (result.success) {
        setStep('otp');
        setResendTimer(60);
        setTimeout(() => otpInputs.current[0]?.focus(), 100);
      } else {
        Alert.alert('Error', result.error || 'Failed to send code');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      const result = await otpService.signInWithGoogle();
      if (!result.success) {
        if (result.error !== 'Google sign-in was cancelled') {
          Alert.alert('Google sign-in failed', result.error || 'Please try again.');
        }
        return;
      }

      await refreshUser();
      const pendingInvite = await AsyncStorage.getItem(PENDING_INVITE_PATH_KEY);
      await AsyncStorage.removeItem(PENDING_INVITE_PATH_KEY);
      router.replace((pendingInvite || '/(tabs)') as Href);
    } catch {
      Alert.alert('Google sign-in failed', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    const code = otp.join('');
    if (code.length !== 6) return;

    setLoading(true);
    try {
      const result = await otpService.verifySignInCode({
        email: normalizeEmail(email),
        code,
      });

      if (result.success) {
        await refreshUser();
        const pendingInvite = await AsyncStorage.getItem(PENDING_INVITE_PATH_KEY);
        await AsyncStorage.removeItem(PENDING_INVITE_PATH_KEY);
        setTimeout(() => {
          if (pendingInvite) {
            router.replace(pendingInvite as Href);
          } else {
            router.replace('/(tabs)');
          }
        }, 100);
      } else {
        Alert.alert('Error', result.error || 'Invalid code');
        setOtp(['', '', '', '', '', '']);
        otpInputs.current[0]?.focus();
      }
    } catch {
      Alert.alert('Error', 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    // Handle paste or autofill of full 6-digit code
    if (value.length >= 6) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      if (digits.length === 6) {
        // Set all digits in state
        const newOtp = [...otp];
        digits.forEach((digit, i) => {
          newOtp[i] = digit;
        });
        setOtp(newOtp);
        // Focus last input
        setTimeout(() => {
          otpInputs.current[5]?.focus();
          handleVerifyCode();
        }, 100);
        return;
      }
    }

    // Handle multi-digit paste into first field
    if (index === 0 && value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      if (digits.length === 6) {
        // Set all digits in state
        const newOtp = [...otp];
        digits.forEach((digit, i) => {
          newOtp[i] = digit;
        });
        setOtp(newOtp);
        // Focus last input
        setTimeout(() => {
          otpInputs.current[5]?.focus();
          handleVerifyCode();
        }, 100);
        return;
      }
    }

    // Handle single digit input
    if (value.length > 1) {
      value = value[value.length - 1];
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      otpInputs.current[index + 1]?.focus();
    }

    if (newOtp.every(digit => digit !== '') && newOtp.join('').length === 6) {
      setTimeout(() => handleVerifyCode(), 300);
    }
  }

  function handleOtpKeyPress(index: number, key: string) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpInputs.current[index - 1]?.focus();
    }
  }

  async function handleResendCode() {
    if (resendTimer > 0) return;

    setLoading(true);
    try {
      const result = await otpService.sendSignInCode({
        email: normalizeEmail(email),
      });

      if (result.success) {
        setResendTimer(60);
        setOtp(['', '', '', '', '', '']);
        Alert.alert('Success', 'New code sent!');
      } else {
        Alert.alert('Error', result.error || 'Failed to resend code');
      }
    } catch {
      Alert.alert('Error', 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  }

  const renderContactStep = () => (
    <View>
      {/* Header */}
      <View style={styles.header}>
        <View style={[
          styles.iconBox,
          { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : '#0F4C3A' }
        ]}>
          <IconSymbol name="person" size={30} color={isDark ? '#2DD4BF' : '#ffffff'} />
        </View>
        <Text style={[styles.title, { color: isDark ? '#ffffff' : '#0F172A' }]}>
          Welcome back
        </Text>
        <Text style={[styles.subtitle, { color: isDark ? 'rgba(255,255,255,0.65)' : '#475569' }]}>
          Sign in to continue to Vasuli
        </Text>
      </View>

      {/* Input */}
      <View style={styles.inputSection}>
        <Text style={[styles.inputLabel, { color: isDark ? 'rgba(255,255,255,0.85)' : '#334155' }]}>
          Email
        </Text>
        <View style={[
          styles.inputContainer,
          {
            backgroundColor: isDark ? 'rgba(15, 31, 34, 0.6)' : '#ffffff',
            borderColor: isDark ? 'rgba(45, 212, 191, 0.25)' : '#E2E8F0',
          }
        ]}>
          <IconSymbol
            name="envelope"
            size={18}
            color={isDark ? '#2DD4BF' : '#0F4C3A'}
          />
          <TextInput
            style={[styles.input, { color: isDark ? '#ffffff' : '#0F172A' }]}
            placeholder="you@example.com"
            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Continue Button */}
      <Pressable
        onPress={handleSendCode}
        disabled={loading || !isContactValid()}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: isDark ? '#0D9488' : '#0F4C3A' },
          pressed && styles.buttonPressed,
          (loading || !isContactValid()) && styles.buttonDisabled,
        ]}>
        {loading ? (
          <Text style={styles.buttonText}>Sending code...</Text>
        ) : (
          <View style={styles.buttonContentRow}>
            <Text style={styles.buttonText}>Continue</Text>
            <IconSymbol name="arrow.right" size={18} color="#ffffff" />
          </View>
        )}
      </Pressable>

      <View style={styles.oauthDivider}>
        <View style={[styles.oauthDividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0' }]} />
        <Text style={[styles.oauthDividerText, { color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B' }]}>or</Text>
        <View style={[styles.oauthDividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0' }]} />
      </View>

      <Pressable
        testID="google-sign-in-button"
        onPress={handleGoogleSignIn}
        disabled={loading}
        style={({ pressed }) => [
          styles.googleButton,
          {
            borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#E2E8F0',
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
          },
          pressed && styles.buttonPressed,
          loading && styles.buttonDisabled,
        ]}>
        <View style={styles.googleMark}>
          <Text style={styles.googleMarkText}>G</Text>
        </View>
        <Text style={[styles.googleButtonText, { color: isDark ? '#ffffff' : '#1E293B' }]}>Continue with Google</Text>
      </Pressable>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: isDark ? 'rgba(255,255,255,0.6)' : '#475569' }]}>
          {"Don’t have an account? "}
        </Text>
        <Link href="/sign-up-otp" asChild>
          <Pressable>
            <Text style={[styles.footerLink, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}>
              Sign up
            </Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );

  const renderOTPStep = () => (
    <View style={styles.otpContainer}>
      <Pressable
        onPress={() => setStep('contact')}
        style={[styles.backButton, {
          backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(15, 76, 58, 0.08)',
          borderColor: isDark ? 'rgba(45, 212, 191, 0.4)' : 'rgba(15, 76, 58, 0.2)',
        }]}>
        <IconSymbol name="chevron.left" size={20} color={isDark ? '#2DD4BF' : '#0F4C3A'} />
      </Pressable>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View>
          {/* Header */}
          <View style={styles.otpHeader}>
            <View style={[
              styles.iconBox,
              { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : '#0F4C3A' }
            ]}>
              <IconSymbol name="lock.fill" size={30} color={isDark ? '#2DD4BF' : '#ffffff'} />
            </View>
            <Text style={[styles.title, { color: isDark ? '#ffffff' : '#0F172A' }]}>
              Enter verification code
            </Text>
            <Text style={[styles.subtitle, { color: isDark ? 'rgba(255,255,255,0.65)' : '#475569' }]}>
              {"We’ve sent a 6-digit code to"}
            </Text>
            <Text style={[styles.contactHighlight, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}>
              {email}
            </Text>
          </View>

          {/* OTP Input */}
          <View style={styles.otpSection}>
            <View style={styles.otpRow}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => { otpInputs.current[index] = ref; }}
                  style={[
                    styles.otpInput,
                    {
                      backgroundColor: isDark ? 'rgba(15, 31, 34, 0.6)' : '#ffffff',
                      borderColor: digit
                        ? (isDark ? '#2DD4BF' : '#0F4C3A')
                        : (isDark ? 'rgba(45, 212, 191, 0.2)' : '#E2E8F0'),
                      color: isDark ? '#ffffff' : '#0F172A',
                    },
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(index, value)}
                  onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={index === 0 ? 6 : 1}
                  selectTextOnFocus
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                />
              ))}
            </View>

            {/* Resend */}
            <View style={styles.resendRow}>
              {resendTimer > 0 ? (
                <Text style={[styles.resendTimer, { color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B' }]}>
                  Resend code in {resendTimer}s
                </Text>
              ) : (
                <Pressable onPress={handleResendCode} disabled={loading}>
                  <Text style={[styles.resendLink, { color: isDark ? '#2DD4BF' : '#0F4C3A' }]}>
                    Resend code
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Verify Button */}
          <Pressable
            onPress={handleVerifyCode}
            disabled={loading || otp.join('').length !== 6}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: isDark ? '#0D9488' : '#0F4C3A' },
              pressed && styles.buttonPressed,
              (loading || otp.join('').length !== 6) && styles.buttonDisabled,
            ]}>
            {loading ? (
              <Text style={styles.buttonText}>Verifying...</Text>
            ) : (
              <View style={styles.buttonContentRow}>
                <Text style={styles.buttonText}>Verify & Sign In</Text>
                <IconSymbol name="checkmark" size={18} color="#ffffff" />
              </View>
            )}
          </Pressable>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}>
          {step === 'contact' ? renderContactStep() : renderOTPStep()}
        </Animated.View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: width * 0.8,
    height: width * 0.8,
    top: -width * 0.3,
    left: -width * 0.3,
  },
  orb2: {
    width: width * 0.6,
    height: width * 0.6,
    bottom: height * 0.1,
    right: -width * 0.25,
  },
  orb3: {
    width: width * 0.5,
    height: width * 0.5,
    top: height * 0.4,
    left: -width * 0.2,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    width: '100%',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconBox: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 0,
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  oauthDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  oauthDividerLine: {
    flex: 1,
    height: 1,
  },
  oauthDividerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  googleButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  googleMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  googleMarkText: {
    color: '#4285F4',
    fontSize: 17,
    fontWeight: '800',
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 15,
    fontWeight: '400',
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '600',
  },
  otpContainer: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    left: 0,
    zIndex: 10,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
  },
  otpHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  contactHighlight: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  otpSection: {
    marginBottom: 32,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  resendRow: {
    alignItems: 'center',
  },
  resendTimer: {
    fontSize: 14,
    fontWeight: '500',
  },
  resendLink: {
    fontSize: 15,
    fontWeight: '600',
  },
});
