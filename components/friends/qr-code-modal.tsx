import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Modal,
  Platform,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface QRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export function QRCodeModal({ visible, onClose, userId, userName }: QRCodeModalProps) {
  const { colors, isDark } = useThemeColors();

  const inviteLink = `https://split-space.com/invite/${userId}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Add me on Vasuli! ${inviteLink}`,
        title: 'Vasuli Invite',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.modalContainer}>
          <View style={[
            styles.modalContent,
            { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)' }
          ]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft} />
              <ThemedText type="subtitle" style={[styles.title, !isDark && { color: colors.text }]}>
                Your QR Code
              </ThemedText>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <IconSymbol size={24} name="xmark" color={isDark ? '#fff' : colors.text} />
              </TouchableOpacity>
            </View>

            {/* QR Code */}
            <View style={styles.qrContainer}>
              <LinearGradient
                colors={isDark ? ['rgba(45, 212, 191, 0.2)', 'rgba(45, 212, 191, 0.05)'] : ['rgba(34, 197, 94, 0.2)', 'rgba(34, 197, 94, 0.05)']}
                style={styles.qrGlow}
              />
              <View style={[styles.qrWrapper, { backgroundColor: '#fff' }]}>
                <QRCode
                  value={inviteLink}
                  size={200}
                  backgroundColor="#fff"
                  color="#0A0A0F"
                />
              </View>
            </View>

            {/* User Info */}
            <View style={styles.userInfo}>
              <View style={[styles.avatar, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
                <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                  {userName.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <ThemedText type="defaultSemiBold" style={[styles.userName, !isDark && { color: colors.text }]}>
                {userName}
              </ThemedText>
            </View>

            {/* Instructions */}
            <ThemedText style={[styles.instructions, !isDark && { color: colors.textSecondary }]}>
              Let your friend scan this code to add you on Vasuli
            </ThemedText>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}
                onPress={handleShare}>
                <IconSymbol size={20} name="square.and.arrow.up" color={isDark ? '#2DD4BF' : colors.tint} />
                <ThemedText style={[styles.actionButtonText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                  Share Link
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerLeft: {
    width: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  qrGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 24,
  },
  qrWrapper: {
    padding: 16,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  userName: {
    fontSize: 18,
  },
  instructions: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
