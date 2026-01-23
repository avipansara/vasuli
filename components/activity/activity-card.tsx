import { ThemedText } from '@/components/themed-text';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface ActivityItem {
  id: string;
  type: 'expense' | 'settlement' | 'group_join' | 'deleted';
  description: string;
  amount?: number;
  date: number;
  groupName?: string;
  isDeleted?: boolean;
}

interface ActivityCardProps {
  activity: ActivityItem;
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const { colors, isDark } = useThemeColors();
  const date = new Date(activity.date);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const isDeleted = activity.isDeleted || activity.description.startsWith('Deleted:');

  const iconName: IconSymbolName =
    isDeleted
      ? 'trash.fill'
      : activity.type === 'expense'
        ? 'dollarsign.circle.fill'
        : activity.type === 'settlement'
          ? 'checkmark.circle.fill'
          : 'person.badge.plus';

  const iconColor =
    isDeleted
      ? '#ef4444'
      : activity.type === 'expense'
        ? isDark ? '#2DD4BF' : colors.tint
        : activity.type === 'settlement'
          ? isDark ? '#10b981' : colors.success
          : isDark ? '#A78BFA' : '#8B5CF6';

  const iconBgColor =
    isDeleted
      ? 'rgba(239, 68, 68, 0.15)'
      : activity.type === 'expense'
        ? isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)'
        : activity.type === 'settlement'
          ? 'rgba(16, 185, 129, 0.15)'
          : 'rgba(167, 139, 250, 0.15)';

  return (
    <View
      style={[
        styles.card,
        !isDark && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      <View style={[styles.icon, { backgroundColor: iconBgColor }]}>
        <IconSymbol size={20} name={iconName} color={iconColor} />
      </View>
      <View style={styles.info}>
        <ThemedText
          type="defaultSemiBold"
          style={[
            styles.description,
            !isDark && { color: colors.text },
            isDeleted && styles.deletedText,
          ]}>
          {activity.description}
        </ThemedText>
        <View style={styles.details}>
          {activity.groupName && (
            <ThemedText style={[styles.groupName, { color: isDark ? '#2DD4BF' : colors.tint }]}>
              {activity.groupName}
            </ThemedText>
          )}
          <ThemedText style={[styles.date, !isDark && { color: colors.textSecondary }]}>
            {dateStr}
          </ThemedText>
        </View>
      </View>
      {activity.amount !== undefined && (
        <ThemedText
          style={[
            styles.amount,
            {
              color:
                activity.type === 'settlement'
                  ? isDark ? '#10b981' : colors.success
                  : !isDark ? colors.text : '#fff',
            },
          ]}>
          {activity.type === 'settlement' ? '+' : ''}${activity.amount.toFixed(2)}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  description: {
    fontSize: 14,
    color: '#fff',
  },
  deletedText: {
    color: '#ef4444',
    textDecorationLine: 'line-through',
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  groupName: {
    fontSize: 12,
    fontWeight: '500',
  },
  date: {
    fontSize: 11,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
});
