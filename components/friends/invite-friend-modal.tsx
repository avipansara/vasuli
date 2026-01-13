import { ThemedText } from '@/components/themed-text';
import { FormInput } from '@/components/ui/form-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface InviteFriendModalProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  inviteMethod: 'email' | 'phone';
  setInviteMethod: (value: 'email' | 'phone') => void;
  onSubmit: () => void;
}

export function InviteFriendModal({
  visible,
  onClose,
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  inviteMethod,
  setInviteMethod,
  onSubmit,
}: InviteFriendModalProps) {
  const { colors, isDark } = useThemeColors();
  const isDisabled = inviteMethod === 'email' ? !email.trim() : !phone.trim();

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="Invite a Friend"
      subtitle="Send an invite via email or phone number"
      icon="person.badge.plus"
      submitLabel="Send Invite"
      submitIcon="paperplane.fill"
      submitDisabled={isDisabled}
      onSubmit={onSubmit}>
      <View style={styles.methodToggle}>
        <TouchableOpacity
          style={[
            styles.methodButton,
            inviteMethod === 'email' && styles.methodButtonActive,
            !isDark &&
              inviteMethod !== 'email' && {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
          ]}
          onPress={() => setInviteMethod('email')}>
          <IconSymbol
            size={20}
            name="envelope.fill"
            color={inviteMethod === 'email' ? '#0A0A0F' : isDark ? '#2DD4BF' : colors.tint}
          />
          <ThemedText
            style={[
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
            !isDark &&
              inviteMethod !== 'phone' && {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
          ]}
          onPress={() => setInviteMethod('phone')}>
          <IconSymbol
            size={20}
            name="phone.fill"
            color={inviteMethod === 'phone' ? '#0A0A0F' : isDark ? '#2DD4BF' : colors.tint}
          />
          <ThemedText
            style={[
              styles.methodButtonText,
              inviteMethod === 'phone' && styles.methodButtonTextActive,
              !isDark && inviteMethod !== 'phone' && { color: colors.text },
            ]}>
            Phone
          </ThemedText>
        </TouchableOpacity>
      </View>

      <FormGroup label="Name (Optional)">
        <FormInput
          placeholder="e.g. John Doe"
          value={name}
          onChangeText={setName}
          returnKeyType="done"
        />
      </FormGroup>

      {inviteMethod === 'email' ? (
        <FormGroup label="Email Address *">
          <FormInput
            placeholder="friend@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
            returnKeyType="done"
          />
        </FormGroup>
      ) : (
        <FormGroup label="Phone Number *">
          <FormInput
            placeholder="+1 (555) 123-4567"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoFocus
            returnKeyType="done"
          />
        </FormGroup>
      )}

      <PrivacyNote>
        We will send them an invite to join Vasuli. They will be able to accept and connect with you.
      </PrivacyNote>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  methodToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 26, 36, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  methodButtonActive: {
    backgroundColor: '#2DD4BF',
    borderColor: '#2DD4BF',
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f4f4f5',
  },
  methodButtonTextActive: {
    color: '#0A0A0F',
  },
});
