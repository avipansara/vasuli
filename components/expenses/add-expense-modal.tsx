import { FormInput } from '@/components/ui/form-input';
import { SelectableOption, SelectableOptionList } from '@/components/ui/selectable-option';
import { FormGroup, PrivacyNote, SharedModal } from '@/components/ui/shared-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { Group, User } from '@/types/database';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '../themed-text';

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  description: string;
  setDescription: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  groups: Group[];
  friends: User[];
  selectedGroupId: string;
  setSelectedGroupId: (value: string) => void;
  selectedFriendIds: string[];
  setSelectedFriendIds: (value: string[]) => void;
  splitType: 'group' | 'friends';
  setSplitType: (value: 'group' | 'friends') => void;
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
  friends,
  selectedGroupId,
  setSelectedGroupId,
  selectedFriendIds,
  setSelectedFriendIds,
  splitType,
  setSplitType,
  onSubmit,
}: AddExpenseModalProps) {
  const { colors, isDark } = useThemeColors();
  
  const isDisabled = !description.trim() || !amount.trim() || 
    (splitType === 'group' ? !selectedGroupId : selectedFriendIds.length === 0);

  const toggleFriend = (friendId: string) => {
    if (selectedFriendIds.includes(friendId)) {
      setSelectedFriendIds(selectedFriendIds.filter(id => id !== friendId));
    } else {
      setSelectedFriendIds([...selectedFriendIds, friendId]);
    }
  };

  return (
    <SharedModal
      visible={visible}
      onClose={onClose}
      title="Add Expense"
      subtitle="Track what you spent and split with others"
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

      <FormGroup label="Split with *">
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              splitType === 'group' && styles.toggleButtonActive,
              !isDark && splitType !== 'group' && { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => setSplitType('group')}>
            <ThemedText
              style={[
                styles.toggleText,
                splitType === 'group' && styles.toggleTextActive,
                !isDark && splitType !== 'group' && { color: colors.text },
              ]}>
              Group
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              splitType === 'friends' && styles.toggleButtonActive,
              !isDark && splitType !== 'friends' && { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => setSplitType('friends')}>
            <ThemedText
              style={[
                styles.toggleText,
                splitType === 'friends' && styles.toggleTextActive,
                !isDark && splitType !== 'friends' && { color: colors.text },
              ]}>
              Friends
            </ThemedText>
          </TouchableOpacity>
        </View>
      </FormGroup>

      {splitType === 'group' ? (
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
      ) : (
        <FormGroup label="Select Friends *">
          <SelectableOptionList>
            {friends.map(friend => (
              <SelectableOption
                key={friend.id}
                label={friend.name}
                selected={selectedFriendIds.includes(friend.id)}
                onPress={() => toggleFriend(friend.id)}
              />
            ))}
          </SelectableOptionList>
        </FormGroup>
      )}

      <PrivacyNote>
        {splitType === 'group' 
          ? 'The expense will be split equally among all group members.'
          : 'The expense will be split equally among selected friends and you.'}
      </PrivacyNote>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.2)',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#2DD4BF',
    borderColor: '#2DD4BF',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  toggleTextActive: {
    color: '#0A0A0F',
  },
});
