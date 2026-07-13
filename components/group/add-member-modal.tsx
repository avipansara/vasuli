import { ThemedText } from '@/components/themed-text';
import { SharedModal } from '@/components/ui/shared-modal';
import { ThemedInput } from '@/components/ui/themed-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { filterUsers } from '@/lib/filter-users';
import type { User } from '@/types/database';
import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

interface AddMemberModalProps {
  visible: boolean;
  onClose: () => void;
  availableUsers: User[];
  selectedUserIds: string[];
  setSelectedUserIds: (value: string[]) => void;
  onSubmit: () => void;
}

export function AddMemberModal({
  visible,
  onClose,
  availableUsers,
  selectedUserIds,
  setSelectedUserIds,
  onSubmit,
}: AddMemberModalProps) {
  const { colors, isDark } = useThemeColors();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const filteredUsers = useMemo(
    () => filterUsers(availableUsers, deferredSearch),
    [availableUsers, deferredSearch]
  );
  const isDisabled = selectedUserIds.length === 0;

  const toggleUser = (userId: string) => {
    setSelectedUserIds(
      selectedUserIds.includes(userId)
        ? selectedUserIds.filter(id => id !== userId)
        : [...selectedUserIds, userId]
    );
  };

  const handleClose = () => {
    setSearch('');
    setSelectedUserIds([]);
    onClose();
  };

  const renderUser = ({ item }: { item: User }) => {
    const selected = selectedUserIds.includes(item.id);
    const initials = item.name
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={'Select ' + item.name}
        accessibilityState={{ checked: selected }}
        onPress={() => toggleUser(item.id)}
        style={({ pressed }) => [
          styles.userRow,
          {
            backgroundColor: selected
              ? isDark ? 'rgba(45, 212, 191, 0.14)' : 'rgba(34, 197, 94, 0.10)'
              : 'transparent',
            opacity: pressed ? 0.72 : 1,
          },
        ]}>
        <View style={[styles.avatar, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.18)' : 'rgba(34, 197, 94, 0.14)' }]}>
          <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
            {initials || '?'}
          </ThemedText>
        </View>
        <View style={styles.userDetails}>
          <ThemedText type="defaultSemiBold" numberOfLines={1} style={{ color: colors.text }}>
            {item.name}
          </ThemedText>
          {!!item.email && (
            <ThemedText numberOfLines={1} style={[styles.userSecondary, { color: colors.textSecondary }]}>
              {item.email}
            </ThemedText>
          )}
        </View>
        <View style={[styles.checkbox, selected && { backgroundColor: isDark ? '#2DD4BF' : colors.tint, borderColor: isDark ? '#2DD4BF' : colors.tint }]}>
          {selected && <IconSymbol name="checkmark" size={14} color={isDark ? '#0A0A0F' : '#fff'} />}
        </View>
      </Pressable>
    );
  };

  const listHeader = (
    <View>
      <ThemedInput
        icon="magnifyingglass"
        placeholder="Search friends"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search friends"
        style={styles.searchInput}
      />
      <View style={styles.selectionSummary}>
        <ThemedText style={[styles.selectionText, { color: colors.textSecondary }]}>
          {selectedUserIds.length === 0
            ? 'Select the friends to add'
            : selectedUserIds.length + ' ' + (selectedUserIds.length === 1 ? 'friend' : 'friends') + ' selected'}
        </ThemedText>
        {selectedUserIds.length > 0 && (
          <Pressable
            onPress={() => setSelectedUserIds([])}
            accessibilityRole="button"
            accessibilityLabel="Clear selected friends">
            <ThemedText style={[styles.clearText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
              Clear
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );

  const bodyContent = availableUsers.length === 0 ? (
    <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
      No available users. Add friends first.
    </ThemedText>
  ) : (
    <FlatList
      data={filteredUsers}
      renderItem={renderUser}
      keyExtractor={item => item.id}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
          {deferredSearch ? 'No friends match “' + deferredSearch + '”.' : 'No friends available.'}
        </ThemedText>
      }
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={8}
      removeClippedSubviews
    />
  );

  return (
    <SharedModal
      visible={visible}
      onClose={handleClose}
      title="Add Members"
      subtitle="Choose one or more friends to add"
      icon="person.badge.plus"
      bodyContent={bodyContent}
      submitLabel={selectedUserIds.length > 0 ? 'Add ' + selectedUserIds.length + (selectedUserIds.length === 1 ? ' Member' : ' Members') : 'Add Members'}
      submitIcon="person.badge.plus"
      submitDisabled={isDisabled || availableUsers.length === 0}
      onSubmit={onSubmit}>
    </SharedModal>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 12,
  },
  searchInput: {
    marginBottom: 12,
  },
  selectionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
    marginBottom: 4,
  },
  selectionText: {
    fontSize: 13,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '700',
  },
  userRow: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
  },
  userDetails: {
    flex: 1,
    gap: 2,
  },
  userSecondary: {
    fontSize: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(128, 128, 128, 0.45)',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.75,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
