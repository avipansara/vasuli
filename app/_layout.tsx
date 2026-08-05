import { AnimatedSplash } from '@/components/ui/animated-splash';
import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { AuthProvider, useAuth } from '@/contexts/auth-context-otp';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/contexts/theme-context';
import { useNotifications } from '@/hooks/use-notifications';
import { buildInvitePath, parseInviteFromUrl } from '@/lib/invite-deeplink';
import { queryClient } from '@/lib/query-client';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments, type Href
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 0,
  fade: false,
});

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const AmbientDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#2DD4BF',
    background: '#0A0A0F',
    card: '#12121A',
    text: '#f4f4f5',
    border: 'rgba(45, 212, 191, 0.2)',
    notification: '#2DD4BF',
  },
};

const AmbientLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#22C55E',
    background: '#F5F5F5',
    card: '#FFFFFF',
    text: '#1F2937',
    border: '#E5E5E5',
    notification: '#22C55E',
  },
};

function useProtectedRoute(animationComplete: boolean) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  useLayoutEffect(() => {
    // Avoid navigation mutations while the splash screen is still visible;
    // they can cause the root layout to remount and restart the animation.
    // Using useLayoutEffect so the redirect happens synchronously when the
    // Stack first paints, avoiding a flash of the initial route.
    if (!animationComplete) return;
    if (isLoading) return;
    if (!navState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOAuthCallback = segments[0] === 'auth' && segments[1] === 'callback';
    const inInviteRoute = segments[0] === 'invite';

    if (inOAuthCallback) return;

    if (!isAuthenticated && !inAuthGroup && !inInviteRoute) {
      // Redirect to sign-in if not authenticated and not already in auth flow
      router.replace('/(auth)/sign-in-otp');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to tabs if authenticated but still in auth flow
      router.replace('/(tabs)');
    } else if (!segments[0]) {
      // Handle root index redirect
      if (isAuthenticated) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/sign-in-otp');
      }
    }
  }, [isAuthenticated, isLoading, navState?.key, segments, router, animationComplete]);

  return isLoading;
}

function RootLayoutNav() {
  const { isDark } = useTheme();
  const [animationComplete, setAnimationComplete] = useState(false);
  const isLoading = useProtectedRoute(animationComplete);
  const router = useRouter();
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  // Keep the native splash static while React Native initializes. The animated
  // splash is started only after the native logo has fully handed off.
  useEffect(() => {
    let isMounted = true;

    SplashScreen.hideAsync().then(() => {
      if (isMounted) {
        setNativeSplashHidden(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAnimationComplete = useCallback(() => {
    setAnimationComplete(true);
  }, []);

  // Initialize notifications only after the splash has completed and the main
  // navigation is visible, so the permission prompt never appears over splash.
  useNotifications(animationComplete && !isLoading);

  // Handle deep links for invitations → full invite screen (with invitation id in query)
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      if (!event.url) return;

      // The OAuth callback is owned by the initiating auth screen and
      // WebBrowser session, not the invitation deep-link handler.
      if (event.url.startsWith('vasuli://auth/callback')) return;

      console.log('[DeepLink] Received URL:', event.url);

      try {
        const parsed = parseInviteFromUrl(event.url);
        if (!parsed) {
          return;
        }

        const { inviterId, invitationId } = parsed;
        console.log('[DeepLink] Navigating to invite', { inviterId, invitationId });

        const path = buildInvitePath(inviterId, invitationId);
        router.replace(path as Href);
      } catch (err) {
        console.error('[DeepLink] Error handling invite URL:', err);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => subscription.remove();
  }, [router]);

  if (isLoading || !animationComplete) {
    return (
      <AnimatedSplash
        startAnimation={nativeSplashHidden}
        onAnimationComplete={handleAnimationComplete}
      />
    );
  }

  return (
    <ThemeProvider value={isDark ? AmbientDarkTheme : AmbientLightTheme}>
      <RouteErrorBoundary homeHref="/(tabs)">
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="friend/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="scan-qr" options={{ headerShown: false }} />
          <Stack.Screen name="add-expense" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="create-group" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="add-friend" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="edit-group/[id]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="edit-expense/[id]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="edit-profile" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
          <Stack.Screen name="terms-conditions" options={{ headerShown: false }} />
          <Stack.Screen name="help-support" options={{ headerShown: false }} />
          <Stack.Screen name="invite/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="invitations" options={{ headerShown: false }} />
        </Stack>
      </RouteErrorBoundary>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Nunito_400Regular': require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'),
    'Nunito_500Medium': require('@expo-google-fonts/nunito/500Medium/Nunito_500Medium.ttf'),
    'Nunito_600SemiBold': require('@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'),
    'Nunito_700Bold': require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </AppThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
