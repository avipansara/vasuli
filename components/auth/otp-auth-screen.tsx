/* eslint-disable react-hooks/refs -- OTP focus is advanced from native input events, not during render. */
import { parseCompleteOtp } from '@/components/auth/otp-code';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { PENDING_INVITE_PATH_KEY } from '@/lib/invite-deeplink';
import { otpService } from '@/services/otp-service';
import {
  isEmailValid,
  normalizeEmail,
  normalizePersonName,
} from '@/utils/validation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
  Animated,
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

type Step = 'contact' | 'otp';
type IconName = ComponentProps<typeof IconSymbol>['name'];
export type OTPAuthVariant = 'sign-in' | 'sign-up';
const EMPTY_OTP = ['', '', '', '', '', ''];

const variantConfig = {
  'sign-in': {
    icon: 'person' as IconName,
    title: 'Welcome back',
    subtitle: 'Sign in to continue to Vasuli',
    footerText: 'Don’t have an account? ',
    footerLink: 'Sign up',
    footerHref: '/sign-up-otp' as const,
    googleTestID: 'google-sign-in-button',
    verifyTestID: 'sign-in-button',
    verifyText: 'Verify & Sign In',
    loadingText: 'Verifying...',
    invalidEmailMessage: 'Please enter a valid email address',
    sendCode: (email?: string) => otpService.sendSignInCode({ email }),
    verifyCode: (email: string | undefined, code: string) =>
      otpService.verifySignInCode({ email, code }),
    resendCode: (email?: string) => otpService.sendSignInCode({ email }),
  },
  'sign-up': {
    icon: 'person.badge.plus' as IconName,
    title: 'Create account',
    subtitle:
      'Join Vasuli to split expenses with friends. Your email keeps your profile recognizable.',
    footerText: 'Already have an account? ',
    footerLink: 'Sign in',
    footerHref: '/sign-in-otp' as const,
    googleTestID: 'google-sign-up-button',
    verifyTestID: 'create-account-button',
    verifyText: 'Create account',
    loadingText: 'Creating account...',
    invalidEmailMessage: 'Please enter a valid email address.',
    sendCode: (email?: string, name?: string) =>
      otpService.sendSignUpCode({ name, email }),
    verifyCode: (email: string | undefined, code: string, name?: string) =>
      otpService.verifySignUpCode({ name, email, code }),
    resendCode: (email?: string, name?: string) =>
      otpService.sendSignUpCode({ name, email }),
  },
} as const;

export function OTPAuthScreen({ variant }: { variant: OTPAuthVariant }) {
  const config = variantConfig[variant];
  const isSignUp = variant === 'sign-up';
  const { colors, isDark } = useThemeColors();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<Step>('contact');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(EMPTY_OTP);
  const otpInputs = useRef<(TextInput | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));
  const [floatAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const entranceAnimation = Animated.parallel([
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
    ]);
    entranceAnimation.start();

    if (!isSignUp) {
      return () => entranceAnimation.stop();
    }

    const floatAnimation = Animated.loop(
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
      ]),
    );
    const pulseAnimation = Animated.loop(
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
      ]),
    );
    floatAnimation.start();
    pulseAnimation.start();

    return () => {
      entranceAnimation.stop();
      floatAnimation.stop();
      pulseAnimation.stop();
    };
  }, [fadeAnim, slideAnim, floatAnim, pulseAnim, isSignUp]);
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const normalizedName = normalizePersonName(name);
  const isContactValid = isSignUp
    ? !!normalizedName && isEmailValid(email)
    : isEmailValid(email);
  const sendCode = (targetEmail: string) =>
    config.sendCode(
      normalizeEmail(targetEmail),
      isSignUp ? normalizedName || undefined : undefined,
    );

  async function redirectAfterAuth(delay = false) {
    await refreshUser();
    const pendingInvite = await AsyncStorage.getItem(PENDING_INVITE_PATH_KEY);
    await AsyncStorage.removeItem(PENDING_INVITE_PATH_KEY);
    const redirect = () => router.replace((pendingInvite || '/(tabs)') as Href);
    if (delay) setTimeout(redirect, 100);
    else redirect();
  }
  async function handleSendCode() {
    if (isSignUp && !normalizedName) {
      Alert.alert('Name Required', 'Please enter your name.');
      return;
    }
    if (!isEmailValid(email)) {
      Alert.alert('Invalid Email', config.invalidEmailMessage);
      return;
    }
    setLoading(true);
    try {
      const result = await sendCode(email);
      if (result.success) {
        setStep('otp');
        setResendTimer(60);
        setTimeout(() => otpInputs.current[0]?.focus(), 100);
      } else Alert.alert('Error', result.error || 'Failed to send code');
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
        if (result.error !== 'Google sign-in was cancelled')
          Alert.alert(
            'Google sign-in failed',
            result.error || 'Please try again.',
          );
        return;
      }
      await redirectAfterAuth();
    } catch {
      Alert.alert(
        'Google sign-in failed',
        'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }
  async function handleVerifyCode(codeOverride?: string) {
    const code = codeOverride ?? otp.join('');
    if (code.length !== EMPTY_OTP.length) return;
    setLoading(true);
    try {
      const result = await config.verifyCode(
        normalizeEmail(email),
        code,
        isSignUp ? normalizedName || undefined : undefined,
      );
      if (result.success) await redirectAfterAuth(true);
      else {
        Alert.alert('Error', result.error || 'Invalid code');
        setOtp(EMPTY_OTP);
        otpInputs.current[0]?.focus();
      }
    } catch {
      Alert.alert('Error', 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  function handleOtpChange(index: number, input: string) {
    if (input.length >= EMPTY_OTP.length || (index === 0 && input.length > 1)) {
      const pastedOtp = parseCompleteOtp(input);
      if (pastedOtp) {
        const code = pastedOtp.join('');
        setOtp(pastedOtp);
        setTimeout(() => {
          otpInputs.current[EMPTY_OTP.length - 1]?.focus();
          void handleVerifyCode(code);
        }, 100);
        return;
      }
    }

    const value = input.length > 1 ? input[input.length - 1] : input;
    const nextOtp = [...otp];
    nextOtp[index] = value;
    setOtp(nextOtp);

    if (value && index < EMPTY_OTP.length - 1) {
      otpInputs.current[index + 1]?.focus();
    }

    if (nextOtp.every(Boolean)) {
      const code = nextOtp.join('');
      setTimeout(() => void handleVerifyCode(code), 300);
    }
  }
  function handleOtpKeyPress(index: number, key: string) {
    if (key === 'Backspace' && !otp[index] && index > 0)
      otpInputs.current[index - 1]?.focus();
  }
  async function handleResendCode() {
    if (resendTimer > 0) return;
    setLoading(true);
    try {
      const result = await config.resendCode(
        normalizeEmail(email),
        isSignUp ? normalizedName || undefined : undefined,
      );
      if (result.success) {
        setResendTimer(60);
        setOtp(EMPTY_OTP);
        Alert.alert('Success', 'New code sent!');
      } else Alert.alert('Error', result.error || 'Failed to resend code');
    } catch {
      Alert.alert('Error', 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  }

  const themedText = { color: isDark ? '#ffffff' : colors.text };
  const mutedText = {
    color: isDark ? 'rgba(255,255,255,0.65)' : colors.textSecondary,
  };
  const baseAccent = isDark ? '#2DD4BF' : '#0F4C3A';
  const otpAccent = isDark ? '#2DD4BF' : isSignUp ? '#22C55E' : baseAccent;
  const contactInputBackground = isDark ? 'rgba(15, 31, 34, 0.6)' : '#ffffff';
  const otpInputBackground = isDark
    ? isSignUp
      ? '#1E293B'
      : 'rgba(15, 31, 34, 0.6)'
    : isSignUp
      ? '#F8FAFC'
      : '#ffffff';
  const emptyOtpBorder =
    isDark && isSignUp
      ? '#374151'
      : isDark
        ? 'rgba(45, 212, 191, 0.2)'
        : '#E2E8F0';
  const renderIcon = (name: IconName) =>
    isSignUp && name === 'lock.fill' ? (
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <LinearGradient
          colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22C55E', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}
        >
          <IconSymbol name={name} size={32} color="#fff" />
        </LinearGradient>
      </Animated.View>
    ) : (
      <View
        style={[
          styles.iconBox,
          { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : '#0F4C3A' },
        ]}
      >
        <IconSymbol
          name={name}
          size={30}
          color={isDark ? '#2DD4BF' : '#ffffff'}
        />
      </View>
    );
  const input = (
    label: string,
    icon: IconName,
    value: string,
    onChangeText: (value: string) => void,
    placeholder: string,
    keyboardType?: 'email-address',
  ) => (
    <View style={[styles.inputSection, !isSignUp && styles.signInInputSection]}>
      <Text
        style={[
          styles.inputLabel,
          { color: isDark ? 'rgba(255,255,255,0.85)' : '#334155' },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: contactInputBackground,
            borderColor: isDark ? 'rgba(45, 212, 191, 0.25)' : '#E2E8F0',
          },
        ]}
      >
        <IconSymbol
          name={icon}
          size={18}
          color={isDark ? '#2DD4BF' : '#0F4C3A'}
        />
        <TextInput
          style={[styles.input, themedText]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType ? 'none' : 'words'}
          autoCorrect={false}
        />
      </View>
    </View>
  );
  const button = (
    text: string,
    onPress: () => void,
    disabled: boolean,
    icon: IconName,
    testID?: string,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ busy: loading, disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.primaryButton,
        isSignUp && styles.signUpPrimaryButton,
        { backgroundColor: isDark ? '#0D9488' : '#0F4C3A' },
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <Text style={styles.buttonText}>{text}</Text>
      ) : (
        <View style={styles.buttonContentRow}>
          <Text style={styles.buttonText}>{text}</Text>
          <IconSymbol name={icon} size={18} color="#ffffff" />
        </View>
      )}
    </Pressable>
  );

  const contactStep = (
    <View>
      <View style={styles.header}>
        {renderIcon(config.icon)}
        <Text style={[styles.title, themedText]}>{config.title}</Text>
        <Text style={[styles.subtitle, mutedText]}>{config.subtitle}</Text>
      </View>
      {isSignUp &&
        input(
          'Your name *',
          'person',
          name,
          setName,
          'How friends will see you',
        )}
      {input(
        isSignUp ? 'Email *' : 'Email',
        'envelope',
        email,
        setEmail,
        'you@example.com',
        'email-address',
      )}
      {button(
        loading ? 'Sending code...' : 'Continue',
        handleSendCode,
        loading || !isContactValid,
        'arrow.right',
      )}
      <View style={styles.oauthDivider}>
        <View
          style={[
            styles.oauthDividerLine,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0' },
          ]}
        />
        <Text style={[styles.oauthDividerText, mutedText]}>or</Text>
        <View
          style={[
            styles.oauthDividerLine,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0' },
          ]}
        />
      </View>
      <Pressable
        testID={config.googleTestID}
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
        ]}
      >
        <View style={styles.googleMark}>
          <Text style={styles.googleMarkText}>G</Text>
        </View>
        <Text style={[styles.googleButtonText, themedText]}>
          Continue with Google
        </Text>
      </Pressable>
      <View style={styles.footer}>
        <Text style={[styles.footerText, mutedText]}>{config.footerText}</Text>
        <Link href={config.footerHref} asChild>
          <Pressable>
            <Text style={[styles.footerLink, { color: baseAccent }]}>
              {config.footerLink}
            </Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
  const otpStep = (
    <View style={styles.otpContainer}>
      <Pressable
        onPress={() => setStep('contact')}
        style={[
          styles.backButton,
          {
            backgroundColor: isDark
              ? 'rgba(45, 212, 191, 0.15)'
              : isSignUp
                ? 'rgba(34, 197, 94, 0.1)'
                : 'rgba(15, 76, 58, 0.08)',
            borderColor: isDark
              ? 'rgba(45, 212, 191, 0.4)'
              : isSignUp
                ? 'rgba(34, 197, 94, 0.3)'
                : 'rgba(15, 76, 58, 0.2)',
          },
        ]}
      >
        <IconSymbol name="chevron.left" size={20} color={otpAccent} />
      </Pressable>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View>
          <View style={styles.otpHeader}>
            {renderIcon('lock.fill')}
            <Text style={[styles.title, themedText]}>
              Enter verification code
            </Text>
            <Text style={[styles.subtitle, mutedText]}>
              {isSignUp
                ? "We've sent a 6-digit code to"
                : 'We’ve sent a 6-digit code to'}
            </Text>
            <Text style={[styles.contactHighlight, { color: otpAccent }]}>
              {email}
            </Text>
          </View>
          <View style={styles.otpSection}>
            <View style={styles.otpRow}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    otpInputs.current[index] = ref;
                  }}
                  style={[
                    styles.otpInput,
                    {
                      backgroundColor: otpInputBackground,
                      borderColor: digit ? otpAccent : emptyOtpBorder,
                      color: isDark ? '#ffffff' : colors.text,
                    },
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(index, value)}
                  onKeyPress={({ nativeEvent }) =>
                    handleOtpKeyPress(index, nativeEvent.key)
                  }
                  keyboardType="number-pad"
                  maxLength={index === 0 ? 6 : 1}
                  selectTextOnFocus
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                />
              ))}
            </View>
            <View style={styles.resendRow}>
              {resendTimer > 0 ? (
                <Text style={[styles.resendTimer, mutedText]}>
                  Resend code in {resendTimer}s
                </Text>
              ) : (
                <Pressable onPress={handleResendCode} disabled={loading}>
                  <Text style={[styles.resendLink, { color: otpAccent }]}>
                    Resend code
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
          {button(
            loading ? config.loadingText : config.verifyText,
            () => void handleVerifyCode(),
            loading || otp.join('').length !== EMPTY_OTP.length,
            'checkmark',
            config.verifyTestID,
          )}
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {step === 'contact' ? contactStep : otpStep}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  iconBox: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconGradient: {
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
  inputSection: { marginBottom: 16 },
  signInInputSection: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
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
    textAlignVertical: 'center',
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  signUpPrimaryButton: { marginTop: 8 },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  oauthDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  oauthDividerLine: { flex: 1, height: 1 },
  oauthDividerText: { fontSize: 13, fontWeight: '600' },
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
  googleMarkText: { color: '#4285F4', fontSize: 17, fontWeight: '800' },
  googleButtonText: { fontSize: 15, fontWeight: '600' },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.5 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: { fontSize: 15, fontWeight: '400' },
  footerLink: { fontSize: 15, fontWeight: '600' },
  otpContainer: { flex: 1, justifyContent: 'center', width: '100%' },
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
  otpHeader: { alignItems: 'center', marginBottom: 40 },
  contactHighlight: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  otpSection: { marginBottom: 32 },
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
  resendRow: { alignItems: 'center' },
  resendTimer: { fontSize: 14, fontWeight: '500' },
  resendLink: { fontSize: 15, fontWeight: '600' },
});
