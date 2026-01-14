import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { User } from '@/types/database';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface UserWithBalance extends User {
  balance: number;
}

interface FriendCardProps {
  friend: UserWithBalance;
  onPress?: (friend: UserWithBalance) => void;
}

export function FriendCard({ friend, onPress }: FriendCardProps) {
  const { colors, isDark } = useThemeColors();
  const balance = friend.balance;
  const balanceColor =
    balance > 0
      ? isDark ? '#10b981' : colors.success
      : balance < 0
      ? isDark ? '#ef4444' : colors.error
      : isDark ? '#2DD4BF' : colors.tint;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        !isDark && { backgroundColor: colors.card },
      ]}
      onPress={() => onPress?.(friend)}
      activeOpacity={0.7}>
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: isDark
              ? 'rgba(45, 212, 191, 0.15)'
              : 'rgba(34, 197, 94, 0.1)',
          },
        ]}>
        <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
          {friend.name.charAt(0).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.info}>
        <ThemedText
          type="defaultSemiBold"
          style={[styles.name, !isDark && { color: colors.text }]}>
          {friend.name}
        </ThemedText>
        {friend.email && (
          <ThemedText style={[styles.email, !isDark && { color: colors.textSecondary }]}>
            {friend.email}
          </ThemedText>
        )}
      </View>
      <View style={styles.balanceContainer}>
        {balance !== 0 ? (
          <>
            <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
              ${Math.abs(balance).toFixed(2)}
            </ThemedText>
            <ThemedText style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
              {balance > 0 ? 'owes you' : 'you owe'}
            </ThemedText>
          </>
        ) : (
          <ThemedText style={[styles.settledText, !isDark && { color: colors.textSecondary }]}>
            settled up
          </ThemedText>
        )}
      </View>
    </TouchableOpacity>
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: '#fff',
  },
  email: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  balanceLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  settledText: {
    fontSize: 12,
    opacity: 0.6,
  },
  chevron: {
    marginLeft: 8,
  },
});
