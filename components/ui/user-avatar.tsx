import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useState } from 'react';
import {
  Image,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native';

export type UserAvatarSize = 'sm' | 'md' | 'lg' | 'xl' | number;

export type UserAvatarVariant = 'circular' | 'rounded';

export interface UserAvatarProps {
  name?: string | null;
  initials?: string | null;
  avatarUrl?: string | null;
  uri?: string | null;
  size?: UserAvatarSize;
  variant?: UserAvatarVariant;
  backgroundColor?: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg' | 'xl', { dimension: number; fontSize: number }> = {
  sm: { dimension: 28, fontSize: 13 },
  md: { dimension: 44, fontSize: 18 },
  lg: { dimension: 56, fontSize: 22 },
  xl: { dimension: 72, fontSize: 28 },
};

function resolveSize(size: UserAvatarSize): { dimension: number; fontSize: number } {
  if (typeof size === 'number') {
    return {
      dimension: size,
      fontSize: Math.round(size * 0.42),
    };
  }
  return SIZE_MAP[size] ?? SIZE_MAP.md;
}

export function UserAvatar({
  name,
  initials,
  avatarUrl,
  uri,
  size = 'md',
  variant = 'circular',
  backgroundColor,
  textColor,
  style,
  textStyle,
  testID = 'user-avatar',
  accessibilityLabel,
}: UserAvatarProps) {
  const { colors, friends: friendsTheme, isDark } = useThemeColors();
  const [imageError, setImageError] = useState(false);

  const { dimension, fontSize } = resolveSize(size);
  const borderRadius = variant === 'circular' ? dimension / 2 : 10;

  const defaultBg = isDark ? '#064e3b' : (friendsTheme?.avatarSurface ?? 'rgba(34, 197, 94, 0.12)');
  const defaultTextColor = isDark ? '#10b981' : colors.tint;

  const bg = backgroundColor ?? defaultBg;
  const fg = textColor ?? defaultTextColor;

  const imageUri = uri || avatarUrl;
  const initial = initials?.trim() || (name?.trim()?.charAt(0) || 'U').toUpperCase();
  const effectiveFontSize = initial.length > 2
    ? Math.round(fontSize * 0.65)
    : initial.length > 1
      ? Math.round(fontSize * 0.85)
      : fontSize;
  const label = accessibilityLabel || (name ? `${name}'s avatar` : 'User avatar');

  if (imageUri && !imageError) {
    return (
      <View
        testID={testID}
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[
          styles.container,
          {
            width: dimension,
            height: dimension,
            borderRadius,
            backgroundColor: bg,
          },
          style,
        ]}>
        <Image
          source={{ uri: imageUri }}
          style={{ width: dimension, height: dimension, borderRadius }}
          resizeMode="cover"
          onError={() => setImageError(true)}
          testID={`${testID}-image`}
        />
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.container,
        {
          width: dimension,
          height: dimension,
          borderRadius,
          backgroundColor: bg,
        },
        style,
      ]}>
      <ThemedText
        testID={`${testID}-initials`}
        style={[
          styles.initialText,
          {
            fontSize: effectiveFontSize,
            lineHeight: effectiveFontSize * 1.2,
            color: fg,
          },
          textStyle,
        ]}>
        {initial}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  initialText: {
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
