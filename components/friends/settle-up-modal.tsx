import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { User } from '@/types/database';
import { normalizeCurrencyInput } from '@/utils/validation';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  TextInput,
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
  const [editableAmount, setEditableAmount] = useState('');

  const balance = friend?.balance ?? 0;
  const maxAmount = Math.abs(balance);
  const isOwedToYou = balance > 0;

  useEffect(() => {
    if (visible && friend) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Opening the modal resets the editable amount to the current balance.
      setEditableAmount(maxAmount.toFixed(2));
    }
  }, [visible, friend, maxAmount]);

  if (!friend) return null;

  const handleAmountChange = (text: string) => {
    setEditableAmount(normalizeCurrencyInput(text));
  };

  const currentAmount = parseFloat(editableAmount) || 0;
  const amountExceedsBalance = currentAmount > maxAmount;

  const handleConfirm = () => {
    if (currentAmount <= 0 || amountExceedsBalance) return;
    onConfirm(friend.id, currentAmount);
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
                style={[styles.title, { color: colors.text }]}>
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
                  <ThemedText style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                    {isOwedToYou ? `${friend.name} owes you` : `You owe ${friend.name}`}
                  </ThemedText>
                  <ThemedText style={[styles.maxAmount, { color: colors.textSecondary }]}>
                    Total: ${maxAmount.toFixed(2)}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.amountInputContainer}>
                <ThemedText style={[styles.amountLabel, { color: colors.textSecondary }]}>
                  Amount to settle
                </ThemedText>
                <View style={[styles.amountInputWrapper, { borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}>
                  <ThemedText style={[styles.currencySymbol, { color: isOwedToYou ? '#10b981' : '#ef4444' }]}>$</ThemedText>
                  <TextInput
                    style={[styles.amountInput, { color: isOwedToYou ? '#10b981' : '#ef4444' }]}
                    value={editableAmount}
                    onChangeText={handleAmountChange}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    selectTextOnFocus
                  />
                </View>
                {amountExceedsBalance && (
                  <ThemedText style={styles.warningText}>
                    Amount exceeds total owed
                  </ThemedText>
                )}
              </View>

              <ThemedText style={[styles.description, { color: colors.textSecondary }]}>
                {isOwedToYou
                  ? `Record that ${friend.name} paid you $${currentAmount.toFixed(2)} to settle up.`
                  : `Record that you paid ${friend.name} $${currentAmount.toFixed(2)} to settle up.`}
              </ThemedText>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    !isDark && { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                  onPress={onClose}>
                  <ThemedText style={[styles.cancelButtonText, { color: colors.text }]}>
                    Cancel
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={currentAmount <= 0 || amountExceedsBalance}
                  activeOpacity={0.8}>
                  <LinearGradient
                    colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.confirmButton,
                      (currentAmount <= 0 || amountExceedsBalance) && styles.confirmButtonDisabled,
                    ]}>
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
    marginBottom: 4,
  },
  maxAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  amountInputContainer: {
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '700',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: '700',
    minWidth: 120,
    textAlign: 'left',
    textAlignVertical: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  warningText: {
    fontSize: 12,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 8,
  },
  description: {
    fontSize: 14,
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
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0F',
  },
});
