import React from 'react';
import {
  Alert,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { buildInvitePath } from '@/lib/invite-deeplink';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ThemedText } from '../themed-text';
import { IconSymbol } from '../ui/icon-symbol';
import { QRCode } from '../ui/qr-code';
import { SharedModal } from '../ui/shared-modal';

interface MyQRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

export function MyQRCodeModal({ visible, onClose, user }: MyQRCodeModalProps) {
  const { colors, isDark } = useThemeColors();

  if (!user) return null;

  const displayName = user.name || 'Vasuli User';
  const initial = displayName.charAt(0).toUpperCase();
  const inviteUrl = `https://split-space.com${buildInvitePath(user.id)}`;

  const handleShare = async () => {
    try {
      await Share.share({
        title: 'Connect with me on Vasuli',
        message: `Add me on Vasuli to split expenses: ${inviteUrl}`,
      });
    } catch {
      // User cancelled share dialog
    }
  };

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="My QR Code"
      subtitle=""
      icon="qrcode"
      headerStyle="centered"
    >
      <View style={styles.content}>
        {/* User Card */}
        <View style={styles.userSection}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: isDark ? '#064e3b' : 'rgba(34, 197, 94, 0.12)',
                borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(34, 197, 94, 0.25)',
              },
            ]}
          >
            <ThemedText style={[styles.avatarText, { color: isDark ? '#10b981' : colors.accent }]}>
              {initial}
            </ThemedText>
          </View>
          <ThemedText type="subtitle" style={[styles.userName, { color: colors.text }]}>
            {displayName}
          </ThemedText>
          {user.email ? (
            <ThemedText style={[styles.userEmail, { color: colors.textSecondary }]}>
              {user.email}
            </ThemedText>
          ) : null}
        </View>

        {/* QR Code Container */}
        <View
          style={[
            styles.qrCard,
            {
              backgroundColor: '#ffffff',
              shadowColor: isDark ? '#000000' : '#475569',
            },
          ]}
        >
          <QRCode
            value={inviteUrl}
            size={220}
            color="#05080E"
            backgroundColor="#ffffff"
          />
        </View>

        <ThemedText style={[styles.instructions, { color: colors.textSecondary }]}>
          Let your friend point their phone camera or the Vasuli scanner at this code to connect instantly.
        </ThemedText>

        {/* Action Button */}
        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Share invite link"
          style={[
            styles.shareButton,
            {
              backgroundColor: colors.accent,
            },
          ]}
        >
          <IconSymbol
            name="square.and.arrow.up"
            size={20}
            color="#FFFFFF"
          />
          <ThemedText
            style={[
              styles.shareButtonText,
              { color: '#FFFFFF' },
            ]}
          >
            Share Invite Link
          </ThemedText>
        </TouchableOpacity>
      </View>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 20,
  },
  userSection: {
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  userEmail: {
    fontSize: 14,
    textAlign: 'center',
  },
  qrCard: {
    padding: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  instructions: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 28,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 8,
    width: '100%',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
