import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { BTN_DISABLED_DARK, BTN_DISABLED_LIGHT } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ThemedText } from '../themed-text';

interface ThemedButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconSymbolName;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  badge?: string | number;
}

export function ThemedButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  badge,
}: ThemedButtonProps) {
  const { colors, gradients, isDark } = useThemeColors();

  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  const isDisabled = disabled || loading;
  const disabledColors = isDark ? BTN_DISABLED_DARK : BTN_DISABLED_LIGHT;

  const getButtonContent = () => {
    const textColor = isPrimary
      ? (isDisabled ? '#6B7280' : '#0A0A0F')
      : isDanger
        ? (isDark ? '#f87171' : '#b91c1c')
        : (isDark ? '#dae2fd' : colors.text);

    return (
      <>
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <>
            {icon && (
              <IconSymbol
                size={20}
                name={icon}
                color={textColor}
              />
            )}
            <ThemedText
              style={[
                styles.buttonText,
                { color: textColor },
              ]}>
              {label}
            </ThemedText>
            {badge !== undefined && (
              <View style={[styles.badgeContainer, { backgroundColor: isDisabled ? '#6B7280' : '#ffffff' }]}>
                <ThemedText style={[styles.badgeText, { color: isDisabled ? '#ffffff' : (isDark ? '#003824' : '#054e3b') }]}>
                  {badge}
                </ThemedText>
              </View>
            )}
          </>
        )}
      </>
    );
  };

  if (isPrimary) {
    const buttonColors = isDisabled
      ? (disabledColors as [string, string])
      : (gradients.buttonPrimary as [string, string]);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        disabled={isDisabled}
        style={[styles.touchable, style]}>
        <LinearGradient
          colors={buttonColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.button, isDisabled && styles.disabledButton]}>
          {getButtonContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const flatBgColor = isDanger
    ? (isDark ? '#450a0a' : '#fef2f2')
    : (isDark ? '#1e293b' : '#f3f4f6');

  const flatBorderColor = isDanger
    ? (isDark ? '#dc2626' : '#fca5a5')
    : 'transparent';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        {
          backgroundColor: flatBgColor,
          borderColor: flatBorderColor,
          borderWidth: flatBorderColor !== 'transparent' ? 1 : 0,
        },
        isDisabled && styles.disabledButton,
        style,
      ]}>
      {getButtonContent()}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    width: '100%',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  badgeContainer: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
