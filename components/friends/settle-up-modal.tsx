import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
    Modal,
    Platform,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

interface UserWithBalance extends User {
  balance: number;
}

interface SettleUpModalProps {
  visible: boolean;
  onClose: () => void;
  friend: UserWithBalance | null;
  onConfirm: (friendId: string, amount: number) => void;
}

export function SettleUpModal({ visible, onClose, friend, onConfirm }: SettleUpModalProps) {
  const { colors, isDark } = useThemeColors();

  if (!friend) return null;

  const balance = friend.balance;
  const amount = Math.abs(balance);
  const isOwedToYou = balance > 0;

  const handleConfirm = () => {
    onConfirm(friend.id, amount);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.modalContent,
                !isDark && { backgroundColor: colors.card },
              ]}>
              <ThemedText
                type="title"
                style={[styles.title, !isDark && { color: colors.text }]}>
                Settle up with {friend.name}
              </ThemedText>

              <View style={styles.summaryContainer}>
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: isDark
                        ? 'rgba(45, 212, 191, 0.15)'
                        : 'rgba(34, 197, 94, 0.1)',
                    },
                  ]}>
                  <ThemedText
                    style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                    {friend.name.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>

                <View style={styles.summaryText}>
                  {isOwedToYou ? (
                    <>
                      <ThemedText style={[styles.summaryLabel, !isDark && { color: colors.textSecondary }]}>
                        {friend.name} owes you
                      </ThemedText>
                      <ThemedText style={[styles.summaryAmount, { color: '#10b981' }]}>
                        ${amount.toFixed(2)}
                      </ThemedText>
                    </>
                  ) : (
                    <>
                      <ThemedText style={[styles.summaryLabel, !isDark && { color: colors.textSecondary }]}>
                        You owe {friend.name}
                      </ThemedText>
                      <ThemedText style={[styles.summaryAmount, { color: '#ef4444' }]}>
                        ${amount.toFixed(2)}
                      </ThemedText>
                    </>
                  )}
                </View>
              </View>

              <ThemedText style={[styles.description, !isDark && { color: colors.textSecondary }]}>
                {isOwedToYou
                  ? `Record that ${friend.name} paid you $${amount.toFixed(2)} to settle up.`
                  : `Record that you paid ${friend.name} $${amount.toFixed(2)} to settle up.`}
              </ThemedText>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    !isDark && { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                  onPress={onClose}>
                  <ThemedText style={[styles.cancelButtonText, !isDark && { color: colors.text }]}>
                    Cancel
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleConfirm} activeOpacity={0.8}>
                  <LinearGradient
                    colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.confirmButton}>
                    <ThemedText style={styles.confirmButtonText}>
                      {isOwedToYou ? 'Record Payment' : 'Mark as Paid'}
                    </ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
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
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(20, 35, 38, 0.95)',
    borderRadius: 20,
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 24,
    color: '#fff',
  },
  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  summaryText: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0F',
  },
});
