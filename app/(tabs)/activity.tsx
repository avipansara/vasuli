import { ActivityCard } from '@/components/activity/activity-card';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { expenseService, groupService, initDatabase, settlementService, userService } from '@/services/api';
import type { Group, User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, SectionList, StyleSheet, View } from 'react-native';

type ActivityItem = {
  id: string;
  type: 'expense' | 'settlement';
  date: number;
  description: string;
  amount: number;
  group?: Group;
  user?: User;
};

export default function ActivityScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    loadActivities();
  }, []);

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

  async function loadActivities() {
    try {
      await initDatabase();
      const allActivities: ActivityItem[] = [];
      const groups = await groupService.getAll();

      for (const group of groups) {
        const expenses = await expenseService.getByGroup(group.id);
        for (const expense of expenses) {
          const user = await userService.getById(expense.paidBy);
          allActivities.push({
            id: expense.id,
            type: 'expense',
            date: expense.date,
            description: expense.description,
            amount: expense.amount,
            group,
            user: user || undefined,
          });
        }

        const settlements = await settlementService.getByGroup(group.id);
        for (const settlement of settlements) {
          const fromUser = await userService.getById(settlement.fromUserId);
          const toUser = await userService.getById(settlement.toUserId);
          allActivities.push({
            id: settlement.id,
            type: 'settlement',
            date: settlement.date,
            description: `${fromUser?.name || 'Someone'} paid ${toUser?.name || 'someone'}`,
            amount: settlement.amount,
            group,
          });
        }
      }

      allActivities.sort((a, b) => b.date - a.date);
      setActivities(allActivities);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setLoading(false);
    }
  }

  // Group activities by time period
  function getTimePeriod(timestamp: number): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0 && date.toDateString() === now.toDateString()) return 'Today';
    if (diffDays === 1 || (diffDays === 0 && date.toDateString() !== now.toDateString())) return 'Yesterday';
    if (diffDays < 7) return 'This Week';
    if (diffDays < 30) return 'This Month';
    return 'Earlier';
  }

  const groupedActivities = activities.reduce((acc, activity) => {
    const period = getTimePeriod(activity.date);
    const existing = acc.find(g => g.title === period);
    if (existing) {
      existing.data.push(activity);
    } else {
      acc.push({ title: period, data: [activity] });
    }
    return acc;
  }, [] as { title: string; data: ActivityItem[] }[]);

  return (
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={[styles.headerLabel, !isDark && { color: colors.textSecondary }]}>Recent</ThemedText>
        <ThemedText type="header" style={[styles.headerTitle, !isDark && { color: colors.text }]}>Activity</ThemedText>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingSpinner}>
            <IconSymbol size={32} name="arrow.trianglehead.2.clockwise" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      ) : activities.length === 0 ? (
        <Animated.View style={[
          styles.emptyContainer,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <IconSymbol size={48} name="clock" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText type="subtitle" style={[styles.emptyTitle, !isDark && { color: colors.text }]}>
            No activity yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
            Your expense and payment history will appear here
          </ThemedText>
        </Animated.View>
      ) : (
        <SectionList
          sections={groupedActivities}
          renderItem={({ item }) => (
            <ActivityCard
              activity={{
                id: item.id,
                type: item.type,
                description: item.description,
                amount: item.amount,
                date: item.date,
                groupName: item.group?.name,
              }}
            />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, !isDark && { color: colors.textSecondary }]}>
                {title}
              </ThemedText>
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
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
    flexDirection: 'column',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    gap: 4,
  },
  headerLabel: {
    fontSize: 14,
    opacity: 0.6,
    color: '#fff',
  },
  headerTitle: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  activityCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  activityDescription: {
    fontSize: 16,
    marginBottom: 4,
  },
  activityDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  groupName: {
    fontSize: 12,
    opacity: 0.6,
  },
  activityDate: {
    fontSize: 12,
    opacity: 0.6,
  },
  paidBy: {
    fontSize: 11,
    opacity: 0.5,
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
  },
});
