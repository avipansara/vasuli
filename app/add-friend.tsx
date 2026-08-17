import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { buildInvitePath } from '@/lib/invite-deeplink';
import { invitationService } from '@/services/invitation-service';
import { userService } from '@/services/user-service';
import type { User } from '@/types/database';
import { isEmailValid, normalizeEmail } from '@/utils/validation';
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

  const cardStyle = {
    backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
    borderWidth: 0,
    shadowColor: isDark ? '#000000' : '#475569',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.35 : 0.09,
    shadowRadius: 10,
    elevation: 3,
    borderRadius: 14,
  };

  const primaryBtnColor = isDark ? '#0D9488' : '#0F4C3A';
  const iconBoxBg = isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(15, 76, 58, 0.08)';
  const iconBoxColor = isDark ? '#2DD4BF' : '#0F4C3A';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NavigationHeader title="Add people" onBack={() => router.back()} />

      <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.intro}>
            <ThemedText selectable style={[styles.helper, { color: colors.textSecondary }]}>
              Enter an email. We’ll check if they already use Vasuli.
            </ThemedText>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText selectable style={[styles.label, { color: colors.text }]}>Email address</ThemedText>
            <View style={[
              styles.inputShell,
              cardStyle,
              {
                borderWidth: 1,
                borderColor: validEmail ? (isDark ? '#0D9488' : '#0F4C3A') : (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(0, 0, 0, 0.08)'),
              }
            ]}>
              <IconSymbol name="envelope" size={20} color={iconBoxColor} />
              <TextInput
                value={email}
                onChangeText={handleEmailChange}
                style={[styles.input, { color: colors.text }]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                accessibilityLabel="Email address"
                placeholder="friend@example.com"
                placeholderTextColor={colors.textSecondary}
              />
              {lookupState === 'checking' && <ActivityIndicator size="small" color={iconBoxColor} />}
              {validEmail && lookupState !== 'checking' && (
                <IconSymbol name={lookupState === 'error' ? 'exclamationmark.circle' : 'checkmark.circle.fill'} size={20} color={lookupState === 'error' ? '#F59E0B' : iconBoxColor} />
              )}
            </View>
          </View>

          {(lookupState === 'found' || lookupState === 'not-found' || lookupState === 'error') && (
            <Animated.View style={{ opacity: resultOpacity }}>
              <View style={[styles.resultCard, cardStyle]}>
                {lookupState === 'found' ? (
                  <>
                    <View style={styles.resultRow}>
                      <View style={[styles.avatar, { backgroundColor: iconBoxBg }]}>
                        <ThemedText selectable style={[styles.avatarText, { color: iconBoxColor }]}>{initials}</ThemedText>
                      </View>
                      <View style={styles.resultIdentity}>
                        <ThemedText selectable style={[styles.resultName, { color: colors.text }]}>{displayName}</ThemedText>
                        <View style={styles.badge}>
                          <IconSymbol name="checkmark.circle.fill" size={13} color={iconBoxColor} />
                          <ThemedText selectable style={[styles.badgeText, { color: iconBoxColor }]}>Already on Vasuli</ThemedText>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity style={[styles.primaryButton, { backgroundColor: primaryBtnColor }]} onPress={handlePrimaryAction} disabled={loading} accessibilityLabel="Add friend">
                      {loading ? <ActivityIndicator color="#ffffff" /> : <ThemedText selectable style={styles.primaryButtonText}>Add friend</ThemedText>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={styles.resultRow}>
                      <View style={[styles.notFoundIcon, { backgroundColor: iconBoxBg }]}>
                        <IconSymbol name="paperplane.fill" size={20} color={iconBoxColor} />
                      </View>
                      <View style={styles.resultIdentity}>
                        <ThemedText selectable style={[styles.resultName, { color: colors.text }]}>{lookupState === 'error' ? 'Couldn’t check this email' : 'Not on Vasuli yet'}</ThemedText>
                        <ThemedText selectable style={[styles.resultSupporting, { color: colors.textSecondary }]}>{lookupState === 'error' ? 'Try again in a moment.' : 'They’ll get an invite to join you.'}</ThemedText>
                      </View>
                    </View>
                    {lookupState === 'not-found' && (
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: primaryBtnColor }]} onPress={handlePrimaryAction} disabled={loading} accessibilityLabel="Send invite">
                        {loading ? <ActivityIndicator color="#ffffff" /> : <ThemedText selectable style={styles.primaryButtonText}>Send invite</ThemedText>}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </Animated.View>
          )}

          <View style={styles.optionsSection}>
            <ThemedText selectable style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>More ways to connect</ThemedText>
            <TouchableOpacity style={[styles.optionRow, cardStyle]} onPress={handleShareInvite} accessibilityLabel="Share invite link">
              <View style={[styles.optionIcon, { backgroundColor: iconBoxBg }]}>
                <IconSymbol name="square.and.arrow.up" size={20} color={iconBoxColor} />
              </View>
              <View style={styles.optionCopy}>
                <ThemedText selectable style={[styles.optionTitle, { color: colors.text }]}>Share invite link</ThemedText>
                <ThemedText selectable style={[styles.optionSubtitle, { color: colors.textSecondary }]}>Invite someone any way you like</ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionRow, cardStyle]} onPress={handleScanQR} accessibilityLabel="Scan QR code">
              <View style={[styles.optionIcon, { backgroundColor: iconBoxBg }]}>
                <IconSymbol name="qrcode.viewfinder" size={21} color={iconBoxColor} />
              </View>
              <View style={styles.optionCopy}>
                <ThemedText selectable style={[styles.optionTitle, { color: colors.text }]}>Scan QR code</ThemedText>
                <ThemedText selectable style={[styles.optionSubtitle, { color: colors.textSecondary }]}>Add someone nearby instantly</ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.privacyCard, cardStyle]}>
            <IconSymbol name="lock.shield" size={22} color={iconBoxColor} />
            <ThemedText selectable style={[styles.privacyText, { color: colors.textSecondary }]}>Your email stays private until they accept.</ThemedText>
          </View>
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
  title: { fontSize: 30, lineHeight: 36, fontFamily: 'Manrope_700Bold', letterSpacing: -0.5 },
  helper: { fontSize: 15, lineHeight: 22, maxWidth: 350 },
  fieldGroup: { gap: 9 },
  label: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  inputShell: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, borderRadius: 18, borderWidth: 1 },
  inputShellActive: { borderColor: 'rgba(45, 212, 191, 0.62)', backgroundColor: 'rgba(20, 47, 49, 0.92)' },
  input: { flex: 1, fontSize: 16, fontFamily: 'Manrope_500Medium', paddingVertical: 0 },
  resultCard: { gap: 18, padding: 18, borderRadius: 20, borderWidth: 1, boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(45, 212, 191, 0.18)', borderWidth: 1, borderColor: 'rgba(45, 212, 191, 0.42)' },
  avatarText: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  resultIdentity: { flex: 1, gap: 6 },
  resultName: { fontSize: 17, fontFamily: 'Manrope_700Bold' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  notFoundIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  resultSupporting: { fontSize: 13 },
  primaryButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  optionsSection: { gap: 10, marginTop: 2 },
  sectionEyebrow: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  optionRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, borderRadius: 14 },
  optionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  optionSubtitle: { fontSize: 13 },
  privacyCard: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, borderRadius: 14 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
