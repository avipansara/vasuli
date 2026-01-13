import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { calculateBalances, groupService, initDatabase, userService } from '@/services/database';
import type { GroupWithMembers } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

export default function GroupsScreen() {
  const colorScheme = useColorScheme();
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      await initDatabase();
      const allGroups = await groupService.getAll();
      
      const groupsWithData = await Promise.all(
        allGroups.map(async (group) => {
          const balances = await calculateBalances(group.id);
          const currentUserId = 'current-user';
          const yourBalance = balances.get(currentUserId) || 0;
          
          return {
            ...group,
            yourBalance,
          };
        })
      );
      
      setGroups(groupsWithData);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    try {
      const group = await groupService.create({
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
      });

      const currentUser = await userService.getById('current-user');
      if (!currentUser) {
        await userService.create({
          name: 'You',
        });
      }

      await groupService.addMember(group.id, 'current-user', 'admin');

      setNewGroupName('');
      setNewGroupDescription('');
      setModalVisible(false);
      loadGroups();
    } catch (error) {
      console.error('Error creating group:', error);
      Alert.alert('Error', 'Failed to create group');
    }
  }

  function renderGroup({ item, index }: { item: GroupWithMembers; index: number }) {
    const balance = item.yourBalance || 0;
    const isPositive = balance > 0;
    const isNegative = balance < 0;
    const isSettled = balance === 0;

    const gradientColors = isPositive 
      ? ['#10b981', '#059669'] 
      : isNegative 
      ? ['#ef4444', '#dc2626']
      : colorScheme === 'dark'
      ? ['#374151', '#1f2937']
      : ['#f3f4f6', '#e5e7eb'];

    return (
      <Animated.View
        entering={FadeInDown.delay(index * 100).springify()}
        style={styles.groupCardWrapper}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push(`/group/${item.id}` as any)}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.groupCard}>
            <View style={styles.groupCardContent}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupIconContainer, { 
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                }]}>
                  <IconSymbol size={28} name="person.3.fill" color="#fff" />
                </View>
                <View style={styles.groupInfo}>
                  <ThemedText style={styles.groupName}>
                    {item.name}
                  </ThemedText>
                  {item.description && (
                    <ThemedText style={styles.groupDescription}>
                      {item.description}
                    </ThemedText>
                  )}
                </View>
              </View>
              
              <View style={styles.balanceSection}>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceContent}>
                  <ThemedText style={styles.balanceLabel}>
                    {isSettled ? 'All settled up' : isPositive ? 'You are owed' : 'You owe'}
                  </ThemedText>
                  {!isSettled && (
                    <ThemedText style={styles.balanceAmount}>
                      ${Math.abs(balance).toFixed(2)}
                    </ThemedText>
                  )}
                </View>
              </View>
            </View>
            
            <View style={styles.cardShine} />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const totalBalance = groups.reduce((sum, g) => sum + (g.yourBalance || 0), 0);

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={colorScheme === 'dark' ? ['#1f2937', '#111827'] : ['#ffffff', '#f9fafb']}
        style={styles.headerGradient}>
        <Animated.View entering={FadeInUp.springify()} style={styles.header}>
          <View>
            <ThemedText type="title" style={styles.headerTitle}>Your Groups</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              {groups.length} {groups.length === 1 ? 'group' : 'groups'}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}>
            <LinearGradient
              colors={['#6366f1', '#4f46e5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addButtonGradient}>
              <IconSymbol size={24} name="plus" color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {groups.length > 0 && (
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.summaryCard}>
            <LinearGradient
              colors={totalBalance >= 0 ? ['#10b981', '#059669'] : ['#ef4444', '#dc2626']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryGradient}>
              <ThemedText style={styles.summaryLabel}>Total Balance</ThemedText>
              <ThemedText style={styles.summaryAmount}>
                {totalBalance === 0 ? 'All settled' : `$${Math.abs(totalBalance).toFixed(2)}`}
              </ThemedText>
              {totalBalance !== 0 && (
                <ThemedText style={styles.summarySubtext}>
                  {totalBalance > 0 ? 'You are owed' : 'You owe'}
                </ThemedText>
              )}
            </LinearGradient>
          </Animated.View>
        )}
      </LinearGradient>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : groups.length === 0 ? (
        <Animated.View entering={FadeInDown.springify()} style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <IconSymbol size={80} name="person.3" color={Colors[colorScheme ?? 'light'].icon} />
          </View>
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No groups yet
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Create a group to start splitting expenses with friends
          </ThemedText>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setModalVisible(true)}>
            <LinearGradient
              colors={['#6366f1', '#4f46e5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.createButton}>
              <IconSymbol size={20} name="plus.circle.fill" color="#fff" />
              <ThemedText style={styles.createButtonText}>Create Your First Group</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroup}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle" style={styles.modalTitle}>Create New Group</ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <IconSymbol size={28} name="xmark.circle.fill" color={Colors[colorScheme ?? 'light'].icon} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Group Name</ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f9fafb',
                    color: Colors[colorScheme ?? 'light'].text,
                    borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                  }]}
                  placeholder="e.g. Summer Trip 2024"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  autoFocus
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Description</ThemedText>
                <TextInput
                  style={[styles.input, styles.textArea, { 
                    backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f9fafb',
                    color: Colors[colorScheme ?? 'light'].text,
                    borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                  }]}
                  placeholder="What's this group for? (optional)"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
                  value={newGroupDescription}
                  onChangeText={setNewGroupDescription}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={createGroup}
                disabled={!newGroupName.trim()}>
                <LinearGradient
                  colors={!newGroupName.trim() ? ['#9ca3af', '#6b7280'] : ['#6366f1', '#4f46e5']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.submitButton, !newGroupName.trim() && styles.disabledButton]}>
                  <ThemedText style={styles.submitButtonText}>Create Group</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 4,
  },
  addButton: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  addButtonGradient: {
    width: 56,
    height: 56,
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
    padding: 24,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  summarySubtext: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
    marginTop: 4,
  },
  listContent: {
    padding: 20,
    paddingTop: 24,
  },
  groupCardWrapper: {
    marginBottom: 16,
  },
  groupCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  groupCardContent: {
    padding: 20,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  groupIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 14,
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
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 24,
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
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    marginBottom: 12,
    fontSize: 24,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
    marginBottom: 32,
    fontSize: 16,
    lineHeight: 24,
  },
  createButton: {
    flexDirection: 'row',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 40,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  modalScrollContent: {
    padding: 24,
    paddingTop: 0,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
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
    padding: 16,
    fontSize: 16,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  submitButton: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
