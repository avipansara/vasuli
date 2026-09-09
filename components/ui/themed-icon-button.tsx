import { ThemedText } from '@/components/themed-text';
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
  View,
  ViewStyle,
} from 'react-native';

const MIN_TOUCH_HIT_SLOP: Insets = { top: 12, bottom: 12, left: 12, right: 12 };

export interface ThemedIconButtonProps {
  name: IconSymbolName;
  color?: string;
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
  badge?: number | boolean;
  badgeColor?: string;
}

export function ThemedIconButton({
  name,
  color,
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
  badge,
  badgeColor,
}: ThemedIconButtonProps) {
  const { colors, isDark } = useThemeColors();
  const isDisabled = disabled || loading;

  let backgroundColor = 'transparent';
  let borderColor = 'transparent';
  let borderWidth = 0;
  let iconColor = colors.text;

  if (color) {
    iconColor = color;
  } else if (variant === 'primary') {
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
  const hasNumericBadge = typeof badge === 'number' && badge > 0;
  const hasDotBadge = typeof badge === 'boolean' && badge;
  const showBadge = hasNumericBadge || hasDotBadge;
  const defaultBadgeBg = isDark ? '#EF4444' : '#DC2626';

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
      {showBadge && (
        <View
          style={[
            styles.badge,
            hasNumericBadge ? styles.badgePill : styles.badgeDot,
            {
              backgroundColor: badgeColor || defaultBadgeBg,
              borderColor: isDark ? '#05080e' : '#F5F5F5',
            },
          ]}
        >
          {hasNumericBadge && (
            <ThemedText style={styles.badgeText}>
              {badge > 99 ? '99+' : badge}
            </ThemedText>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...(Platform.OS === 'android' && {
      elevation: 0,
    }),
  },
  badge: {
    position: 'absolute',
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  badgeDot: {
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  badgePill: {
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 12,
    textAlign: 'center',
  },
});
