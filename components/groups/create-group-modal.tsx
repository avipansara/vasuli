import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import { ThemedInput } from '@/components/ui/themed-input';
import React from 'react';
import { StyleSheet } from 'react-native';

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
        <ThemedInput
          placeholder="e.g. Summer Trip 2024"
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
          returnKeyType="done"
          icon="tag.fill"
        />
      </FormGroup>

      <FormGroup label="Description (Optional)">
        <ThemedInput
          placeholder="What is this group for?"
          value={groupDescription}
          onChangeText={setGroupDescription}
          multiline
          numberOfLines={4}
          returnKeyType="done"
          blurOnSubmit={true}
          style={styles.textArea}
          icon="doc.text.fill"
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
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
    paddingBottom: 12,
  },
});
