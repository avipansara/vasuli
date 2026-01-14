import {
    ACCENT_TEAL,
    BG_ICON_DARK,
    BG_ICON_LIGHT,
    BORDER_ACCENT_DARK,
    BORDER_ACCENT_LIGHT,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ThemedText } from '../themed-text';
import { IconSymbol, IconSymbolName } from './icon-symbol';

interface ScreenHeaderProps {
  label?: string;
  title: string;
  rightContent?: React.ReactNode;
  style?: ViewStyle;
}

export function ScreenHeader({ label, title, rightContent, style }: ScreenHeaderProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerLeft}>
        {label && (
          <ThemedText style={[styles.headerLabel, !isDark && { color: colors.textSecondary }]}>
            {label}
          </ThemedText>
        )}
        <ThemedText type="header" style={[styles.headerTitle, !isDark && { color: colors.text }]}>
          {title}
        </ThemedText>
      </View>
      {rightContent}
    </View>
  );
}

interface HeaderButtonProps {
  icon: IconSymbolName;
  onPress: () => void;
  size?: number;
}

export function HeaderButton({ icon, onPress, size = 20 }: HeaderButtonProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <TouchableOpacity
      style={[
        styles.headerButton,
        {
          backgroundColor: isDark ? BG_ICON_DARK : BG_ICON_LIGHT,
          borderColor: isDark ? BORDER_ACCENT_DARK : BORDER_ACCENT_LIGHT,
        },
      ]}
      onPress={onPress}>
      <IconSymbol size={size} name={icon} color={isDark ? ACCENT_TEAL : colors.tint} />
    </TouchableOpacity>
  );
}

interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.backButton,
        {
          backgroundColor: isDark ? BG_ICON_DARK : BG_ICON_LIGHT,
          borderColor: isDark ? BORDER_ACCENT_DARK : BORDER_ACCENT_LIGHT,
        },
      ]}>
      <IconSymbol size={20} name="chevron.left" color={isDark ? ACCENT_TEAL : colors.tint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 4,
  },
  headerLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    // Increase touch target on Android
    ...(Platform.OS === 'android' && {
      padding: 4,
    }),
  },
});
