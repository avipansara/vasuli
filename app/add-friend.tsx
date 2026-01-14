import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { initDatabase, userService } from '@/services/api';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type InviteMethod = 'email' | 'phone' | 'qr';

export default function AddFriendScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteMethod, setInviteMethod] = useState<InviteMethod>('email');
  const [loading, setLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

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

  const isValid = inviteMethod === 'email' 
    ? email.trim().length > 0 
    : inviteMethod === 'phone' 
      ? phone.trim().length > 0 
      : false;

  async function handleSubmit() {
    if (!isValid) return;

    setLoading(true);
    try {
      await initDatabase();
      
      // Create a placeholder user for the friend
      const friendEmail = inviteMethod === 'email' ? email.trim() : `${phone.replace(/\D/g, '')}@phone.placeholder`;
      const friendName = name.trim() || (inviteMethod === 'email' ? email.split('@')[0] : phone);
      
      const newFriend = await userService.create({
        name: friendName,
        email: friendEmail,
      });

      Alert.alert(
        'Invite Sent!',
        `An invitation has been sent to ${friendName}. They'll appear in your friends list once they accept.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  }

  function handleScanQR() {
    router.push('/scan-qr');
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
          Add Friend
        </ThemedText>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAwareScroll
        contentContainerStyle={styles.scrollContent}
        footer={
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!isValid || loading}
            style={[styles.submitButton, (!isValid || loading) && styles.submitButtonDisabled]}>
            <LinearGradient
              colors={isValid ? (isDark ? ['#2DD4BF', '#22D3EE'] : ['#22C55E', '#10B981']) : ['#6B7280', '#4B5563']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitButtonGradient}>
              {loading ? (
                <ThemedText style={styles.submitButtonText}>Sending...</ThemedText>
              ) : (
                <>
                  <IconSymbol name="paperplane.fill" size={20} color="#fff" />
                  <ThemedText style={styles.submitButtonText}>Send Invite</ThemedText>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        }>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Hero Section */}
            <View style={styles.heroSection}>
              {/* <View style={[styles.heroIcon, {
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
              }]}>
                <IconSymbol name="person.badge.plus" size={48} color={isDark ? '#2DD4BF' : colors.tint} />
              </View>
              <ThemedText style={[styles.heroTitle, !isDark && { color: colors.text }]}>
                Invite a Friend
              </ThemedText> */}
              <ThemedText style={[styles.heroSubtitle, !isDark && { color: colors.textSecondary }]}>
                Split expenses and settle up easily
              </ThemedText>
            </View>

            {/* Method Selection */}
            <View style={styles.methodSection}>
              <View style={styles.methodToggle}>
                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    inviteMethod === 'email' && styles.methodButtonActive,
                    {
                      backgroundColor: inviteMethod === 'email'
                        ? (isDark ? '#2DD4BF' : colors.tint)
                        : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                      borderColor: inviteMethod === 'email'
                        ? (isDark ? '#2DD4BF' : colors.tint)
                        : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                    },
                  ]}
                  onPress={() => setInviteMethod('email')}>
                  <IconSymbol
                    name="envelope.fill"
                    size={20}
                    color={inviteMethod === 'email' ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                  />
                  <ThemedText style={[
                    styles.methodButtonText,
                    inviteMethod === 'email' && styles.methodButtonTextActive,
                    !isDark && inviteMethod !== 'email' && { color: colors.text },
                  ]}>
                    Email
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    inviteMethod === 'phone' && styles.methodButtonActive,
                    {
                      backgroundColor: inviteMethod === 'phone'
                        ? (isDark ? '#2DD4BF' : colors.tint)
                        : (isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'),
                      borderColor: inviteMethod === 'phone'
                        ? (isDark ? '#2DD4BF' : colors.tint)
                        : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                    },
                  ]}
                  onPress={() => setInviteMethod('phone')}>
                  <IconSymbol
                    name="phone.fill"
                    size={20}
                    color={inviteMethod === 'phone' ? '#0A0A0F' : (isDark ? '#2DD4BF' : colors.tint)}
                  />
                  <ThemedText style={[
                    styles.methodButtonText,
                    inviteMethod === 'phone' && styles.methodButtonTextActive,
                    !isDark && inviteMethod !== 'phone' && { color: colors.text },
                  ]}>
                    Phone
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Name Input */}
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                Name (Optional)
              </ThemedText>
              <View style={[styles.inputContainer, {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              }]}>
                <IconSymbol name="person" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
                <TextInput
                  style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. John Doe"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                />
              </View>
            </View>

            {/* Email/Phone Input */}
            {inviteMethod === 'email' ? (
              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                  Email Address *
                </ThemedText>
                <View style={[styles.inputContainer, {
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                  borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                }]}>
                  <IconSymbol name="envelope" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
                  <TextInput
                    style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="friend@example.com"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                  />
                </View>
              </View>
            ) : (
              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, !isDark && { color: colors.textSecondary }]}>
                  Phone Number *
                </ThemedText>
                <View style={[styles.inputContainer, {
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                  borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                }]}>
                  <IconSymbol name="phone" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
                  <TextInput
                    style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+1 (555) 123-4567"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                    keyboardType="phone-pad"
                    autoFocus
                  />
                </View>
              </View>
            )}

            {/* QR Code Option */}
            <TouchableOpacity
              style={[styles.qrButton, {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              }]}
              onPress={handleScanQR}>
              <View style={[styles.qrIconContainer, {
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
              }]}>
                <IconSymbol name="qrcode.viewfinder" size={24} color={isDark ? '#2DD4BF' : colors.tint} />
              </View>
              <View style={styles.qrTextContainer}>
                <ThemedText style={[styles.qrTitle, !isDark && { color: colors.text }]}>
                  Scan QR Code
                </ThemedText>
                <ThemedText style={[styles.qrSubtitle, !isDark && { color: colors.textSecondary }]}>
                  Instantly connect with nearby friends
                </ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={16} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
            </TouchableOpacity>

            {/* Info Card */}
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={styles.infoCard}>
              <View style={[styles.infoContent, !isDark && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
                <IconSymbol name="lock.shield" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
                <ThemedText style={[styles.infoText, !isDark && { color: colors.textSecondary }]}>
                  We&apos;ll send them an invite to join Vasuli. Your contact info stays private.
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  heroIcon: {
    width: 100,
    height: 100,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    opacity: 0.7,
  },
  methodSection: {
    marginBottom: 24,
  },
  methodToggle: {
    flexDirection: 'row',
    gap: 12,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  methodButtonActive: {
    borderWidth: 2,
  },
  methodButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  methodButtonTextActive: {
    color: '#0A0A0F',
  },
  inputSection: {
    marginBottom: 20,
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
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
    gap: 14,
  },
  qrIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrTextContainer: {
    flex: 1,
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  qrSubtitle: {
    fontSize: 13,
    opacity: 0.7,
  },
  infoCard: {
    borderRadius: 14,
    overflow: 'hidden',
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
