import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { StyleSheet, View } from 'react-native';

import { IconSymbol } from './icon-symbol';
import { ThemedButton } from './themed-button';

export type AsyncErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** `compact` fits inline rows (e.g. profile stats); `full` fills tab content */
  variant?: 'full' | 'compact';
};

export function AsyncErrorState({
  title = "Couldn't load",
  message,
  onRetry,
  retryLabel = 'Try again',
  variant = 'full',
}: AsyncErrorStateProps) {
  const { colors, isDark } = useThemeColors();
  const compact = variant === 'compact';

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View
        style={[
          styles.iconCircle,
          compact && styles.iconCircleCompact,
          { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.1)' },
        ]}>
        <IconSymbol
          name="exclamationmark.triangle.fill"
          size={compact ? 26 : 44}
          color={colors.error}
        />
      </View>
      <ThemedText
        type={compact ? 'defaultSemiBold' : 'subtitle'}
        style={[styles.title, compact && styles.titleCompact, !isDark && { color: colors.text }]}>
        {title}
      </ThemedText>
      <ThemedText
        style={[styles.body, compact && styles.bodyCompact, { color: colors.textSecondary }]}>
        {message}
      </ThemedText>
      {onRetry ? (
        <ThemedButton
          label={retryLabel}
          onPress={onRetry}
          style={[styles.retryBtn, compact && styles.retryBtnCompact]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
    gap: 10,
  },
  wrapCompact: {
    flex: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'stretch',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconCircleCompact: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignSelf: 'center',
    marginBottom: 0,
  },
  title: {
    textAlign: 'center',
    marginBottom: 2,
  },
  titleCompact: {
    textAlign: 'center',
    fontSize: 15,
  },
  body: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  bodyCompact: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
    textAlign: 'center',
  },
  retryBtn: {
    alignSelf: 'center',
    paddingHorizontal: 22,
    marginTop: 4,
  },
  retryBtnCompact: {
    alignSelf: 'stretch',
  },
});
