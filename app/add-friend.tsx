import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { initDatabase } from '@/services/api';
import { invitationService } from '@/services/invitation-service';
import { isEmailValid } from '@/utils/validation';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function AddFriendScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);

  useEffect(() => {
    loadPendingInvites();
  }, []);

  async function loadPendingInvites() {
    try {
      const invites = await invitationService.getByInviter(currentUserId);
      setPendingInvites(invites.filter(inv => inv.status === 'pending'));
    } catch (error) {
      console.error('Error loading pending invites:', error);
    }
  }

  async function handleDeleteInvite(inviteId: string) {
    Alert.alert(
      'Cancel Invite',
      'Are you sure you want to cancel this invitation?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await invitationService.delete(inviteId);
              loadPendingInvites();
            } catch (error) {
              console.error('Error deleting invite:', error);
              Alert.alert('Error', 'Failed to cancel invite');
            }
          }
        }
      ]
    );
  }

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Input refs for focus management
  const nameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);

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

  const isValid = isEmailValid(email);

  async function handleSubmit() {
    if (!currentUserId) {
      Alert.alert('Error', 'You must be signed in to send an invitation.');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    if (!isEmailValid(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await initDatabase();

      const friendEmail = email.trim();
      const friendName = name.trim() || friendEmail.split('@')[0];

      await invitationService.create({
        inviterId: currentUserId,
        inviteeEmail: friendEmail,
        inviteeName: friendName,
        inviterName: user?.name || 'A friend',
      });

      Alert.alert(
        'Invite Sent!',
        `An invitation has been sent to ${friendName}. They'll appear in your friends list once they accept.`,
        [{
          text: 'OK', onPress: () => {
            // Stay on screen to see the new invite in list?
            // Or go back? User flow typically implies "I'm done".
            // But if they want to add another... let's keep them here.
            // Wait, earlier code had router.back().
            // Let's reload list and then decide.
            loadPendingInvites();
            setEmail('');
            setName('');
            router.back();
          }
        }]
      );
    } catch (error: any) {
      console.error('Error adding friend:', error);

      // Handle specific error cases
      let errorMessage = 'Failed to send invite';

      if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
        errorMessage = 'You have already sent an invitation to this email address.';
      } else if (error?.message) {
        errorMessage = error.message;
      }

      Alert.alert('Error', errorMessage);
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

      <NavigationHeader
        title="Invite Friend"
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
                Send
              </ThemedText>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
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
            <ThemedText style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
              Split expenses and settle up easily
            </ThemedText>
          </View>

          {/* Name Input */}
          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Name (Optional)
            </ThemedText>
            <View style={[styles.inputContainer, {
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            }]}>
              <IconSymbol name="person" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
              <TextInput
                ref={nameInputRef}
                style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. John Doe"
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                returnKeyType="next"
                onSubmitEditing={() => emailInputRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          <View style={styles.inputSection}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Email Address *
            </ThemedText>
            <View style={[styles.inputContainer, {
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            }]}>
              <IconSymbol name="envelope" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
              <TextInput
                ref={emailInputRef}
                style={[styles.textInput, { color: isDark ? '#fff' : colors.text }]}
                value={email}
                onChangeText={setEmail}
                placeholder="friend@example.com"
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="done"
                autoCorrect={false}
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>
          </View>

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
              <ThemedText style={[styles.qrTitle, { color: colors.text }]}>
                Scan QR Code
              </ThemedText>
              <ThemedText style={[styles.qrSubtitle, { color: colors.textSecondary }]}>
                Instantly connect with nearby friends
              </ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={16} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
          </TouchableOpacity>

          {/* Info Card */}
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={styles.infoCard}>
            <View style={[styles.infoContent, !isDark && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
              <IconSymbol name="lock.shield" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
              <ThemedText style={[styles.infoText, { color: colors.textSecondary }]}>
                We&apos;ll send them an invite to join Vasuli. Your contact info stays private.
              </ThemedText>
            </View>
          </BlurView>

          {/* Pending Invites Section */}
          {pendingInvites.length > 0 && (
            <View style={styles.pendingSection}>
              <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
                Pending Invites
              </ThemedText>
              {pendingInvites.map((invite) => (
                <View key={invite.id} style={[styles.pendingItem, {
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'white',
                  borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(0,0,0,0.05)'
                }]}>
                  <View style={styles.pendingInfo}>
                    <ThemedText style={[styles.pendingName, { color: colors.text }]}>
                      {invite.inviteeName || invite.inviteeEmail}
                    </ThemedText>
                    <ThemedText style={[styles.pendingEmail, { color: colors.textSecondary }]}>
                      {invite.inviteeEmail}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteInvite(invite.id)}
                    style={[styles.revokeButton, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2' }]}
                  >
                    <ThemedText style={[styles.revokeText, { color: isDark ? '#ef4444' : '#dc2626' }]}>
                      Revoke
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

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
  pendingSection: {
    marginTop: 32,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  pendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  pendingInfo: {
    flex: 1,
    marginRight: 12,
  },
  pendingName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  pendingEmail: {
    fontSize: 14,
  },
  revokeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  revokeText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
