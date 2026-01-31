import { CreateGroupModal, GroupCard } from '@/components/groups';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { supabase } from '@/lib/supabase';
import { calculateBalances, groupService, initDatabase, userService } from '@/services/api';
import { CACHE_KEYS, cacheService } from '@/services/cache-service';
import type { GroupWithMembers } from '@/types/database';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function GroupsScreen() {
  const { colors, gradients, isDark } = useThemeColors();
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const hasLoadedOnce = useRef(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [])
  );

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
  }, [loading]);

  // Real-time subscriptions for group list
  useEffect(() => {
    if (!currentUserId) return;

    console.log('[Realtime] Subscribing to membership updates for user:', currentUserId);

    const subscription = supabase
      .channel(`user-groups-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_members',
          // Removed filter to rely on RLS and debug connectivity
        },
        (payload) => {
          console.log('[Realtime] Membership change detected:', payload);
          // Temporary Alert to verify event receipt
          // Alert.alert('Debug', 'Realtime update received!'); 
          loadGroups();
        }
      )
      .subscribe();

    return () => {
      console.log('[Realtime] Unsubscribing from membership updates');
      supabase.removeChannel(subscription);
    };
  }, [currentUserId]);

  const loadGroups = async (skipCache = false) => {
    if (!currentUserId) return;
    try {
      // 1. Load from cache first (instant)
      if (!skipCache) {
        const cached = await cacheService.get<GroupWithMembers[]>(CACHE_KEYS.GROUPS_LIST);
        if (cached && cached.length > 0) {
          setGroups(cached);
          hasLoadedOnce.current = true;
        }
      }

      // Only show loader if we don't have data yet
      if (!hasLoadedOnce.current) {
        setLoading(true);
        hasLoadedOnce.current = true;
      }
      await initDatabase();

      // 2. Fetch fresh data from API
      const allGroups = await groupService.getUserGroups(currentUserId);

      const groupsWithData = await Promise.all(
        allGroups.map(async (group) => {
          const balances = await calculateBalances(group.id);
          const yourBalance = balances.get(currentUserId) || 0;

          return {
            ...group,
            yourBalance,
          };
        })
      );

      // 3. Update state and cache
      setGroups(groupsWithData);
      await cacheService.set(CACHE_KEYS.GROUPS_LIST, groupsWithData);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoading(false);
    }
  }

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
          name: user?.name,
          email: user?.email,
        });
      }

      await groupService.addMember(group.id, currentUserId, 'admin');

      setNewGroupName('');
      setNewGroupDescription('');
      setModalVisible(false);
      loadGroups();
    } catch (error) {
      console.error('Error creating group:', error);
      Alert.alert('Error', 'Failed to create group');
    }
  }

  const totalBalance = groups.reduce((sum, g) => sum + (g.yourBalance || 0), 0);

  return (
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={[styles.headerLabel, { color: colors.textSecondary }]}>Total balance</ThemedText>
          <ThemedText type="header" style={[styles.headerAmount, !isDark && { color: colors.text }]}>
            ${Math.abs(totalBalance).toFixed(2)}
          </ThemedText>
        </View>
        <TouchableOpacity
          style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}
          onPress={() => router.push('/create-group')}>
          <IconSymbol size={20} name="plus" color={isDark ? '#2DD4BF' : colors.tint} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState message="Loading your groups..." />
      ) : groups.length === 0 ? (
        <Animated.View style={[
          styles.emptyContainer,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <IconSymbol size={80} name="person.3" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText type="subtitle" style={[styles.emptyTitle, { color: colors.text }]}>
            No groups yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
            Create a group to start splitting expenses with friends
          </ThemedText>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/create-group')}>
            <LinearGradient
              colors={gradients.buttonPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.createButton}>
              <IconSymbol size={20} name="plus.circle.fill" color="#0A0A0F" />
              <ThemedText style={[styles.createButtonText, { color: '#0A0A0F' }]}>Create Your First Group</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <FlatList
          data={groups}
          renderItem={({ item, index }) => <GroupCard group={item} index={index} onRefresh={loadGroups} />}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSpinner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    marginBottom: 16,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerAmount: {
    color: '#fff',
  },
  addButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonRect: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  addButton: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  addButtonGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  summaryGradient: {
    padding: 20,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 6,
  },
  summarySubtext: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.8,
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  groupCardWrapper: {
    marginBottom: 10,
  },
  groupCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  groupCardContent: {
    padding: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  groupDescription: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
  },
  balanceSection: {
    marginTop: 8,
  },
  balanceDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 12,
  },
  balanceContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardShine: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 100,
    height: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 50,
    transform: [{ translateX: 30 }, { translateY: -30 }],
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
    backgroundColor: 'rgba(24, 24, 27, 0.05)',
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
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalContent: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 20 : 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonRect: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    padding: 24,
    paddingTop: 0,
    flexGrow: 1,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.7,
  },
  modalFooter: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  submitButton: {
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  glassCard: {
  },
  glassInput: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    color: '#f4f4f5',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  modalKeyboard: {
    flex: 1,
  },
  createHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  createIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  createTitle: {
    color: '#fff',
    marginBottom: 8,
    lineHeight: 32,
  },
  createSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  privacyNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
