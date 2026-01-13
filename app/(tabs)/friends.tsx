import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Gradients } from '@/constants/theme';
import { calculateBalances, groupService, initDatabase, userService } from '@/services/api';
import type { User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface UserWithBalance extends User {
  balance: number;
}

export default function FriendsScreen() {
  const [friends, setFriends] = useState<UserWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');
  const [newFriendPhone, setNewFriendPhone] = useState('');
  const [inviteMethod, setInviteMethod] = useState<'email' | 'phone'>('email');

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

  async function sendInvite() {
    const contact = inviteMethod === 'email' ? newFriendEmail.trim() : newFriendPhone.trim();
    
    if (!contact) {
      Alert.alert('Required', `Please enter ${inviteMethod === 'email' ? 'an email address' : 'a phone number'}`);
      return;
    }

    try {
      await userService.create({
        name: newFriendName.trim() || contact,
        email: inviteMethod === 'email' ? contact : undefined,
        phone: inviteMethod === 'phone' ? contact : undefined,
      });

      setNewFriendName('');
      setNewFriendEmail('');
      setNewFriendPhone('');
      setModalVisible(false);
      loadFriends();
      Alert.alert('Invite Sent!', `An invite has been sent to ${contact}`);
    } catch (error) {
      console.error('Error sending invite:', error);
      Alert.alert('Error', 'Failed to send invite');
    }
  }

  function renderFriend({ item }: { item: UserWithBalance }) {
    const balance = item.balance;
    const balanceColor = balance > 0 ? '#10b981' : balance < 0 ? '#ef4444' : '#2DD4BF';

    return (
      <View
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
      </View>
    );
  }

  // Calculate total owed
  const totalOwed = friends.reduce((sum, f) => f.balance < 0 ? sum + Math.abs(f.balance) : sum, 0);

  return (
    <LinearGradient
      colors={Gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'column', gap: 4 }}>
          <ThemedText style={styles.headerLabel}>You owe</ThemedText>
          <ThemedText type="header" style={styles.headerAmount}>${totalOwed.toFixed(2)}</ThemedText>
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
        presentationStyle="fullScreen"
        onRequestClose={() => setModalVisible(false)}>
        <LinearGradient colors={Gradients.screenBackground} style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <IconSymbol size={24} name="xmark" color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">
              
              <View style={styles.inviteHeader}>
                <View style={styles.inviteIconContainer}>
                  <IconSymbol size={40} name="person.badge.plus" color="#2DD4BF" />
                </View>
                <ThemedText type="title" style={styles.inviteTitle}>Invite a Friend</ThemedText>
                <ThemedText style={styles.inviteSubtitle}>
                  Send an invite via email or phone number
                </ThemedText>
              </View>

              <View style={styles.methodToggle}>
                <TouchableOpacity
                  style={[styles.methodButton, inviteMethod === 'email' && styles.methodButtonActive]}
                  onPress={() => setInviteMethod('email')}>
                  <IconSymbol size={20} name="envelope.fill" color={inviteMethod === 'email' ? '#0A0A0F' : '#2DD4BF'} />
                  <ThemedText style={[styles.methodButtonText, inviteMethod === 'email' && styles.methodButtonTextActive]}>
                    Email
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodButton, inviteMethod === 'phone' && styles.methodButtonActive]}
                  onPress={() => setInviteMethod('phone')}>
                  <IconSymbol size={20} name="phone.fill" color={inviteMethod === 'phone' ? '#0A0A0F' : '#2DD4BF'} />
                  <ThemedText style={[styles.methodButtonText, inviteMethod === 'phone' && styles.methodButtonTextActive]}>
                    Phone
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Name (Optional)</ThemedText>
                <TextInput
                  style={[styles.input, styles.glassInput]}
                  placeholder="e.g. John Doe"
                  placeholderTextColor="#6B7280"
                  value={newFriendName}
                  onChangeText={setNewFriendName}
                />
              </View>

              {inviteMethod === 'email' ? (
                <View style={styles.formGroup}>
                  <ThemedText style={styles.label}>Email Address *</ThemedText>
                  <TextInput
                    style={[styles.input, styles.glassInput]}
                    placeholder="friend@example.com"
                    placeholderTextColor="#6B7280"
                    value={newFriendEmail}
                    onChangeText={setNewFriendEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                  />
                </View>
              ) : (
                <View style={styles.formGroup}>
                  <ThemedText style={styles.label}>Phone Number *</ThemedText>
                  <TextInput
                    style={[styles.input, styles.glassInput]}
                    placeholder="+1 (555) 123-4567"
                    placeholderTextColor="#6B7280"
                    value={newFriendPhone}
                    onChangeText={setNewFriendPhone}
                    keyboardType="phone-pad"
                    autoFocus
                  />
                </View>
              )}

              <ThemedText style={styles.privacyNote}>
                We will send them an invite to join Vasuli. They will be able to accept and connect with you.
              </ThemedText>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={sendInvite}
                disabled={inviteMethod === 'email' ? !newFriendEmail.trim() : !newFriendPhone.trim()}>
                <LinearGradient
                  colors={(inviteMethod === 'email' ? !newFriendEmail.trim() : !newFriendPhone.trim()) ? ['#1A1A24', '#12121A'] : Gradients.buttonPrimary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.submitButton,
                    (inviteMethod === 'email' ? !newFriendEmail.trim() : !newFriendPhone.trim()) && styles.disabledButton
                  ]}>
                  <IconSymbol size={20} name="paperplane.fill" color={(inviteMethod === 'email' ? !newFriendEmail.trim() : !newFriendPhone.trim()) ? '#6B7280' : '#0A0A0F'} />
                  <ThemedText style={[styles.submitButtonText, { color: (inviteMethod === 'email' ? !newFriendEmail.trim() : !newFriendPhone.trim()) ? '#6B7280' : '#0A0A0F' }]}>
                    Send Invite
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </LinearGradient>
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
    padding: 20,
    paddingTop: 60,
  },
  headerLabel: {
    fontSize: 14,
    opacity: 0.6,
    color: '#fff',
  },
  headerAmount: {
    color: '#fff',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  friendCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
  modalKeyboard: {
    flex: 1,
  },
  inviteHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  inviteIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteTitle: {
    color: '#fff',
    marginBottom: 8,
    lineHeight: 32,
  },
  inviteSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  methodToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  methodButtonActive: {
    backgroundColor: '#2DD4BF',
  },
  methodButtonText: {
    color: '#2DD4BF',
    fontWeight: '600',
  },
  methodButtonTextActive: {
    color: '#0A0A0F',
  },
  privacyNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
