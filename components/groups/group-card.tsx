import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { createGroupDetailTraceId, logGroupDetailDiagnostic } from '@/lib/group-detail-diagnostics';
import { groupService } from '@/services/group-service';
import type { GroupWithMembers } from '@/types/database';
import { router } from 'expo-router';
import { memo, useMemo, useRef } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

interface GroupCardProps {
  group: GroupWithMembers;
  onRefresh?: () => void;
}

function areGroupCardPropsEqual(prev: GroupCardProps, next: GroupCardProps): boolean {
  if (prev.onRefresh !== next.onRefresh) {
    return false;
  }
  const a = prev.group;
  const b = next.group;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.description === b.description &&
    (a.yourBalance ?? 0) === (b.yourBalance ?? 0)
  );
}

function GroupCardInner({ group, onRefresh }: GroupCardProps) {
  const { colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const balance = group.yourBalance || 0;
  const isPositive = balance > 0;
  const isSettled = balance === 0;

  function handleEditGroup() {
    swipeableRef.current?.close();
    router.push(`/edit-group/${group.id}` as any);
  }

  function handleOpenGroup() {
    const traceId = createGroupDetailTraceId();
    logGroupDetailDiagnostic('navigate', {
      traceId,
      groupId: group.id,
      source: 'group-card',
    });
    router.push({
      pathname: '/groups/[id]',
      params: { id: group.id, groupDetailTraceId: traceId },
    } as any);
  }

  async function handleDeleteGroup() {
    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? Its history will be preserved and it can be restored later.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user?.id) throw new Error('You must be signed in to delete a group.');
              await groupService.delete(group.id, user.id);
              onRefresh?.();
            } catch (error) {
              console.error('Error deleting group:', error);
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  }

  const cardStyle = useMemo(
    () => (isDark ? {
      backgroundColor: '#000000',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.08)',
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    } : {
      backgroundColor: '#ffffff',
      borderWidth: 0,
      shadowColor: '#475569',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.09,
      shadowRadius: 0,
      elevation: 4,
    }),
    [isDark]
  );

  return (
    <View style={styles.wrapper}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderLeftActions={(_progress, translation) => (
          <GroupSwipeAction
            translation={translation}
            side="left"
            onPress={handleEditGroup}
            accessibilityLabel={`Edit ${group.name}`}
          />
        )}
        renderRightActions={(_progress, translation) => (
          <GroupSwipeAction
            translation={translation}
            side="right"
            onPress={handleDeleteGroup}
            accessibilityLabel={`Delete ${group.name}`}
          />
        )}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        overshootFriction={8}
        enableTrackpadTwoFingerGesture
        containerStyle={{ overflow: 'visible' }}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.card, cardStyle]}
          onPress={handleOpenGroup}
          accessibilityRole="button"
          accessibilityLabel={`${group.name}, ${isSettled ? 'all settled up' : `${isPositive ? 'you are owed' : 'you owe'} $${Math.abs(balance).toFixed(2)}`}`}
          accessibilityHint="Opens this group">
          <View style={styles.row}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: isDark
                    ? '#064e3b'
                    : 'rgba(34, 197, 94, 0.1)',
                },
              ]}>
              <IconSymbol
                size={28}
                name="person.3.fill"
                color={isDark ? '#10b981' : colors.tint}
              />
            </View>
            <View style={styles.info}>
              <ThemedText style={[styles.name, { color: isDark ? '#f8fafc' : colors.text }]} numberOfLines={1}>
                {group.name}
              </ThemedText>
              {group.description && (
                <ThemedText
                  style={[styles.description, { color: isDark ? '#9ba6b8' : colors.textSecondary }]}
                  numberOfLines={1}>
                  {group.description}
                </ThemedText>
              )}
            </View>
            <View style={styles.balanceContainer}>
              {isSettled ? (
                <ThemedText style={[styles.settledText, { color: isDark ? '#10b981' : colors.textSecondary }]}>
                  settled up
                </ThemedText>
              ) : (
                <>
                  <ThemedText style={[styles.balanceLabel, { color: isDark ? '#64748b' : colors.textSecondary }]}>
                    {isPositive ? "you're owed" : "you owe"}
                  </ThemedText>
                  <ThemedText
                    type='title'
                    style={[
                      styles.balanceAmount,
                      {
                        color: isDark ? (isPositive ? '#10b981' : '#ffb4ab') : (isPositive ? colors.success : colors.error),
                      },
                    ]}>
                    ${Math.abs(balance).toFixed(2)}
                  </ThemedText>
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>

      </ReanimatedSwipeable>
    </View>
  );
}

function GroupSwipeAction({
  translation,
  side,
  onPress,
  accessibilityLabel,
}: {
  translation: SharedValue<number>;
  side: 'left' | 'right';
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const actionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (side === 'left' ? translation.get() : -translation.get()) / 80)),
  }));

  return (
    <Reanimated.View style={[side === 'left' ? styles.swipeActionLeft : styles.swipeActionRight, actionStyle]}>
      <TouchableOpacity
        onPress={onPress}
        style={styles.swipeActionButton}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}>
        <IconSymbol name={side === 'left' ? 'pencil' : 'trash'} size={20} color="#fff" />
        <ThemedText style={styles.swipeActionText}>{side === 'left' ? 'Edit' : 'Delete'}</ThemedText>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

export const GroupCard = memo(GroupCardInner, areGroupCardPropsEqual);

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 10,
  },
  card: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  description: {
    fontSize: 12,
    marginTop: 2,
  },
  balanceContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  settledText: {
    fontSize: 13,
    fontWeight: '500',
  },
  swipeActionLeft: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: 80,
    borderRadius: 12,
    marginBottom: 10,
  },
  swipeActionRight: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 80,
    borderRadius: 12,
    marginBottom: 10,
  },
  swipeActionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    gap: 4,
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
