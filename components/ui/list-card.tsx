import {
    ACCENT_TEAL,
    BG_ICON_DARK,
    BG_ICON_LIGHT,
    ERROR_COLOR,
    SUCCESS_DARK,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { ThemedText } from '../themed-text';
import { IconSymbol, IconSymbolName } from './icon-symbol';

interface ListCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function ListCard({ children, style }: ListCardProps) {
  const { colors, isDark } = useThemeColors();

  const lightModeStyles = !isDark
    ? { backgroundColor: colors.card, borderColor: colors.border }
    : undefined;

  return (
    <View style={[styles.card, lightModeStyles, style]}>
      {children}
    </View>
  );
}

interface CardAvatarProps {
  initial: string;
  size?: 'small' | 'medium' | 'large';
}

export function CardAvatar({ initial, size = 'medium' }: CardAvatarProps) {
  const { colors, isDark } = useThemeColors();
  const sizeStyle = size === 'small' ? styles.avatarSmall : size === 'large' ? styles.avatarLarge : styles.avatarMedium;
  const textStyle = size === 'small' ? styles.avatarTextSmall : size === 'large' ? styles.avatarTextLarge : styles.avatarTextMedium;

  return (
    <View
      style={[
        styles.avatar,
        sizeStyle,
        { backgroundColor: isDark ? BG_ICON_DARK : BG_ICON_LIGHT },
      ]}>
      <ThemedText style={[textStyle, { color: isDark ? ACCENT_TEAL : colors.tint }]}>
        {initial.toUpperCase()}
      </ThemedText>
    </View>
  );
}

interface CardIconProps {
  name: IconSymbolName;
  size?: number;
}

export function CardIcon({ name, size = 20 }: CardIconProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <View
      style={[
        styles.iconContainer,
        { backgroundColor: isDark ? BG_ICON_DARK : BG_ICON_LIGHT },
      ]}>
      <IconSymbol size={size} name={name} color={isDark ? ACCENT_TEAL : colors.tint} />
    </View>
  );
}

interface BalanceDisplayProps {
  amount: number;
  positiveLabel?: string;
  negativeLabel?: string;
  settledLabel?: string;
}

export function BalanceDisplay({
  amount,
  positiveLabel = 'gets back',
  negativeLabel = 'owes',
  settledLabel = 'settled',
}: BalanceDisplayProps) {
  const { colors, isDark } = useThemeColors();

  const balanceColor =
    amount > 0
      ? isDark ? SUCCESS_DARK : colors.success
      : amount < 0
      ? isDark ? ERROR_COLOR : colors.error
      : isDark ? ACCENT_TEAL : colors.tint;

  if (amount === 0) {
    return (
      <View style={styles.balanceContainer}>
        <ThemedText style={[styles.settledText, !isDark && { color: colors.textSecondary }]}>
          {settledLabel}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.balanceContainer}>
      <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
        ${Math.abs(amount).toFixed(2)}
      </ThemedText>
      <ThemedText style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
        {amount > 0 ? positiveLabel : negativeLabel}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(26, 26, 36, 0.6)',
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 0,
    elevation: 4,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  avatarMedium: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  avatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  avatarTextSmall: {
    fontSize: 12,
    fontWeight: '600',
  },
  avatarTextMedium: {
    fontSize: 16,
    fontWeight: '600',
  },
  avatarTextLarge: {
    fontSize: 20,
    fontWeight: '600',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 14,
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
});
