import { ThemedText } from '@/components/themed-text';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getActivityHref } from '@/lib/activity-link';
import type { Activity as DbActivity } from '@/types/database';
import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface ActivityItem {
  id: string;
  type: 'expense' | 'settlement' | 'group_join' | 'deleted';
  description: string;
  amount?: number;
  date: number;
  groupName?: string;
  isDeleted?: boolean;
  isUpdated?: boolean;
}

interface ActivityCardProps {
  activity: DbActivity;
  currentUserId?: string;
  deletedExpenseTargetIds?: ReadonlySet<string>;
}

function formatActivityDate(timestamp: number): string {
  const date = new Date(timestamp);
  const datePart = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${datePart} at ${timePart}`;
}

function mapDbActivityToItem(activity: DbActivity): ActivityItem {
  const typeStr = String(activity.type);
  const type: ActivityItem['type'] = typeStr.includes('deleted')
    ? 'deleted'
    : typeStr.includes('expense')
      ? 'expense'
      : typeStr.includes('settlement')
        ? 'settlement'
        : 'group_join';
  return {
    id: activity.id,
    type,
    description: activity.description,
    amount: activity.amount,
    date: activity.createdAt,
    groupName: activity.groupName,
    isDeleted: typeStr.includes('deleted'),
    isUpdated: typeStr.includes('updated'),
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
    a.userId === b.userId &&
    a.userName === b.userName &&
    prev.currentUserId === next.currentUserId &&
    prev.deletedExpenseTargetIds === next.deletedExpenseTargetIds
  );
}

function ActivityCardInner({ activity, currentUserId, deletedExpenseTargetIds }: ActivityCardProps) {
  const { colors, isDark } = useThemeColors();
  const item = mapDbActivityToItem(activity);
  const href = getActivityHref(activity, currentUserId, deletedExpenseTargetIds);
  const dateStr = formatActivityDate(item.date);

  const isDeleted = item.isDeleted || item.description.startsWith('Deleted:');
  const isUpdated = item.isUpdated || item.description.startsWith('Updated:');
  const title = item.description.replace(/^(Deleted|Updated):\s*/i, '');
  const actorName = activity.userName?.trim() || 'Someone';
  const actorLabel = currentUserId && activity.userId === currentUserId ? 'You' : actorName;
  const amountLabel = item.amount === undefined ? null : `${item.type === 'settlement' ? '+' : ''}$${item.amount.toFixed(2)}`;
  const statusLabel = isDeleted ? 'Deleted' : isUpdated ? 'Updated' : null;
  const accessibilityLabel = [
    statusLabel,
    title,
    `by ${actorLabel}`,
    dateStr,
    item.groupName ? `in ${item.groupName}` : null,
    amountLabel,
  ].filter(Boolean).join(', ');

  const iconName: IconSymbolName =
    isDeleted
      ? 'trash.fill'
      : item.type === 'expense'
        ? 'dollarsign.circle.fill'
        : item.type === 'settlement'
          ? 'checkmark.circle.fill'
          : 'person.badge.plus';

  const statusColor = isDeleted ? colors.error : isDark ? '#FBBF24' : '#B45309';
  const statusBgColor = isDeleted
    ? isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.1)'
    : isDark ? 'rgba(251, 191, 36, 0.14)' : 'rgba(245, 158, 11, 0.12)';
  const amountColor = isDeleted
    ? colors.textSecondary
    : item.type === 'settlement'
      ? isDark ? '#10b981' : colors.success
      : colors.text;

  const iconColor =
    isDeleted
      ? colors.error
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

  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: iconBgColor }]}>
        <IconSymbol size={20} name={iconName} color={iconColor} />
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <ThemedText
            type="defaultSemiBold"
            numberOfLines={2}
            style={[styles.description, { color: colors.text }]}>
            {title}
          </ThemedText>
          {statusLabel && (
            <View style={[styles.statusBadge, { backgroundColor: statusBgColor }]}>
              <ThemedText style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </ThemedText>
            </View>
          )}
        </View>
        <ThemedText style={[styles.actor, { color: colors.textSecondary }]} numberOfLines={1}>
          {actorLabel}, {dateStr}
        </ThemedText>
        {item.groupName && (
          <View style={styles.details}>
            <View
              style={[
                styles.groupPill,
                {
                  backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(7, 202, 79, 0.08)',
                },
              ]}>
              <ThemedText
                type="defaultSemiBold"
                numberOfLines={1}
                style={[styles.groupName, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                {item.groupName}
              </ThemedText>
            </View>
          </View>
        )}
      </View>
      {(item.amount !== undefined || href) && (
        <View style={styles.trailing}>
          {item.amount !== undefined && (
            <ThemedText
              type="subtitle"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={[styles.amount, { color: amountColor }]}>
              {amountLabel}
            </ThemedText>
          )}
          {href && (
            <IconSymbol
              size={14}
              name="chevron.right"
              color={isDark ? 'rgba(225, 245, 239, 0.36)' : colors.textSecondary}
            />
          )}
        </View>
      )}
    </>
  );

  const cardStyle = [
    styles.card,
    {
      backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
      borderWidth: 0,
      shadowColor: isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.22 : 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
  ];

  if (href) {
    return (
      <TouchableOpacity
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Opens the related activity details"
        onPress={() => router.push(href)}
        style={cardStyle}>
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle}>
      {content}
    </View>
  );
}

export const ActivityCard = memo(ActivityCardInner, areActivityCardPropsEqual);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  description: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#fff',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 1,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  actor: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },
  groupPill: {
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  groupName: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  amount: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  trailing: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 8,
    marginLeft: 12,
    maxWidth: 96,
    paddingTop: 2,
  },
});
