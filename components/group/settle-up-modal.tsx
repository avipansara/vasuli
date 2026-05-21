import { FormInput } from '@/components/ui/form-input';
import { SelectableOption, SelectableOptionList } from '@/components/ui/selectable-option';
import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import { BG_ICON_SUCCESS_DARK, SUCCESS_DARK } from '@/constants/theme';
import type { GroupMember, User } from '@/types/database';
import { normalizeCurrencyInput } from '@/utils/validation';
import React from 'react';

interface SettleUpModalProps {
  visible: boolean;
  onClose: () => void;
  members: (GroupMember & { user?: User })[];
  settleWithUserId: string;
  setSettleWithUserId: (value: string) => void;
  settleAmount: string;
  setSettleAmount: (value: string) => void;
  onSubmit: () => void;
}

export function SettleUpModal({
  visible,
  onClose,
  members,
  settleWithUserId,
  setSettleWithUserId,
  settleAmount,
  setSettleAmount,
  onSubmit,
}: SettleUpModalProps) {
  const isDisabled = !settleWithUserId || !settleAmount.trim();
  const otherMembers = members.filter(m => m.userId !== 'current-user');

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="Settle Up"
      subtitle="Record a payment to settle your balance"
      icon="checkmark.circle.fill"
      iconBackgroundColor={BG_ICON_SUCCESS_DARK}
      iconColor={SUCCESS_DARK}
      submitLabel="Record Payment"
      submitIcon="checkmark.circle.fill"
      submitDisabled={isDisabled}
      onSubmit={onSubmit}
      submitGradientColors={[SUCCESS_DARK, '#059669']}
      submitTextColor="#fff">
      <FormGroup label="Settle with *">
        <SelectableOptionList>
          {otherMembers.map(member => (
            <SelectableOption
              key={member.id}
              label={member.user?.name || 'Unknown'}
              selected={settleWithUserId === member.userId}
              onPress={() => setSettleWithUserId(member.userId)}
            />
          ))}
        </SelectableOptionList>
      </FormGroup>

      <FormGroup label="Amount *">
        <FormInput
          placeholder="0.00"
          value={settleAmount}
          onChangeText={(value) => setSettleAmount(normalizeCurrencyInput(value))}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
      </FormGroup>

      <PrivacyNote>
        This will record a payment and update your balances.
      </PrivacyNote>
    </SharedModal>
  );
}
