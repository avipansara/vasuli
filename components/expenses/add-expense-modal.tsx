import { FormInput } from '@/components/ui/form-input';
import { SelectableOption, SelectableOptionList } from '@/components/ui/selectable-option';
import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import type { Group } from '@/types/database';
import React from 'react';

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  description: string;
  setDescription: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  groups: Group[];
  selectedGroupId: string;
  setSelectedGroupId: (value: string) => void;
  onSubmit: () => void;
}

export function AddExpenseModal({
  visible,
  onClose,
  description,
  setDescription,
  amount,
  setAmount,
  groups,
  selectedGroupId,
  setSelectedGroupId,
  onSubmit,
}: AddExpenseModalProps) {
  const isDisabled = !description.trim() || !amount.trim() || !selectedGroupId;

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="Add Expense"
      subtitle="Track what you spent and split with your group"
      icon="dollarsign.circle.fill"
      submitLabel="Add Expense"
      submitIcon="plus.circle.fill"
      submitDisabled={isDisabled}
      onSubmit={onSubmit}>
      <FormGroup label="Description *">
        <FormInput
          placeholder="e.g. Dinner at Mario's"
          value={description}
          onChangeText={setDescription}
          autoFocus
          returnKeyType="done"
        />
      </FormGroup>

      <FormGroup label="Amount *">
        <FormInput
          placeholder="0.00"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
      </FormGroup>

      <FormGroup label="Select Group *">
        <SelectableOptionList>
          {groups.map(group => (
            <SelectableOption
              key={group.id}
              label={group.name}
              selected={selectedGroupId === group.id}
              onPress={() => setSelectedGroupId(group.id)}
            />
          ))}
        </SelectableOptionList>
      </FormGroup>

      <PrivacyNote>
        The expense will be split equally among all group members.
      </PrivacyNote>
    </SharedModal>
  );
}
