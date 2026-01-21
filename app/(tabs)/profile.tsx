import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useTheme } from '@/contexts/theme-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { calculateUserTotalBalance, initDatabase, userService } from '@/services/api';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

export default function ProfileScreen() {
  const { gradients, isDark, colors } = useThemeColors();
  const { toggleTheme } = useTheme();
  const { user: currentUser, signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [totalOwed, setTotalOwed] = useState(0);
  const [totalOwing, setTotalOwing] = useState(0);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  useEffect(() => {
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
  }, []);

  async function loadStats() {
    try {
      await initDatabase();
      const currentUserId = currentUser?.id || '';

      // Use unified balance calculation service
      const { totalOwed: totalOwedAmount, totalOwing: totalOwingAmount } = await calculateUserTotalBalance(currentUserId);

      setTotalOwed(totalOwedAmount);
      setTotalOwing(totalOwingAmount);

    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  function handleEditProfile() {
    router.push('/edit-profile');
  }

  async function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive', onPress: async () => {
          await signOut();
        }
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This will permanently remove all your data including expenses, groups, and friendships. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation for destructive action
            Alert.alert(
              'Confirm Deletion',
              'Please confirm that you want to permanently delete your account and all associated data.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      if (currentUser?.id) {
                        await userService.delete(currentUser.id);
                      }
                      await signOut();
                    } catch (error) {
                      console.error('Error deleting account:', error);
                      Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  const [playgroundVisible, setPlaygroundVisible] = useState(false);

  const settingsItems = [
    { icon: 'envelope.badge', title: 'Invitations', onPress: () => router.push('/invitations') },
    { icon: 'person.badge.plus', title: 'Invite a Friend', onPress: () => router.push('/add-friend') },
    // { icon: 'figure.skateboarding', title: 'Loading Playground', onPress: () => setPlaygroundVisible(true) },
    { icon: 'bell.fill', title: 'Notifications', hasSwitch: true, value: notificationsEnabled, onToggle: setNotificationsEnabled },
    { icon: 'moon.fill', title: 'Dark Mode', hasSwitch: true, value: isDark, onToggle: toggleTheme },
    { icon: 'lock.shield.fill', title: 'Privacy Policy', onPress: () => router.push('/privacy-policy') },
    { icon: 'doc.text.fill', title: 'Terms & Conditions', onPress: () => router.push('/terms-conditions') },
    { icon: 'questionmark.circle.fill', title: 'Help & Support', onPress: () => router.push('/help-support') },
  ];

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header} />
        <View style={styles.profileSection}>
          <View style={[styles.avatarLarge, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <ThemedText style={[styles.avatarLargeText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
              {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
            </ThemedText>
          </View>
          <ThemedText type="title" style={[styles.userName, !isDark && { color: colors.text }]}>
            {currentUser?.name || 'User'}
          </ThemedText>
          <ThemedText style={[styles.userEmail, !isDark && { color: colors.textSecondary }]}>
            {currentUser?.email || 'No email set'}
          </ThemedText>
          <Pressable style={styles.editButton} onPress={handleEditProfile}>
            <ThemedText style={styles.editButtonText}>Edit Profile</ThemedText>
          </Pressable>
        </View>

        <View style={[styles.statsSection, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, !isDark && { color: colors.text }]}>${totalOwed.toFixed(2)}</ThemedText>
            <ThemedText style={[styles.statLabel, !isDark && { color: colors.textSecondary }]}>Total Owed</ThemedText>
          </View>
          <View style={[styles.statDivider, !isDark && { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, !isDark && { color: colors.text }]}>${totalOwing.toFixed(2)}</ThemedText>
            <ThemedText style={[styles.statLabel, !isDark && { color: colors.textSecondary }]}>Total Owing</ThemedText>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <ThemedText style={[styles.sectionTitle, !isDark && { color: colors.textSecondary }]}>Settings</ThemedText>
          {settingsItems.map((item, index) => (
            <Pressable
              key={index}
              style={[styles.settingItem, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={item.onPress}
              disabled={item.hasSwitch}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
                  <IconSymbol name={item.icon as any} size={20} color={isDark ? '#2DD4BF' : colors.tint} />
                </View>
                <ThemedText style={[styles.settingTitle, !isDark && { color: colors.text }]}>{item.title}</ThemedText>
              </View>
              {item.hasSwitch ? (
                <Switch
                  value={item.value}
                  onValueChange={item.onToggle}
                  trackColor={{ false: isDark ? '#333' : '#D4D4D4', true: isDark ? 'rgba(45, 212, 191, 0.4)' : 'rgba(34, 197, 94, 0.4)' }}
                  thumbColor={item.value ? (isDark ? '#2DD4BF' : colors.tint) : (isDark ? '#666' : '#999')}
                />
              ) : (
                <IconSymbol name="chevron.right" size={16} color={isDark ? 'rgba(255,255,255,0.4)' : colors.textSecondary} />
              )}
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color="#EF4444" />
          <ThemedText style={styles.logoutText}>Logout</ThemedText>
        </Pressable>

        <Pressable style={[styles.logoutButton, styles.deleteButton]} onPress={handleDeleteAccount}>
          <IconSymbol name="trash.fill" size={20} color="#DC2626" />
          <ThemedText style={[styles.logoutText, styles.deleteText]}>Delete Account</ThemedText>
        </Pressable>

        <ThemedText style={[styles.versionText, !isDark && { color: colors.textSecondary }]}>Version 1.0.0</ThemedText>
      </ScrollView>

      {/* Loading Playground Modal */}
      <Modal
        visible={playgroundVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPlaygroundVisible(false)}>
        <LinearGradient colors={gradients.screenBackground} style={styles.playgroundContainer}>
          {/* Header */}
          <View style={styles.playgroundHeader}>
            <TouchableOpacity
              onPress={() => setPlaygroundVisible(false)}
              style={[styles.closeButton, {
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)'
              }]}>
              <IconSymbol size={20} name="xmark" color={isDark ? '#2DD4BF' : colors.tint} />
            </TouchableOpacity>
            <ThemedText type="title" style={[styles.playgroundTitle, !isDark && { color: colors.text }]}>
              Loading Playground
            </ThemedText>
            <View style={{ width: 40 }} />
          </View>

          {/* Instructions */}
          <View style={[styles.instructionsCard, {
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)'
          }]}>
            <ThemedText style={[styles.instructionsTitle, !isDark && { color: colors.text }]}>
              🎮 How to Play
            </ThemedText>
            <ThemedText style={[styles.instructionsText, !isDark && { color: colors.textSecondary }]}>
              • Swipe left/right to move the skateboard{"\n"}
              • Double tap to perform a jump trick{"\n"}
              • Shake your device for a jump{"\n"}
              • Release to auto-play
            </ThemedText>
          </View>

          {/* Loading Animation */}
          <View style={styles.playgroundContent}>
            <LoadingState message="Try the controls!" />
          </View>
        </LinearGradient>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLargeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2DD4BF',
    lineHeight: 32,
  },
  userName: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 16,
  },
  editButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
  },
  editButtonText: {
    color: '#2DD4BF',
    fontSize: 14,
    fontWeight: '600',
  },
  statsSection: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2DD4BF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  settingsSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 15,
    color: '#fff',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
  deleteButton: {
    marginTop: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
  deleteText: {
    color: '#DC2626',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#fff',
    opacity: 0.5,
    marginTop: 20,
  },
  playgroundContainer: {
    flex: 1,
  },
  playgroundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingBottom: 20,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playgroundTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  instructionsCard: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    lineHeight: 22,
  },
  playgroundContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
