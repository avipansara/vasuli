import { ACCENT_TEAL, BG_ICON_DARK, BG_ICON_LIGHT } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '../themed-text';
import { IconSymbol, IconSymbolName } from './icon-symbol';
import { ThemedButton } from './themed-button';

interface EmptyStateProps {
  icon: IconSymbolName;
  title: string;
  subtitle: string;
  buttonLabel?: string;
  onButtonPress?: () => void;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  buttonLabel,
  onButtonPress,
}: EmptyStateProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: isDark ? BG_ICON_DARK : BG_ICON_LIGHT },
        ]}>
        <IconSymbol size={64} name={icon} color={isDark ? ACCENT_TEAL : colors.tint} />
      </View>
      <ThemedText type="subtitle" style={[styles.title, !isDark && { color: colors.text }]}>
        {title}
      </ThemedText>
      <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
        {subtitle}
      </ThemedText>
      {buttonLabel && onButtonPress && (
        <ThemedButton
          label={buttonLabel}
          onPress={onButtonPress}
          icon="plus.circle.fill"
          style={styles.button}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
});
