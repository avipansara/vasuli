import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { userService } from '@/services/api';
import type { User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

export default function ProfileScreen() {
  const { gradients, isDark, colors } = useThemeColors();
  const { toggleTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  async function loadCurrentUser() {
    try {
      const users = await userService.getAll();
      if (users.length > 0) {
        setCurrentUser(users[0]);
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  }

  function handleEditProfile() {
    Alert.alert('Edit Profile', 'Profile editing coming soon!');
  }

  function handleSettingPress(setting: string) {
    Alert.alert(setting, `${setting} settings coming soon!`);
  }

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => Alert.alert('Logged out') },
    ]);
  }

  const settingsItems = [
    { icon: 'person.badge.plus', title: 'Add a Friend', onPress: () => handleSettingPress('Add a Friend') },
    { icon: 'bell.fill', title: 'Notifications', hasSwitch: true, value: notificationsEnabled, onToggle: setNotificationsEnabled },
    { icon: 'moon.fill', title: 'Dark Mode', hasSwitch: true, value: isDark, onToggle: toggleTheme },
    { icon: 'questionmark.circle.fill', title: 'Help & Support', onPress: () => handleSettingPress('Help & Support') },
    { icon: 'info.circle.fill', title: 'About', onPress: () => handleSettingPress('About') },
  ];

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={[styles.headerTitle, !isDark && { color: colors.text }]}>Profile</ThemedText>
        </View>

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
            <ThemedText style={[styles.statValue, !isDark && { color: colors.text }]}>$0.00</ThemedText>
            <ThemedText style={[styles.statLabel, !isDark && { color: colors.textSecondary }]}>Total Owed</ThemedText>
          </View>
          <View style={[styles.statDivider, !isDark && { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, !isDark && { color: colors.text }]}>$0.00</ThemedText>
            <ThemedText style={[styles.statLabel, !isDark && { color: colors.textSecondary }]}>Total Owing</ThemedText>
          </View>
          <View style={[styles.statDivider, !isDark && { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, !isDark && { color: colors.text }]}>0</ThemedText>
            <ThemedText style={[styles.statLabel, !isDark && { color: colors.textSecondary }]}>Groups</ThemedText>
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

        <ThemedText style={[styles.versionText, !isDark && { color: colors.textSecondary }]}>Version 1.0.0</ThemedText>
      </ScrollView>
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
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
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
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 24,
  },
});
