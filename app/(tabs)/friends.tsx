import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { calculateBalances, groupService, initDatabase, userService } from '@/services/database';
import type { User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface UserWithBalance extends User {
  balance: number;
}

export default function FriendsScreen() {
  const colorScheme = useColorScheme();
  const [friends, setFriends] = useState<UserWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');

  useEffect(() => {
    loadFriends();
  }, []);

  async function loadFriends() {
    try {
      await initDatabase();
      const allUsers = await userService.getAll();
      const currentUserId = 'current-user';
      
      const friendsWithBalances = await Promise.all(
        allUsers
          .filter(user => user.id !== currentUserId)
          .map(async (user) => {
            let totalBalance = 0;
            const groups = await groupService.getAll();
            
            for (const group of groups) {
              const members = await groupService.getMembers(group.id);
              const isMember = members.some(m => m.userId === user.id);
              
              if (isMember) {
                const balances = await calculateBalances(group.id);
                const userBalance = balances.get(user.id) || 0;
                const currentUserBalance = balances.get(currentUserId) || 0;
                
                if (userBalance < 0 && currentUserBalance > 0) {
                  totalBalance += Math.min(Math.abs(userBalance), currentUserBalance);
                } else if (userBalance > 0 && currentUserBalance < 0) {
                  totalBalance -= Math.min(userBalance, Math.abs(currentUserBalance));
                }
              }
            }
            
            return { ...user, balance: totalBalance };
          })
      );

      setFriends(friendsWithBalances);
    } catch (error) {
      console.error('Error loading friends:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addFriend() {
    if (!newFriendName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    try {
      await userService.create({
        name: newFriendName.trim(),
        email: newFriendEmail.trim() || undefined,
      });

      setNewFriendName('');
      setNewFriendEmail('');
      setModalVisible(false);
      loadFriends();
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to add friend');
    }
  }

  function renderFriend({ item }: { item: UserWithBalance }) {
    const balance = item.balance;
    const balanceColor = balance > 0 ? '#10b981' : balance < 0 ? '#ef4444' : Colors[colorScheme ?? 'light'].text;

    return (
      <View style={[styles.friendCard, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>
            {item.name.charAt(0).toUpperCase()}
          </ThemedText>
        </View>
        <View style={styles.friendInfo}>
          <ThemedText type="defaultSemiBold" style={styles.friendName}>
            {item.name}
          </ThemedText>
          {item.email && (
            <ThemedText style={styles.friendEmail}>{item.email}</ThemedText>
          )}
        </View>
        <View style={styles.balanceContainer}>
          {balance !== 0 && (
            <>
              <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
                ${Math.abs(balance).toFixed(2)}
              </ThemedText>
              <ThemedText style={styles.balanceLabel}>
                {balance > 0 ? 'owes you' : 'you owe'}
              </ThemedText>
            </>
          )}
          {balance === 0 && (
            <ThemedText style={styles.settledText}>settled up</ThemedText>
          )}
        </View>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <ThemedText type="title">Friends</ThemedText>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={() => setModalVisible(true)}>
          <IconSymbol size={24} name="plus" color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol size={64} name="person.2" color={Colors[colorScheme ?? 'light'].icon} />
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No friends yet
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Add friends to split expenses with them
          </ThemedText>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
            onPress={() => setModalVisible(true)}>
            <ThemedText style={styles.createButtonText}>Add Friend</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={friends}
          renderItem={renderFriend}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
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
              <ThemedText type="subtitle" style={styles.modalTitle}>Add Friend</ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <IconSymbol size={28} name="xmark.circle.fill" color={Colors[colorScheme ?? 'light'].icon} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Name</ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f9fafb',
                    color: Colors[colorScheme ?? 'light'].text,
                    borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                  }]}
                  placeholder="e.g. John Doe"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
                  value={newFriendName}
                  onChangeText={setNewFriendName}
                  autoFocus
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Email (Optional)</ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f9fafb',
                    color: Colors[colorScheme ?? 'light'].text,
                    borderColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb',
                  }]}
                  placeholder="john@example.com"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].icon}
                  value={newFriendEmail}
                  onChangeText={setNewFriendEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colorScheme === 'dark' ? '#374151' : '#e5e7eb' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={addFriend}
                disabled={!newFriendName.trim()}>
                <LinearGradient
                  colors={!newFriendName.trim() ? ['#9ca3af', '#6b7280'] : ['#6366f1', '#4f46e5']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.submitButton, !newFriendName.trim() && styles.disabledButton]}>
                  <ThemedText style={styles.submitButtonText}>Add Friend</ThemedText>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  friendCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#4f46e5',
  },
  friendInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  friendName: {
    fontSize: 16,
    marginBottom: 4,
  },
  friendEmail: {
    fontSize: 12,
    opacity: 0.6,
  },
  balanceContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  balanceLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  settledText: {
    fontSize: 12,
    opacity: 0.6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
    marginBottom: 24,
  },
  createButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
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
