import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import {
  ACCENT_TEAL,
  BG_ICON_DARK,
  BG_ICON_LIGHT,
  BORDER_ACCENT_DARK,
  BORDER_ACCENT_LIGHT,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Insets,
  Platform,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

const MIN_TOUCH_HIT_SLOP: Insets = { top: 12, bottom: 12, left: 12, right: 12 };

export interface ThemedIconButtonProps {
  name: IconSymbolName;
  onPress: (event: GestureResponderEvent) => void;
  size?: number;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  shape?: 'circle' | 'square';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel: string;
  accessibilityHint?: string;
  hitSlop?: Insets;
  testID?: string;
}

export function ThemedIconButton({
  name,
  onPress,
  size = 20,
  variant = 'secondary',
  shape = 'circle',
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  hitSlop = MIN_TOUCH_HIT_SLOP,
  testID,
}: ThemedIconButtonProps) {
  const { colors, isDark } = useThemeColors();
  const isDisabled = disabled || loading;

  let backgroundColor = 'transparent';
  let borderColor = 'transparent';
  let borderWidth = 0;
  let iconColor = colors.text;

  if (variant === 'primary') {
    backgroundColor = isDark ? '#0D9488' : '#0F4C3A';
    iconColor = '#ffffff';
  } else if (variant === 'secondary') {
    backgroundColor = isDark ? BG_ICON_DARK : BG_ICON_LIGHT;
    borderColor = isDark ? BORDER_ACCENT_DARK : BORDER_ACCENT_LIGHT;
    borderWidth = 1;
    iconColor = isDark ? ACCENT_TEAL : colors.tint;
  } else if (variant === 'danger') {
    backgroundColor = isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2';
    borderColor = isDark ? 'rgba(239, 68, 68, 0.24)' : '#FCA5A5';
    borderWidth = 1;
    iconColor = isDark ? '#F87171' : '#DC2626';
  } else if (variant === 'ghost') {
    backgroundColor = 'transparent';
    borderColor = 'transparent';
    borderWidth = 0;
    iconColor = isDark ? '#94A3B8' : colors.textSecondary;
  }

  const borderRadius = shape === 'circle' ? 20 : 12;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={[
        styles.button,
        {
          width: 40,
          height: 40,
          borderRadius,
          backgroundColor,
          borderColor,
          borderWidth,
          opacity: isDisabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <IconSymbol name={name} size={size} color={iconColor} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'android' && {
      elevation: 0,
    }),
  },
});
