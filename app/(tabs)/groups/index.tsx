import { CreateGroupModal, GroupCard } from '@/components/groups';
import { ThemedText } from '@/components/themed-text';
import { AsyncErrorState } from '@/components/ui/async-error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GroupsListSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context-otp';
import { useDebouncedQueryInvalidation } from '@/hooks/use-debounced-query-invalidation';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useGroupsHomeRealtime } from '@/hooks/use-realtime';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getFetchErrorMessage } from '@/lib/fetch-error-message';
import { groupService } from '@/services/group-service';
import { userService } from '@/services/user-service';
import { queryKeys } from '@/services/query-keys';
import type { GroupWithMembers } from '@/types/database';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Animated, FlatList, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function GroupsScreen() {
  const { colors, gradients, isDark } = useThemeColors();
  const [modalVisible, setModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const queryClient = useQueryClient();
  const groupsQueryKey = useMemo(() => queryKeys.groups.list(currentUserId), [currentUserId]);
  const invalidateGroups = useDebouncedQueryInvalidation(groupsQueryKey, 500);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  const {
    data: groups = [],
    error,
    isFetching,
    isLoading,
    isStale,
    refetch,
  } = useQuery({
    queryKey: groupsQueryKey,
    enabled: !!currentUserId,
    queryFn: async () => {
      return groupService.getHomeSummaries(currentUserId);
    },
  });
  const loading = isLoading && groups.length === 0;
  const loadError = error ? getFetchErrorMessage(error) : null;

  const loadGroups = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useRefetchOnFocus({
    enabled: !!currentUserId,
    isFetching,
    isStale,
    refetch,
  });

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [fadeAnim, loading, slideAnim]);

  useGroupsHomeRealtime(currentUserId, invalidateGroups);

  const renderGroupItem = useCallback(
    ({ item, index }: { item: GroupWithMembers; index: number }) => (
      <GroupCard group={item} index={index} onRefresh={loadGroups} />
    ),
    [loadGroups]
  );

  const createGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    try {
      const group = await groupService.create({
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
      });

      const currentUser = await userService.getById(currentUserId);
      if (!currentUser) {
        await userService.create({
          name: user?.name ?? 'User',
          email: user?.email ?? '',
          isActive: true,
        });
      }

      await groupService.addMember(group.id, currentUserId, 'admin');

      setNewGroupName('');
      setNewGroupDescription('');
      setModalVisible(false);
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    } catch (error) {
      console.error('Error creating group:', error);
      Alert.alert('Error', 'Failed to create group');
    }
  }

  const totalBalance = groups.reduce((sum, g) => sum + (g.yourBalance || 0), 0);
  const totalOwed = groups.reduce((sum, g) => sum + Math.max(g.yourBalance || 0, 0), 0);
  const totalOwe = groups.reduce((sum, g) => sum + Math.max(-(g.yourBalance || 0), 0), 0);
  const hasSeparateBalances = totalOwed > 0 && totalOwe > 0;
  const summaryAccessibilityLabel = hasSeparateBalances
    ? `You owe $${totalOwe.toFixed(2)} and you are owed $${totalOwed.toFixed(2)}`
    : totalOwe > 0
      ? `You owe $${totalOwe.toFixed(2)}`
      : totalOwed > 0
        ? `You are owed $${totalOwed.toFixed(2)}`
        : 'All settled up';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View accessible accessibilityRole="summary" accessibilityLabel={`Group balances: ${summaryAccessibilityLabel}`}>
          {hasSeparateBalances ? (
            <View style={styles.balanceSummaryRow}>
              <View>
                <ThemedText style={[styles.headerLabel, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>You owe</ThemedText>
                <ThemedText type="header" style={[styles.headerAmount, { color: isDark ? '#ffb4ab' : colors.error }]}>${totalOwe.toFixed(2)}</ThemedText>
              </View>
              <View>
                <ThemedText style={[styles.headerLabel, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>You are owed</ThemedText>
                <ThemedText type="header" style={[styles.headerAmount, { color: isDark ? '#10b981' : colors.success }]}>${totalOwed.toFixed(2)}</ThemedText>
              </View>
            </View>
          ) : (
            <>
              <ThemedText style={[styles.headerLabel, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}>
                {totalBalance === 0 ? 'All settled up' : totalOwe > 0 ? 'You owe' : 'You are owed'}
              </ThemedText>
              <ThemedText
                type="header"
                style={[styles.headerAmount, { color: isDark ? (totalOwe > 0 ? '#ffb4ab' : '#10b981') : (totalOwe > 0 ? colors.error : colors.success) }]}
              >
                ${Math.abs(totalBalance).toFixed(2)}
              </ThemedText>
            </>
          )}
        </View>
        <TouchableOpacity
          style={[styles.addButtonRect, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}
          onPress={() => router.push('/create-group')}
          accessibilityRole="button"
          accessibilityLabel="Create group"
          accessibilityHint="Opens the form to create a new group">
          <IconSymbol size={20} name="plus" color={isDark ? '#10b981' : colors.tint} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <GroupsListSkeleton />
      ) : loadError ? (
        <AsyncErrorState
          message={loadError}
          onRetry={loadGroups}
          title="Couldn't load groups"
        />
      ) : groups.length === 0 ? (
        <Animated.View style={[
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }], flex: 1 }
        ]}>
          <EmptyState
            icon="person.3"
            title="No groups yet"
            subtitle="Create a group to start splitting expenses with friends"
            buttonLabel="Create Your First Group"
            onButtonPress={() => router.push('/create-group')}
          />
        </Animated.View>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <CreateGroupModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        groupName={newGroupName}
        setGroupName={setNewGroupName}
        groupDescription={newGroupDescription}
        setGroupDescription={setNewGroupDescription}
        onSubmit={createGroup}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    marginBottom: 16,
  },
  balanceSummaryRow: {
    flexDirection: 'row',
    gap: 20,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerAmount: {
  },
  addButtonRect: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    marginBottom: 8,
    fontSize: 18,
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: 28,
    fontSize: 15,
    lineHeight: 22,
  },
  createButton: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  createButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
