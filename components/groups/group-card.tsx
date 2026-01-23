import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { groupService } from '@/services/api';
import type { GroupWithMembers } from '@/types/database';
import { router } from 'expo-router';
import React, { useRef } from 'react';
import { Alert, Animated as RNAnimated, StyleSheet, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface GroupCardProps {
  group: GroupWithMembers;
  index: number;
  onRefresh?: () => void;
}

export function GroupCard({ group, index, onRefresh }: GroupCardProps) {
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
        <TouchableOpacity onPress={handleEditGroup} style={styles.swipeActionButton}>
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
        <TouchableOpacity onPress={handleDeleteGroup} style={styles.swipeActionButton}>
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
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push(`/group/${group.id}` as any)}>
          <View
            style={[
              styles.card,
              isDark ? styles.cardDark : { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <View style={styles.content}>
              <View style={styles.header}>
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
                  <ThemedText style={[styles.name, !isDark && { color: colors.text }]}>
                    {group.name}
                  </ThemedText>
                  {group.description && (
                    <ThemedText
                      style={[styles.description, !isDark && { color: colors.textSecondary }]}>
                      {group.description}
                    </ThemedText>
                  )}
                </View>
              </View>

              <View
                style={[
                  styles.balanceSection,
                  { borderTopColor: isDark ? 'rgba(45, 212, 191, 0.2)' : colors.border },
                ]}>
                <View style={styles.balanceContent}>
                  <ThemedText
                    style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                    {isSettled ? 'All settled up' : isPositive ? 'You are owed' : 'You owe'}
                  </ThemedText>
                  {!isSettled && (
                    <ThemedText
                      style={[
                        styles.balanceAmount,
                        {
                          color: isPositive ? colors.success : colors.error,
                        },
                      ]}>
                      ${Math.abs(balance).toFixed(2)}
                    </ThemedText>
                  )}
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    </Animated.View>
  );
}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
  },
  balanceSection: {
    marginTop: 8,
  },
  balanceContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
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
