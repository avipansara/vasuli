import { FriendCard } from '@/components/friends/friend-card';
import { InviteFriendModal } from '@/components/friends/invite-friend-modal';
import { QRCodeModal } from '@/components/friends/qr-code-modal';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { calculateFriendBalance, initDatabase, userService } from '@/services/api';
import type { User } from '@/types/database';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

interface UserWithBalance extends User {
  balance: number;
}

export default function FriendsScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const [friends, setFriends] = useState<UserWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');
  const [newFriendPhone, setNewFriendPhone] = useState('');
  const [inviteMethod, setInviteMethod] = useState<'email' | 'phone'>('email');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  useFocusEffect(
    useCallback(() => {
      loadFriends();
    }, [])
  );

  async function loadFriends() {
    if (!currentUserId) return;
    try {
      await initDatabase();
      const allUsers = await userService.getAll();
      
      const friendsWithBalances = await Promise.all(
        allUsers
          .filter((user: User) => user.id !== currentUserId)
          .map(async (user: User) => {
            // Calculate balance (includes all shared expenses - friend-only and group)
            const balance = await calculateFriendBalance(currentUserId, user.id);
            return { ...user, balance };
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

  function handleFriendPress(friend: UserWithBalance) {
    router.push(`/friend/${friend.id}` as any);
  }

  // Calculate net balance (positive = you are owed, negative = you owe)
  const netBalance = friends.reduce((sum, f) => sum + f.balance, 0);
  const balanceLabel = netBalance > 0 ? 'You are owed' : netBalance < 0 ? 'You owe' : 'All settled';
  const balanceColor = netBalance > 0 ? '#10b981' : netBalance < 0 ? '#ef4444' : (isDark ? '#2DD4BF' : colors.tint);

  return (
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'column', gap: 4 }}>
          <ThemedText style={[styles.headerLabel, !isDark && { color: colors.textSecondary }]}>{balanceLabel}</ThemedText>
          <ThemedText type="header" style={[styles.headerAmount, { color: balanceColor }]}>${Math.abs(netBalance).toFixed(2)}</ThemedText>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}
            onPress={() => setQrModalVisible(true)}>
            <IconSymbol size={20} name="qrcode" color={isDark ? '#2DD4BF' : colors.tint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}
            onPress={() => router.push('/scan-qr')}>
            <IconSymbol size={20} name="qrcode.viewfinder" color={isDark ? '#2DD4BF' : colors.tint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButtonRect, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)' }]}
            onPress={() => setModalVisible(true)}>
            <IconSymbol size={20} name="person.badge.plus" color={isDark ? '#2DD4BF' : colors.tint} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <IconSymbol size={64} name="person.2" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText type="subtitle" style={[styles.emptyTitle, !isDark && { color: colors.text }]}>
            No friends yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
            Add friends to split expenses with them
          </ThemedText>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setModalVisible(true)}>
            <LinearGradient
              colors={gradients.buttonPrimary}
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
          renderItem={({ item }) => <FriendCard friend={item} onPress={handleFriendPress} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      <InviteFriendModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        name={newFriendName}
        setName={setNewFriendName}
        email={newFriendEmail}
        setEmail={setNewFriendEmail}
        phone={newFriendPhone}
        setPhone={setNewFriendPhone}
        inviteMethod={inviteMethod}
        setInviteMethod={setInviteMethod}
        onSubmit={sendInvite}
      />

      <QRCodeModal
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        userId={currentUserId}
        userName={user?.name || ''}
      />
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
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
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
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addExpenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    gap: 6,
  },
  addExpenseText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2DD4BF',
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
});
