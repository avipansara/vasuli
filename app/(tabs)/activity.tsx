import { ActivityCard } from '@/components/activity/activity-card';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { expenseService, groupService, initDatabase, settlementService, userService } from '@/services/api';
import type { Group, User } from '@/types/database';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';

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

  useEffect(() => {
    loadActivities();
  }, []);

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

  return (
    <LinearGradient
      colors={gradients.screenBackground}
      style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={[styles.headerLabel, !isDark && { color: colors.textSecondary }]}>Recent</ThemedText>
        <ThemedText type="header" style={[styles.headerTitle, !isDark && { color: colors.text }]}>Activity</ThemedText>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : activities.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <IconSymbol size={48} name="clock" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText type="subtitle" style={[styles.emptyTitle, !isDark && { color: colors.text }]}>
            No activity yet
          </ThemedText>
          <ThemedText style={[styles.emptyText, !isDark && { color: colors.textSecondary }]}>
            Your expense and payment history will appear here
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={activities}
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
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
