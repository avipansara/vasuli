import { ThemedText } from '@/components/themed-text';
import { SelectableOption, SelectableOptionList } from '@/components/ui/selectable-option';
import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { User } from '@/types/database';
import React from 'react';
import { StyleSheet } from 'react-native';

interface AddMemberModalProps {
  visible: boolean;
  onClose: () => void;
  availableUsers: User[];
  selectedUserId: string;
  setSelectedUserId: (value: string) => void;
  onSubmit: () => void;
}

export function AddMemberModal({
  visible,
  onClose,
  availableUsers,
  selectedUserId,
  setSelectedUserId,
  onSubmit,
}: AddMemberModalProps) {
  const { colors, isDark } = useThemeColors();
  const isDisabled = !selectedUserId;

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="Add Member"
      subtitle="Add a friend to this group"
      icon="person.badge.plus"
      submitLabel="Add Member"
      submitIcon="person.badge.plus"
      submitDisabled={isDisabled || availableUsers.length === 0}
      onSubmit={onSubmit}>
      <FormGroup label="Select Friend *">
        {availableUsers.length === 0 ? (
          <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
            No available users. Add friends first.
          </ThemedText>
        ) : (
          <SelectableOptionList>
            {availableUsers.map(user => (
              <SelectableOption
                key={user.id}
                label={user.name}
                selected={selectedUserId === user.id}
                onPress={() => setSelectedUserId(user.id)}
              />
            ))}
          </SelectableOptionList>
        )}
      </FormGroup>

      <PrivacyNote>
        They will be able to see and add expenses to this group.
      </PrivacyNote>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
