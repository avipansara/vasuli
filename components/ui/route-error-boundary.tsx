import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { type Href, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type RouteErrorFallbackProps = FallbackProps & {
  homeHref: Href;
  title: string;
};

function RouteErrorFallback({
  error,
  resetErrorBoundary,
  homeHref,
  title,
}: RouteErrorFallbackProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();

  const handleGoHome = () => {
    resetErrorBoundary();
    router.replace(homeHref);
  };

  const handleRetry = () => {
    resetErrorBoundary();
  };

  const errorMessage =
    error instanceof Error ? error.message : String(error);

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          backgroundColor: colors.background,
        },
      ]}>
      <ThemedText type="title" style={styles.heading}>
        {title}
      </ThemedText>
      <ThemedText style={styles.body}>
        {__DEV__ ? errorMessage : 'Please try again or return home.'}
      </ThemedText>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.buttonPrimary,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={styles.buttonPrimaryLabel}>Retry</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={handleGoHome}
          style={({ pressed }) => [
            styles.buttonSecondary,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: pressed ? 0.9 : 1,
            },
          ]}>
          <ThemedText type="defaultSemiBold" style={styles.buttonSecondaryLabel}>
            Go home
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export type RouteErrorBoundaryProps = {
  children: ReactNode;
  homeHref: Href;
  title?: string;
};

export function RouteErrorBoundary({
  children,
  homeHref,
  title = 'Something went wrong',
}: RouteErrorBoundaryProps) {
  return (
    <ErrorBoundary
      FallbackComponent={(props) => (
        <RouteErrorFallback {...props} homeHref={homeHref} title={title} />
      )}
      onError={(err, info) => {
        if (__DEV__) {
          console.error('[RouteErrorBoundary]', err, info.componentStack);
        }
      }}>
      {children}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  heading: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    marginBottom: 8,
  },
  buttons: {
    gap: 12,
    marginTop: 8,
  },
  buttonPrimary: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPrimaryLabel: {
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
    color: '#FFFFFF',
  },
  buttonSecondary: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  buttonSecondaryLabel: {
    fontSize: 16,
  },
});
