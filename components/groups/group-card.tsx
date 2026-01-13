import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { GroupWithMembers } from '@/types/database';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface GroupCardProps {
  group: GroupWithMembers;
  index: number;
}

export function GroupCard({ group, index }: GroupCardProps) {
  const { colors, isDark } = useThemeColors();
  const balance = group.yourBalance || 0;
  const isPositive = balance > 0;
  const isSettled = balance === 0;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 100).springify()}
      style={styles.wrapper}>
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
                  style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
                  {isSettled ? 'All settled up' : isPositive ? 'You are owed' : 'You owe'}
                </ThemedText>
                {!isSettled && (
                  <ThemedText
                    style={[
                      styles.balanceAmount,
                      {
                        color: isPositive
                          ? isDark
                            ? '#10b981'
                            : colors.success
                          : isDark
                          ? '#ef4444'
                          : colors.error,
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
    color: '#fff',
    opacity: 0.8,
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
    color: '#fff',
    opacity: 0.9,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
