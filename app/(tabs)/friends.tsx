import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { calculateBalances, groupService, initDatabase, userService } from '@/services/api';
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
    const balanceColor = balance > 0 ? '#10b981' : balance < 0 ? '#ef4444' : '#2DD4BF';

    return (
      <LinearGradient
        colors={Gradients.cardPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.friendCard}>
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
      </LinearGradient>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={Gradients.hero}
        style={styles.header}>
        <ThemedText type="title">Friends</ThemedText>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}>
          <LinearGradient
            colors={Gradients.buttonPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addButtonGradient}>
            <IconSymbol size={24} name="plus" color="#0A0A0F" />
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <IconSymbol size={64} name="person.2" color="#2DD4BF" />
          </View>
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No friends yet
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Add friends to split expenses with them
          </ThemedText>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setModalVisible(true)}>
            <LinearGradient
              colors={Gradients.buttonPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.createButtonGradient}>
              <ThemedText style={styles.createButtonText}>Add Friend</ThemedText>
            </LinearGradient>
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
          <View style={[styles.modalContent, { backgroundColor: '#0A0A0F' }]}>
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
                  style={[styles.input, styles.glassInput]}
                  placeholder="e.g. John Doe"
                  placeholderTextColor="#6B7280"
                  value={newFriendName}
                  onChangeText={setNewFriendName}
                  autoFocus
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Email (Optional)</ThemedText>
                <TextInput
                  style={[styles.input, styles.glassInput]}
                  placeholder="john@example.com"
                  placeholderTextColor="#6B7280"
                  value={newFriendEmail}
                  onChangeText={setNewFriendEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: 'rgba(45, 212, 191, 0.15)' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={addFriend}
                disabled={!newFriendName.trim()}>
                <LinearGradient
                  colors={!newFriendName.trim() ? ['#1A1A24', '#12121A'] : Gradients.buttonPrimary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.submitButton,
                    !newFriendName.trim() && styles.disabledButton
                  ]}>
                  <ThemedText style={[styles.submitButtonText, { color: !newFriendName.trim() ? '#6B7280' : '#0A0A0F' }]}>Add Friend</ThemedText>
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
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2DD4BF',
  },
  friendInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  friendName: {
    fontSize: 14,
    marginBottom: 2,
  },
  friendEmail: {
    fontSize: 11,
    opacity: 0.6,
  },
  balanceContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  balanceLabel: {
    fontSize: 10,
    opacity: 0.6,
  },
  settledText: {
    fontSize: 11,
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  createButtonText: {
    color: '#0A0A0F',
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
  addButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  glassInput: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    color: '#f4f4f5',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
});
