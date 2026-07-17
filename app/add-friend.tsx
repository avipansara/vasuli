import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { buildInvitePath } from '@/lib/invite-deeplink';
import { initDatabase } from '@/services/api';
import { invitationService } from '@/services/invitation-service';
import { userService } from '@/services/user-service';
import type { User } from '@/types/database';
import { isEmailValid, normalizeEmail } from '@/utils/validation';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type LookupState = 'idle' | 'checking' | 'found' | 'not-found' | 'error';

export default function AddFriendScreen() {
  const { colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';
  const [email, setEmail] = useState('');
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [matchedUser, setMatchedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultOpacity] = useState(() => new Animated.Value(0));

  const palette = isDark
    ? {
        accent: '#2DD4BF',
        background: '#071416',
        surface: 'rgba(20, 38, 42, 0.86)',
        surfaceSoft: 'rgba(15, 31, 34, 0.84)',
        border: 'rgba(45, 212, 191, 0.22)',
        text: '#F4F7F7',
        muted: '#A1AFB2',
        privacyText: '#C3D0D0',
        privacySurface: 'rgba(12, 46, 45, 0.78)',
        iconSurface: 'rgba(45, 212, 191, 0.13)',
        resultBorder: 'rgba(45, 212, 191, 0.3)',
      }
    : {
        accent: colors.tint,
        background: colors.background,
        surface: 'rgba(255, 255, 255, 0.94)',
        surfaceSoft: 'rgba(248, 250, 250, 0.96)',
        border: 'rgba(15, 157, 141, 0.24)',
        text: colors.text,
        muted: colors.textSecondary,
        privacyText: '#395250',
        privacySurface: 'rgba(224, 246, 242, 0.96)',
        iconSurface: 'rgba(15, 157, 141, 0.1)',
        resultBorder: 'rgba(15, 157, 141, 0.3)',
      };

  const validEmail = isEmailValid(email);

  useEffect(() => {
    const normalized = normalizeEmail(email);
    if (!normalized || !isEmailValid(normalized)) {
      resultOpacity.setValue(0);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLookupState('checking');
      try {
        const found = await userService.getByEmail(normalized);
        if (cancelled) return;
        setMatchedUser(found);
        setLookupState(found ? 'found' : 'not-found');
        Animated.timing(resultOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      } catch {
        if (!cancelled) setLookupState('error');
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, resultOpacity]);

  function handleEmailChange(value: string) {
    setEmail(value);
    // Clear the previous result immediately. This prevents an earlier email's
    // account from being shown while the new email is being checked.
    setLookupState('idle');
    setMatchedUser(null);
    resultOpacity.setValue(0);
  }

  async function handlePrimaryAction() {
    const normalized = normalizeEmail(email);
    if (!currentUserId || !normalized || !validEmail) {
      Alert.alert('Enter a valid email', 'Use an email address to check whether they already use Vasuli.');
      return;
    }
    if (lookupState !== 'found' && lookupState !== 'not-found') {
      Alert.alert('Still checking', 'Wait for Vasuli to finish checking this email.');
      return;
    }

    setLoading(true);
    try {
      await initDatabase();
      const result = await invitationService.sendRequestOrInvitation({
        inviterId: currentUserId,
        inviteeEmail: normalized,
        inviterName: user?.name || 'A friend',
      });
      Alert.alert(
        result.type === 'friend_request' ? 'Friend request sent' : 'Invite sent',
        result.type === 'friend_request'
          ? `${matchedUser?.name || 'Your friend'} can accept your request from Invitations.`
          : `An invite was sent to ${normalized}.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (error: any) {
      Alert.alert('Couldn’t complete this', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleShareInvite() {
    if (!currentUserId) return;
    try {
      await Share.share({
        title: 'Invite to Vasuli',
        message: `Join me on Vasuli to split expenses: https://split-space.com${buildInvitePath(currentUserId)}`,
      });
    } catch {
      // The native share sheet can be dismissed without an action.
    }
  }

  function handleScanQR() {
    Keyboard.dismiss();
    router.push('/scan-qr');
  }

  const displayName = matchedUser?.name || 'Vasuli user';
  const initials = displayName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();

  return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.ambientGlow, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.06)' : 'rgba(34, 197, 94, 0.06)' }]} />
      <NavigationHeader title="Add people" onBack={() => router.back()} />

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.intro}>
            <ThemedText selectable style={[styles.title, { color: palette.text }]}>Add people</ThemedText>
            <ThemedText selectable style={[styles.helper, { color: palette.muted }]}>
              Enter an email. We’ll check if they already use Vasuli.
            </ThemedText>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText selectable style={[styles.label, { color: palette.text }]}>Email address</ThemedText>
            <View style={[styles.inputShell, { backgroundColor: palette.surfaceSoft, borderColor: palette.border }, validEmail && { backgroundColor: isDark ? 'rgba(20, 47, 49, 0.92)' : '#F0FBF8', borderColor: isDark ? 'rgba(45, 212, 191, 0.62)' : palette.accent }]}>
              <IconSymbol name="envelope" size={21} color={palette.accent} />
              <TextInput
                value={email}
                onChangeText={handleEmailChange}
                style={[styles.input, { color: palette.text }]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                accessibilityLabel="Email address"
              />
              {lookupState === 'checking' && <ActivityIndicator size="small" color={palette.accent} />}
              {validEmail && lookupState !== 'checking' && (
                <IconSymbol name={lookupState === 'error' ? 'exclamationmark.circle' : 'checkmark.circle.fill'} size={20} color={lookupState === 'error' ? '#F59E0B' : palette.accent} />
              )}
            </View>
          </View>

          {(lookupState === 'found' || lookupState === 'not-found' || lookupState === 'error') && (
            <Animated.View style={{ opacity: resultOpacity }}>
              <View style={[styles.resultCard, { backgroundColor: palette.surface, borderColor: palette.resultBorder }]}>
                {lookupState === 'found' ? (
                  <>
                    <View style={styles.resultRow}>
                      <View style={[styles.avatar, { backgroundColor: palette.iconSurface, borderColor: palette.resultBorder }]}><ThemedText selectable style={[styles.avatarText, { color: palette.accent }]}>{initials}</ThemedText></View>
                      <View style={styles.resultIdentity}>
                        <ThemedText selectable style={[styles.resultName, { color: palette.text }]}>{displayName}</ThemedText>
                        <View style={styles.badge}>
                          <IconSymbol name="checkmark.circle.fill" size={13} color={palette.accent} />
                          <ThemedText selectable style={[styles.badgeText, { color: palette.accent }]}>Already on Vasuli</ThemedText>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity style={[styles.primaryButton, { backgroundColor: palette.accent }]} onPress={handlePrimaryAction} disabled={loading} accessibilityLabel="Add friend">
                      {loading ? <ActivityIndicator color={isDark ? '#061113' : '#FFFFFF'} /> : <ThemedText selectable style={[styles.primaryButtonText, { color: isDark ? '#061113' : '#FFFFFF' }]}>Add friend</ThemedText>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={styles.resultRow}>
                      <View style={[styles.notFoundIcon, { backgroundColor: palette.iconSurface }]}><IconSymbol name="paperplane.fill" size={20} color={palette.accent} /></View>
                      <View style={styles.resultIdentity}>
                        <ThemedText selectable style={[styles.resultName, { color: palette.text }]}>{lookupState === 'error' ? 'Couldn’t check this email' : 'Not on Vasuli yet'}</ThemedText>
                        <ThemedText selectable style={[styles.resultSupporting, { color: palette.muted }]}>{lookupState === 'error' ? 'Try again in a moment.' : 'They’ll get an invite to join you.'}</ThemedText>
                      </View>
                    </View>
                    {lookupState === 'not-found' && (
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: palette.accent }]} onPress={handlePrimaryAction} disabled={loading} accessibilityLabel="Send invite">
                        {loading ? <ActivityIndicator color={isDark ? '#061113' : '#FFFFFF'} /> : <ThemedText selectable style={[styles.primaryButtonText, { color: isDark ? '#061113' : '#FFFFFF' }]}>Send invite</ThemedText>}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </Animated.View>
          )}

          <View style={styles.optionsSection}>
            <ThemedText selectable style={[styles.sectionEyebrow, { color: palette.muted }]}>More ways to connect</ThemedText>
            <TouchableOpacity style={[styles.optionRow, { backgroundColor: palette.surfaceSoft, borderColor: palette.border }]} onPress={handleShareInvite} accessibilityLabel="Share invite link">
              <View style={[styles.optionIcon, { backgroundColor: palette.iconSurface }]}><IconSymbol name="square.and.arrow.up" size={20} color={palette.accent} /></View>
              <View style={styles.optionCopy}><ThemedText selectable style={[styles.optionTitle, { color: palette.text }]}>Share invite link</ThemedText><ThemedText selectable style={[styles.optionSubtitle, { color: palette.muted }]}>Invite someone any way you like</ThemedText></View>
              <IconSymbol name="chevron.right" size={18} color={palette.muted} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionRow, { backgroundColor: palette.surfaceSoft, borderColor: palette.border }]} onPress={handleScanQR} accessibilityLabel="Scan QR code">
              <View style={[styles.optionIcon, { backgroundColor: palette.iconSurface }]}><IconSymbol name="qrcode.viewfinder" size={21} color={palette.accent} /></View>
              <View style={styles.optionCopy}><ThemedText selectable style={[styles.optionTitle, { color: palette.text }]}>Scan QR code</ThemedText><ThemedText selectable style={[styles.optionSubtitle, { color: palette.muted }]}>Add someone nearby instantly</ThemedText></View>
              <IconSymbol name="chevron.right" size={18} color={palette.muted} />
            </TouchableOpacity>
          </View>

          <BlurView intensity={isDark ? 22 : 30} tint={isDark ? 'dark' : 'light'} style={[styles.privacyCard, { backgroundColor: palette.privacySurface, borderColor: palette.border }]}>
            <IconSymbol name="lock.shield" size={22} color={palette.accent} />
            <ThemedText selectable style={[styles.privacyText, { color: palette.privacyText }]}>Your email stays private until they accept.</ThemedText>
          </BlurView>
        </View>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ambientGlow: { position: 'absolute', top: -150, right: -100, width: 330, height: 330, borderRadius: 200, backgroundColor: 'rgba(45, 212, 191, 0.06)' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },
  content: { gap: 22 },
  intro: { gap: 8, paddingTop: 10 },
  title: { fontSize: 30, lineHeight: 36, fontFamily: 'Nunito_700Bold', letterSpacing: -0.5 },
  helper: { fontSize: 15, lineHeight: 22, maxWidth: 350 },
  fieldGroup: { gap: 9 },
  label: { fontSize: 14, fontFamily: 'Nunito_600SemiBold' },
  inputShell: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, borderRadius: 18, borderWidth: 1 },
  inputShellActive: { borderColor: 'rgba(45, 212, 191, 0.62)', backgroundColor: 'rgba(20, 47, 49, 0.92)' },
  input: { flex: 1, fontSize: 16, fontFamily: 'Nunito_500Medium', paddingVertical: 0 },
  resultCard: { gap: 18, padding: 18, borderRadius: 20, borderWidth: 1, boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(45, 212, 191, 0.18)', borderWidth: 1, borderColor: 'rgba(45, 212, 191, 0.42)' },
  avatarText: { fontSize: 16, fontFamily: 'Nunito_700Bold' },
  resultIdentity: { flex: 1, gap: 6 },
  resultName: { fontSize: 17, fontFamily: 'Nunito_700Bold' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeText: { fontSize: 13, fontFamily: 'Nunito_600SemiBold' },
  notFoundIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  resultSupporting: { fontSize: 13 },
  primaryButton: { minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#061113', fontSize: 16, fontFamily: 'Nunito_700Bold' },
  optionsSection: { gap: 10, marginTop: 2 },
  sectionEyebrow: { fontSize: 13, fontFamily: 'Nunito_600SemiBold', marginBottom: 2 },
  optionRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  optionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 16, fontFamily: 'Nunito_700Bold' },
  optionSubtitle: { fontSize: 13 },
  privacyCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, borderRadius: 18, overflow: 'hidden', borderWidth: 1 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
