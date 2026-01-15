import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { otpService } from '@/services/otp-service';
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

type ContactMethod = 'email' | 'phone';
type Step = 'contact' | 'otp';

export default function SignInOTPScreen() {
  const { colors, isDark } = useThemeColors();
  const [step, setStep] = useState<Step>('contact');
  const [contactMethod, setContactMethod] = useState<ContactMethod>('email');
  
  // Contact info
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  
  // OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpInputs = useRef<(TextInput | null)[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

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

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const floatTranslate = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -15],
  });

  const isContactValid = () => {
    if (contactMethod === 'email') {
      return email.trim().includes('@');
    } else {
      return phone.trim().length >= 10;
    }
  };

  async function handleSendCode() {
    if (!isContactValid()) {
      Alert.alert('Error', 'Please enter a valid ' + contactMethod);
      return;
    }

    setLoading(true);
    try {
      const result = await otpService.sendSignInCode({
        email: contactMethod === 'email' ? email.trim() : undefined,
        phone: contactMethod === 'phone' ? phone.trim() : undefined,
      });

      if (result.success) {
        setStep('otp');
        setResendTimer(60);
        setTimeout(() => otpInputs.current[0]?.focus(), 100);
      } else {
        Alert.alert('Error', result.error || 'Failed to send verification code');
      }
    } catch {
      Alert.alert('Error', 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    const code = otp.join('');
    if (code.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const result = await otpService.verifySignInCode({
        email: contactMethod === 'email' ? email.trim() : undefined,
        phone: contactMethod === 'phone' ? phone.trim() : undefined,
        code,
      });

      if (result.success && result.session) {
        router.replace('/(tabs)');
      } else {
        Alert.alert('Error', result.error || 'Invalid verification code');
        setOtp(['', '', '', '', '', '']);
        otpInputs.current[0]?.focus();
      }
    } catch {
      Alert.alert('Error', 'Failed to verify code');
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
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
        email: contactMethod === 'email' ? email.trim() : undefined,
        phone: contactMethod === 'phone' ? phone.trim() : undefined,
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
    <>
      {/* Contact Method Toggle */}
      <View style={styles.methodToggle}>
        <Pressable
          onPress={() => setContactMethod('email')}
          style={[
            styles.methodButton,
            contactMethod === 'email' && styles.methodButtonActive,
            {
              backgroundColor: contactMethod === 'email'
                ? (isDark ? '#2DD4BF' : '#22C55E')
                : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
            },
          ]}>
          <IconSymbol
            name="envelope.fill"
            size={18}
            color={contactMethod === 'email' ? '#0A0A0F' : (isDark ? '#2DD4BF' : '#22C55E')}
          />
          <Text style={[
            styles.methodButtonText,
            contactMethod === 'email' && styles.methodButtonTextActive,
          ]}>
            Email
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setContactMethod('phone')}
          style={[
            styles.methodButton,
            contactMethod === 'phone' && styles.methodButtonActive,
            {
              backgroundColor: contactMethod === 'phone'
                ? (isDark ? '#2DD4BF' : '#22C55E')
                : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
            },
          ]}>
          <IconSymbol
            name="phone.fill"
            size={18}
            color={contactMethod === 'phone' ? '#0A0A0F' : (isDark ? '#2DD4BF' : '#22C55E')}
          />
          <Text style={[
            styles.methodButtonText,
            contactMethod === 'phone' && styles.methodButtonTextActive,
          ]}>
            Phone
          </Text>
        </Pressable>
      </View>

      {/* Email/Phone Input */}
      {contactMethod === 'email' ? (
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
            />
          </View>
        </View>
      ) : (
        <View style={styles.inputWrapper}>
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: focusedField === 'phone'
                  ? (isDark ? '#2DD4BF' : '#22C55E')
                  : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
              },
            ]}>
            <IconSymbol
              name="phone.fill"
              size={18}
              color={focusedField === 'phone' ? (isDark ? '#2DD4BF' : '#22C55E') : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')}
            />
            <TextInput
              style={[styles.input, { color: isDark ? '#fff' : colors.text }]}
              placeholder="Phone number"
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
              value={phone}
              onChangeText={setPhone}
              onFocus={() => setFocusedField('phone')}
              onBlur={() => setFocusedField(null)}
              keyboardType="phone-pad"
            />
          </View>
        </View>
      )}

      {/* Continue Button */}
      <Pressable
        onPress={handleSendCode}
        disabled={loading || !isContactValid()}
        style={({ pressed }) => [
          styles.continueButton,
          pressed && styles.continueButtonPressed,
        ]}>
        <LinearGradient
          colors={isDark ? ['#8B5CF6', '#6366F1'] : ['#3B82F6', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.continueButtonGradient, (loading || !isContactValid()) && styles.continueButtonDisabled]}>
          {loading ? (
            <Text style={styles.continueButtonText}>Sending code...</Text>
          ) : (
            <>
              <Text style={styles.continueButtonText}>Continue</Text>
              <IconSymbol name="arrow.right" size={18} color="#fff" />
            </>
          )}
        </LinearGradient>
      </Pressable>

      {/* Info */}
      <Text style={[styles.infoText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
        {`We'll send you a 6-digit code to verify your ${contactMethod}`}
      </Text>
    </>
  );

  const renderOTPStep = () => (
    <>
      {/* Back Button */}
      <Pressable onPress={() => setStep('contact')} style={styles.backButton}>
        <IconSymbol name="chevron.left" size={20} color={isDark ? '#2DD4BF' : '#22C55E'} />
        <Text style={[styles.backButtonText, { color: isDark ? '#2DD4BF' : '#22C55E' }]}>
          Change {contactMethod}
        </Text>
      </Pressable>

      {/* Info */}
      <Text style={[styles.otpInfo, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
        Enter the 6-digit code sent to
      </Text>
      <Text style={[styles.otpContact, { color: isDark ? '#fff' : colors.text }]}>
        {contactMethod === 'email' ? email : phone}
      </Text>

      {/* OTP Input */}
      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={ref => { otpInputs.current[index] = ref; }}
            style={[
              styles.otpInput,
              {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: digit
                  ? (isDark ? '#2DD4BF' : '#22C55E')
                  : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                color: isDark ? '#fff' : colors.text,
              },
            ]}
            value={digit}
            onChangeText={(value) => handleOtpChange(index, value)}
            onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
          />
        ))}
      </View>

      {/* Resend */}
      <View style={styles.resendContainer}>
        {resendTimer > 0 ? (
          <Text style={[styles.resendText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
            Resend code in {resendTimer}s
          </Text>
        ) : (
          <Pressable onPress={handleResendCode} disabled={loading}>
            <Text style={[styles.resendLink, { color: isDark ? '#8B5CF6' : '#6366F1' }]}>
              Resend code
            </Text>
          </Pressable>
        )}
      </View>

      {/* Verify Button */}
      <Pressable
        onPress={handleVerifyCode}
        disabled={loading || otp.join('').length !== 6}
        style={({ pressed }) => [
          styles.verifyButton,
          pressed && styles.verifyButtonPressed,
        ]}>
        <LinearGradient
          colors={isDark ? ['#8B5CF6', '#6366F1'] : ['#3B82F6', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.verifyButtonGradient, (loading || otp.join('').length !== 6) && styles.verifyButtonDisabled]}>
          {loading ? (
            <Text style={styles.verifyButtonText}>Signing in...</Text>
          ) : (
            <>
              <Text style={styles.verifyButtonText}>Sign In</Text>
              <IconSymbol name="arrow.right.circle.fill" size={18} color="#fff" />
            </>
          )}
        </LinearGradient>
      </Pressable>
    </>
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
                <IconSymbol name="arrow.right.circle.fill" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={[styles.appName, { color: isDark ? '#fff' : colors.text }]}>
              {step === 'contact' ? 'Welcome Back' : 'Verify Your Account'}
            </Text>
            <Text style={[styles.tagline, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
              {step === 'contact' ? 'Sign in to continue' : 'Enter the code we sent you'}
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
                {step === 'contact' ? renderContactStep() : renderOTPStep()}
              </View>
            </BlurView>
          </Animated.View>

          {/* Footer */}
          <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
            <Text style={[styles.footerText, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textSecondary }]}>
              {"Don't have an account? "}
            </Text>
            <Link href="/sign-up-otp" asChild>
              <Pressable>
                <Text style={[styles.linkText, { color: isDark ? '#8B5CF6' : '#6366F1' }]}>
                  Sign up
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
  methodToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  methodButtonActive: {},
  methodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2DD4BF',
  },
  methodButtonTextActive: {
    color: '#0A0A0F',
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    gap: 12,
    shadowColor: '#2DD4BF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlignVertical: 'center',
    paddingVertical: 0,
    letterSpacing: 0.3,
  },
  continueButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 12,
  },
  continueButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  continueButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  otpInfo: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  otpContact: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  otpInput: {
    width: 52,
    height: 64,
    borderRadius: 16,
    borderWidth: 2.5,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    shadowColor: '#2DD4BF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  resendContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '500',
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  verifyButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  verifyButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  verifyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
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
