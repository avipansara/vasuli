import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { groupService } from '@/services/group-service';
import type { GroupWithMembers } from '@/types/database';
import { router } from 'expo-router';
import { memo, useRef } from 'react';
import { Alert, Animated as RNAnimated, StyleSheet, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface GroupCardProps {
  group: GroupWithMembers;
  index: number;
  onRefresh?: () => void;
}

function areGroupCardPropsEqual(prev: GroupCardProps, next: GroupCardProps): boolean {
  if (prev.onRefresh !== next.onRefresh || prev.index !== next.index) {
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

function GroupCardInner({ group, index, onRefresh }: GroupCardProps) {
  const { colors, isDark } = useThemeColors();
  const swipeableRef = useRef<Swipeable>(null);
  const balance = group.yourBalance || 0;
  const isPositive = balance > 0;
  const isSettled = balance === 0;

  function handleEditGroup() {
    swipeableRef.current?.close();
    router.push(`/edit-group/${group.id}` as any);
  }

  async function handleDeleteGroup() {
    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This action cannot be undone.',
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
              await groupService.delete(group.id);
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

  function renderLeftActions(progress: any, dragX: any) {
    const trans = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });

    return (
      <RNAnimated.View style={[styles.swipeActionLeft, { opacity: trans }]}>
        <TouchableOpacity
          onPress={handleEditGroup}
          style={styles.swipeActionButton}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${group.name}`}>
          <IconSymbol name="pencil" size={20} color="#fff" />
          <ThemedText style={styles.swipeActionText}>Edit</ThemedText>
        </TouchableOpacity>
      </RNAnimated.View>
    );
  }

  function renderRightActions(progress: any, dragX: any) {
    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <RNAnimated.View style={[styles.swipeActionRight, { opacity: trans }]}>
        <TouchableOpacity
          onPress={handleDeleteGroup}
          style={styles.swipeActionButton}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${group.name}`}>
          <IconSymbol name="trash" size={20} color="#fff" />
          <ThemedText style={styles.swipeActionText}>Delete</ThemedText>
        </TouchableOpacity>
      </RNAnimated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 100).springify()}
      style={styles.wrapper}>
      <Swipeable
        ref={swipeableRef}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        overshootFriction={8}
        enableTrackpadTwoFingerGesture
        containerStyle={{ overflow: 'visible' }}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
              borderWidth: 0,
              shadowColor: isDark ? '#000000' : '#475569',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: isDark ? 0.35 : 0.09,
              shadowRadius: 10,
              elevation: 3,
            },
          ]}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.content}
            onPress={() => router.push(`/groups/${group.id}` as any)}
            accessibilityRole="button"
            accessibilityLabel={`${group.name}, ${isSettled ? 'all settled up' : `${isPositive ? 'you are owed' : 'you owe'} $${Math.abs(balance).toFixed(2)}`}`}
            accessibilityHint="Opens this group">
            <View style={styles.row}>
              <View
                style={[
                  styles.iconContainer,
                  {
                    backgroundColor: isDark
                      ? 'rgba(45, 212, 191, 0.15)'
                      : 'rgba(34, 197, 94, 0.1)',
                  },
                ]}>
                <IconSymbol
                  size={28}
                  name="person.3.fill"
                  color={isDark ? '#2DD4BF' : colors.tint}
                />
              </View>
              <View style={styles.info}>
                <ThemedText style={[styles.name, !isDark && { color: colors.text }]} numberOfLines={1}>
                  {group.name}
                </ThemedText>
                {group.description && (
                  <ThemedText
                    style={[styles.description, { color: colors.textSecondary }]}
                    numberOfLines={1}>
                    {group.description}
                  </ThemedText>
                )}
              </View>
              <View style={styles.balanceContainer}>
                {isSettled ? (
                  <ThemedText style={[styles.settledText, { color: colors.textSecondary }]}>
                    settled up
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                      {isPositive ? "you're owed" : "you owe"}
                    </ThemedText>
                    <ThemedText
                      type='title'
                      style={[
                        styles.balanceAmount,
                        {
                          color: isPositive ? colors.success : colors.error,
                        },
                      ]}>
                      ${Math.abs(balance).toFixed(2)}
                    </ThemedText>
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </Swipeable>
    </Animated.View>
  );
}

export const GroupCard = memo(GroupCardInner, areGroupCardPropsEqual);

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 10,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardDark: {
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
  },
  content: {
    padding: 16,
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
