import { FormInput } from '@/components/ui/form-input';
import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, TextInput } from 'react-native';

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  setGroupName: (value: string) => void;
  groupDescription: string;
  setGroupDescription: (value: string) => void;
  onSubmit: () => void;
}

export function CreateGroupModal({
  visible,
  onClose,
  groupName,
  setGroupName,
  groupDescription,
  setGroupDescription,
  onSubmit,
}: CreateGroupModalProps) {
  const { colors, isDark } = useThemeColors();
  const isDisabled = !groupName.trim();

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="Create a Group"
      subtitle="Split expenses easily with friends and family"
      icon="person.3.fill"
      submitLabel="Create Group"
      submitIcon="plus.circle.fill"
      submitDisabled={isDisabled}
      onSubmit={onSubmit}>
      <FormGroup label="Group Name *">
        <FormInput
          placeholder="e.g. Summer Trip 2024"
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
          returnKeyType="done"
        />
      </FormGroup>

      <FormGroup label="Description (Optional)">
        <TextInput
          style={[
            styles.textArea,
            {
              backgroundColor: colors.inputBackground,
              borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : colors.inputBorder,
              color: colors.text,
            },
          ]}
          placeholder="What is this group for?"
          placeholderTextColor="#6B7280"
          value={groupDescription}
          onChangeText={setGroupDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          returnKeyType="done"
          blurOnSubmit={true}
        />
      </FormGroup>

      <PrivacyNote>
        You can add members to your group after creating it.
      </PrivacyNote>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  textArea: {
    height: 120,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
});
