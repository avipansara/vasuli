import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { expenseService, groupService, initDatabase, settlementService, userService } from '@/services/database';
import type { Group, User } from '@/types/database';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

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
  const colorScheme = useColorScheme();
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

  function renderActivity({ item }: { item: ActivityItem }) {
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const iconName = item.type === 'expense' ? 'dollarsign.circle.fill' : 'arrow.right.circle.fill';
    const iconColor = item.type === 'expense' ? Colors[colorScheme ?? 'light'].text : '#10b981';

    return (
      <View style={[styles.activityCard, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <View style={[styles.activityIcon, { backgroundColor: item.type === 'expense' ? (colorScheme === 'dark' ? '#27272a' : '#f4f4f5') : (colorScheme === 'dark' ? '#064e3b' : '#d1fae5') }]}>
          <IconSymbol size={24} name={iconName} color={iconColor} />
        </View>
        <View style={styles.activityInfo}>
          <ThemedText type="defaultSemiBold" style={styles.activityDescription}>
            {item.description}
          </ThemedText>
          <View style={styles.activityDetails}>
            {item.group && (
              <ThemedText style={styles.groupName}>{item.group.name}</ThemedText>
            )}
            <ThemedText style={styles.activityDate}> • {dateStr} at {timeStr}</ThemedText>
          </View>
          {item.type === 'expense' && item.user && (
            <ThemedText style={styles.paidBy}>Paid by {item.user.name}</ThemedText>
          )}
        </View>
        <View style={styles.amountContainer}>
          <ThemedText style={[styles.amount, { color: item.type === 'expense' ? Colors[colorScheme ?? 'light'].text : '#10b981' }]}>
            ${item.amount.toFixed(2)}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <ThemedText type="title">Activity</ThemedText>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : activities.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol size={64} name="clock" color={Colors[colorScheme ?? 'light'].icon} />
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No activity yet
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Your expense and payment history will appear here
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={activities}
          renderItem={renderActivity}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
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
  listContent: {
    padding: 16,
  },
  activityCard: {
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
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
  },
});
