import { ThemedText } from '@/components/themed-text';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ActivityType } from '@/types/database';
import type { Activity as DbActivity } from '@/types/database';
import { router } from 'expo-router';
import React, { memo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

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
  activity: DbActivity;
}

function mapDbActivityToItem(activity: DbActivity): ActivityItem {
  const typeStr = String(activity.type);
  const type: ActivityItem['type'] = typeStr.includes('expense')
    ? 'expense'
    : typeStr.includes('settlement')
      ? 'settlement'
      : typeStr.includes('deleted')
        ? 'deleted'
        : 'group_join';
  return {
    id: activity.id,
    type,
    description: activity.description,
    amount: activity.amount ?? 0,
    date: activity.createdAt,
    groupName: activity.groupName,
    isDeleted: typeStr.includes('deleted'),
  };
}

function areActivityCardPropsEqual(prev: ActivityCardProps, next: ActivityCardProps): boolean {
  const a = prev.activity;
  const b = next.activity;
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.description === b.description &&
    a.amount === b.amount &&
    a.createdAt === b.createdAt &&
    a.groupName === b.groupName &&
    a.targetId === b.targetId
  );
}

function ActivityCardInner({ activity }: ActivityCardProps) {
  const { colors, isDark } = useThemeColors();
  const item = mapDbActivityToItem(activity);
  const date = new Date(item.date);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const isDeleted = item.isDeleted || item.description.startsWith('Deleted:');
  const canOpenDetails =
    !isDeleted &&
    (activity.type === ActivityType.EXPENSE_CREATED || activity.type === ActivityType.EXPENSE_UPDATED);

  const iconName: IconSymbolName =
    isDeleted
      ? 'trash.fill'
      : item.type === 'expense'
        ? 'dollarsign.circle.fill'
        : item.type === 'settlement'
          ? 'checkmark.circle.fill'
          : 'person.badge.plus';

  const iconColor =
    isDeleted
      ? '#ef4444'
      : item.type === 'expense'
        ? isDark ? '#2DD4BF' : colors.tint
        : item.type === 'settlement'
          ? isDark ? '#10b981' : colors.success
          : isDark ? '#A78BFA' : '#8B5CF6';

  const iconBgColor =
    isDeleted
      ? 'rgba(239, 68, 68, 0.15)'
      : item.type === 'expense'
        ? isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)'
        : item.type === 'settlement'
          ? 'rgba(16, 185, 129, 0.15)'
          : 'rgba(167, 139, 250, 0.15)';

  const cardContent = (
    <>
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
          {item.description}
        </ThemedText>
        <View style={styles.details}>
          {item.groupName && (
            <ThemedText style={[styles.groupName, { color: isDark ? '#2DD4BF' : colors.tint }]}>
              {item.groupName}
            </ThemedText>
          )}
          <ThemedText style={[styles.date, !isDark && { color: colors.textSecondary }]}>
            {dateStr}
          </ThemedText>
        </View>
      </View>
      {item.amount !== undefined && (
        <ThemedText
          style={[
            styles.amount,
            {
              color:
                item.type === 'settlement'
                  ? isDark ? '#10b981' : colors.success
                  : !isDark ? colors.text : '#fff',
            },
          ]}>
          {item.type === 'settlement' ? '+' : ''}${item.amount.toFixed(2)}
        </ThemedText>
      )}
    </>
  );

  if (canOpenDetails) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => router.push(`/expense-detail/${activity.targetId}` as any)}
        testID={`activity-${activity.id}`}
        style={[
          styles.card,
          !isDark && { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        styles.card,
        !isDark && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      {cardContent}
    </View>
  );
}

export const ActivityCard = memo(ActivityCardInner, areActivityCardPropsEqual);

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
