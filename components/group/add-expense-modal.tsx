import { FormInput } from '@/components/ui/form-input';
import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import React from 'react';

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  description: string;
  setDescription: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  onSubmit: () => void;
}

export function AddExpenseModal({
  visible,
  onClose,
  description,
  setDescription,
  amount,
  setAmount,
  onSubmit,
}: AddExpenseModalProps) {
  const isDisabled = !description.trim() || !amount.trim();

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="Add Expense"
      subtitle="Track what you spent in this group"
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

      <PrivacyNote>
        The expense will be split equally among all group members.
      </PrivacyNote>
    </SharedModal>
  );
}
