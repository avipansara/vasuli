import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { calculateBalances, groupService, initDatabase, userService } from '@/services/api';
import type { GroupWithMembers } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

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
    const isSettled = balance === 0;

    const gradientColors = Gradients.cardPrimary;

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
            style={[styles.groupCard, styles.glassCard]}>
            <View style={styles.groupCardContent}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupIconContainer, { 
                  backgroundColor: 'rgba(45, 212, 191, 0.15)',
                }]}>
                  <IconSymbol size={28} name="person.3.fill" color="#2DD4BF" />
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
              
              <View style={[styles.balanceSection, { borderTopColor: 'rgba(45, 212, 191, 0.2)' }]}>
                <View style={styles.balanceContent}>
                  <ThemedText style={styles.balanceLabel}>
                    {isSettled ? 'All settled up' : isPositive ? 'You are owed' : 'You owe'}
                  </ThemedText>
                  {!isSettled && (
                    <ThemedText style={[
                      styles.balanceAmount,
                      { color: isPositive ? '#10b981' : '#ef4444' }
                    ]}>
                      ${Math.abs(balance).toFixed(2)}
                    </ThemedText>
                  )}
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const totalBalance = groups.reduce((sum, g) => sum + (g.yourBalance || 0), 0);

  return (
    <LinearGradient
      colors={Gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerLabel}>Total balance</ThemedText>
          <ThemedText type="header" style={styles.headerAmount}>
            ${Math.abs(totalBalance).toFixed(2)}
          </ThemedText>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}>
          <View style={styles.addButtonCircle}>
            <IconSymbol size={20} name="plus" color="#2DD4BF" />
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : groups.length === 0 ? (
        <Animated.View entering={FadeInDown.springify()} style={styles.emptyContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: 'rgba(45, 212, 191, 0.1)' }]}>
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
              colors={Gradients.buttonPrimary}
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
          <View style={[styles.modalContent, { backgroundColor: '#0A0A0F' }]}>
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
                  style={[styles.input, styles.glassInput]}
                  placeholder="e.g. Summer Trip 2024"
                  placeholderTextColor="#6B7280"
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  autoFocus
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Description</ThemedText>
                <TextInput
                  style={[styles.input, styles.textArea, styles.glassInput]}
                  placeholder="What's this group for? (optional)"
                  placeholderTextColor="#6B7280"
                  value={newGroupDescription}
                  onChangeText={setNewGroupDescription}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: 'rgba(45, 212, 191, 0.15)' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={createGroup}
                disabled={!newGroupName.trim()}>
                <LinearGradient
                  colors={!newGroupName.trim() ? ['#1A1A24', '#12121A'] : Gradients.buttonPrimary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.submitButton, 
                    !newGroupName.trim() && styles.disabledButton
                  ]}>
                  <ThemedText style={[styles.submitButtonText, { color: !newGroupName.trim() ? '#6B7280' : '#0A0A0F' }]}>Create Group</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    marginBottom: 16,
  },
  headerLabel: {
    fontSize: 14,
    opacity: 0.6,
    color: '#fff',
  },
  headerAmount: {
    color: '#fff',
  },
  addButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    opacity: 0.6,
    marginBottom: 24,
    fontSize: 13,
    lineHeight: 20,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 40,
  },
  modalTitle: {
    fontSize: 20,
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
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  glassInput: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    color: '#f4f4f5',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
});
