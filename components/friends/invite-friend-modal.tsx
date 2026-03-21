import { ThemedText } from '@/components/themed-text';
import { FormInput } from '@/components/ui/form-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface InviteFriendModalProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  onSubmit: () => void;
}

export function InviteFriendModal({
  visible,
  onClose,
  name,
  setName,
  email,
  setEmail,
  onSubmit,
}: InviteFriendModalProps) {
  const { colors, isDark } = useThemeColors();
  const isDisabled = !email.trim();

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="Invite a Friend"
      subtitle="We’ll email them a link to join Vasuli"
      icon="person.badge.plus"
      submitLabel="Send Invite"
      submitIcon="paperplane.fill"
      submitDisabled={isDisabled}
      onSubmit={onSubmit}>
      <View style={styles.emailHint}>
        <IconSymbol
          size={20}
          name="envelope.fill"
          color={isDark ? '#2DD4BF' : colors.tint}
        />
        <ThemedText style={[styles.emailHintText, { color: colors.textSecondary }]}>
          Email invite
        </ThemedText>
      </View>

      <FormGroup label="Name (Optional)">
        <FormInput
          placeholder="e.g. John Doe"
          value={name}
          onChangeText={setName}
          returnKeyType="done"
        />
      </FormGroup>

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

      <PrivacyNote>
        We will send them an invite to join Vasuli. They will be able to accept and connect with you.
      </PrivacyNote>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  emailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  emailHintText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
