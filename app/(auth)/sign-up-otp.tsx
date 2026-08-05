/* eslint-disable react-hooks/refs -- OTP focus is advanced from native input events, not during render. */
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context-otp';
import { PENDING_INVITE_PATH_KEY } from '@/lib/invite-deeplink';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { otpService } from '@/services/otp-service';
import { isEmailValid, normalizeEmail, normalizePersonName } from '@/utils/validation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router, type Href } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
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
  View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

type Step = 'contact' | 'otp';

export default function SignUpOTPScreen() {
  const { colors, isDark } = useThemeColors();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<Step>('contact');
  
  const [name, setName] = useState('');
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

  const isContactValid = () => {
    return isEmailValid(email);
  };

  async function handleSendCode() {
    if (!isEmailValid(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const result = await otpService.sendSignUpCode({
        name: normalizePersonName(name) || undefined,
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
      const result = await otpService.verifySignUpCode({
        name: normalizePersonName(name) || undefined,
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
      const result = await otpService.sendSignUpCode({
        name: normalizePersonName(name) || undefined,
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
    <View style={styles.stepContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <LinearGradient
            colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22C55E', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}>
            <IconSymbol name="person.badge.plus" size={32} color="#fff" />
          </LinearGradient>
        </Animated.View>
        <Text style={[styles.title, { color: isDark ? '#fff' : colors.text }]}>
          Create account
        </Text>
        <Text style={[styles.subtitle, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
          Join Vasuli to split expenses with friends. Your email keeps your profile recognizable.
        </Text>
      </View>

      {/* Name Input */}
      <View style={styles.inputSection}>
        <Text style={[styles.inputLabel, { color: isDark ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
          Your name (optional)
        </Text>
        <View style={[
          styles.inputContainer,
          { 
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.08)',
            borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
          },
        ]}>
          <IconSymbol name="person.fill" size={20} color={isDark ? '#2DD4BF' : '#22C55E'} />
          <TextInput
            style={[styles.input, { color: isDark ? '#fff' : colors.text }]}
            placeholder="How friends will see you"
            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Email Input */}
      <View style={styles.inputSection}>
        <Text style={[styles.inputLabel, { color: isDark ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
          Email address *
        </Text>
        <View style={[
          styles.inputContainer,
          { 
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.08)',
            borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
          },
        ]}>
          <IconSymbol
            name="envelope.fill"
            size={20}
            color={isDark ? '#2DD4BF' : '#22C55E'}
          />
          <TextInput
            style={[styles.input, { color: isDark ? '#fff' : colors.text }]}
            placeholder="you@example.com"
            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
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
          pressed && styles.buttonPressed,
          (loading || !isContactValid()) && styles.buttonDisabled,
        ]}>
        <LinearGradient
          colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22C55E', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.buttonGradient}>
          {loading ? (
            <Text style={styles.buttonText}>Sending code...</Text>
          ) : (
            <>
              <Text style={styles.buttonText}>Continue</Text>
              <IconSymbol name="arrow.right" size={18} color="#fff" />
            </>
          )}
        </LinearGradient>
      </Pressable>

      <View style={styles.oauthDivider}>
        <View style={[styles.oauthDividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#E5E7EB' }]} />
        <Text style={[styles.oauthDividerText, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary }]}>or</Text>
        <View style={[styles.oauthDividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#E5E7EB' }]} />
      </View>

      <Pressable
        testID="google-sign-up-button"
        onPress={handleGoogleSignIn}
        disabled={loading}
        style={({ pressed }) => [
          styles.googleButton,
          { borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#fff' },
          pressed && styles.buttonPressed,
          loading && styles.buttonDisabled,
        ]}>
        <View style={styles.googleMark}>
          <Text style={styles.googleMarkText}>G</Text>
        </View>
        <Text style={[styles.googleButtonText, { color: isDark ? '#fff' : colors.text }]}>Continue with Google</Text>
      </Pressable>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary }]}>
          Already have an account?{' '}
        </Text>
        <Link href="/sign-in-otp" asChild>
          <Pressable>
            <Text style={[styles.footerLink, { color: isDark ? '#2DD4BF' : '#22C55E' }]}>
              Sign in
            </Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );

  const renderOTPStep = () => (
    <View style={styles.otpContainer}>
      {/* Fixed Back Button */}
      <Pressable 
        onPress={() => setStep('contact')} 
        style={[styles.backButton, { 
          backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
          borderColor: isDark ? 'rgba(45, 212, 191, 0.4)' : 'rgba(34, 197, 94, 0.3)',
        }]}>
        <IconSymbol name="chevron.left" size={20} color={isDark ? '#2DD4BF' : '#22C55E'} />
      </Pressable>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.stepContainer}>

        {/* Header */}
        <View style={styles.otpHeader}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <LinearGradient
              colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22C55E', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconGradient}>
              <IconSymbol name="lock.fill" size={32} color="#fff" />
            </LinearGradient>
          </Animated.View>
          <Text style={[styles.title, { color: isDark ? '#fff' : colors.text }]}>
            Enter verification code
          </Text>
          <Text style={[styles.subtitle, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
            {"We've sent a 6-digit code to"}
          </Text>
          <Text style={[styles.contactHighlight, { color: isDark ? '#fff' : colors.text }]}>
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
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    borderColor: digit
                    ? (isDark ? '#2DD4BF' : '#22C55E')
                    : (isDark ? '#374151' : '#E2E8F0'),
                    color: isDark ? '#fff' : colors.text,
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
              <Text style={[styles.resendTimer, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary }]}>
                Resend code in {resendTimer}s
              </Text>
            ) : (
              <Pressable onPress={handleResendCode} disabled={loading}>
                <Text style={[styles.resendLink, { color: isDark ? '#2DD4BF' : '#22C55E' }]}>
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
            pressed && styles.buttonPressed,
            (loading || otp.join('').length !== 6) && styles.buttonDisabled,
          ]}>
          <LinearGradient
            colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22C55E', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}>
            {loading ? (
              <Text style={styles.buttonText}>Creating account...</Text>
            ) : (
              <>
                <Text style={styles.buttonText}>Create Account</Text>
                <IconSymbol name="checkmark" size={18} color="#fff" />
              </>
            )}
          </LinearGradient>
        </Pressable>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <LinearGradient
        colors={isDark ? ['#0F172A', '#1E1B4B', '#0F172A'] : ['#F8FAFC', '#EEF2FF', '#F8FAFC']}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating Orbs */}
      <Animated.View
        style={[
          styles.orb,
          styles.orb1,
          {
            backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(99, 102, 241, 0.1)',
            transform: [{ translateY: floatTranslate }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.orb2,
          {
            backgroundColor: isDark ? 'rgba(236, 72, 153, 0.1)' : 'rgba(244, 114, 182, 0.08)',
            transform: [{ translateY: Animated.multiply(floatTranslate, -1) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.orb3,
          {
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.08)' : 'rgba(34, 197, 94, 0.06)',
            transform: [{ translateY: floatTranslate }],
          },
        ]}
      />

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
  stepContainer: {
    width: '100%',
    paddingTop: 80,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  toggleButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  toggleButtonInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 0,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 24,
  },
  oauthDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
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
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1.5,
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
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 54,
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
