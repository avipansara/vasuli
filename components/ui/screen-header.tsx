import {
    ACCENT_TEAL,
    BG_ICON_DARK,
    BG_ICON_LIGHT,
    BORDER_ACCENT_DARK,
    BORDER_ACCENT_LIGHT,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ThemedText } from '../themed-text';
import { IconSymbol, IconSymbolName } from './icon-symbol';
import { ThemedIconButton } from './themed-icon-button';

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
  return (
    <ThemedIconButton
      name={icon}
      onPress={onPress}
      size={size}
      shape="square"
      accessibilityLabel={`Action button: ${icon}`}
    />
  );
}

interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  return (
    <ThemedIconButton
      name="chevron.left"
      onPress={onPress}
      size={20}
      shape="square"
      accessibilityLabel="Go back"
      accessibilityHint="Returns to the previous screen"
    />
  );
}

interface NavigationHeaderProps {
  title: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export function NavigationHeader({ title, onBack, rightAction, style }: NavigationHeaderProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <View style={[styles.navigationHeader, style]}>
      <ThemedIconButton
        name="chevron.left"
        onPress={onBack}
        size={20}
        shape="circle"
        accessibilityLabel="Go back"
        accessibilityHint="Returns to the previous screen"
      />
      <ThemedText type="subtitle" style={[styles.navigationTitle, !isDark && { color: colors.text }]}>
        {title}
      </ThemedText>
      <View style={styles.navRightAction}>
        {rightAction || <View style={styles.placeholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
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
  navigationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingBottom: 16,
  },
  navBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  navigationTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  navRightAction: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  placeholder: {
    width: 40,
  },
  headerActionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

interface HeaderActionButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}

export function HeaderActionButton({ label, onPress, disabled = false, loading = false, testID }: HeaderActionButtonProps) {
  const { colors, isDark } = useThemeColors();
  const primaryBtnColor = isDark ? '#0D9488' : '#0F4C3A';

  const isDisabled = disabled || loading;

  const bg = isDisabled
    ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
    : primaryBtnColor;

  const textColor = isDisabled
    ? colors.textSecondary
    : '#ffffff';

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.headerActionButton,
        { backgroundColor: bg },
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <ThemedText style={[styles.headerActionButtonText, { color: textColor }]}>
          {label}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}
