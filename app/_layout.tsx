import { AnimatedSplash } from '@/components/ui/animated-splash';
import { AppUpdatePrompt } from '@/components/ui/app-update-prompt';
import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { AuthProvider, useAuth } from '@/contexts/auth-context-otp';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/contexts/theme-context';
import { useNotifications } from '@/hooks/use-notifications';
import { buildInvitePath, parseInviteFromUrl } from '@/lib/invite-deeplink';
import { queryClient } from '@/lib/query-client';
import { getInstalledAppVersion } from '@/lib/app-version';
import { supabase } from '@/lib/supabase';
import { checkForAppUpdate } from '@/services/app-update-coordinator';
import { createAppUpdateService } from '@/services/app-update-service';
import { friendSummaryService } from '@/services/friend-summary-service';
import { createPostSplashStartup } from '@/services/post-splash-startup';
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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
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

const postSplashStartup = createPostSplashStartup({
  queryClient,
  getHomeSummaries: friendSummaryService.getHomeSummaries,
});

const appUpdateService = createAppUpdateService({ supabase });

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
  const { user } = useAuth();
  const [animationComplete, setAnimationComplete] = useState(false);
  const isLoading = useProtectedRoute(animationComplete);
  const router = useRouter();
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const [appUpdateDecision, setAppUpdateDecision] = useState<Parameters<typeof AppUpdatePrompt>[0]['decision']>(null);
  const updateCheckInFlight = useRef(false);
  const shownReleaseIds = useRef(new Set<string>());

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

  useEffect(() => {
    if (!user?.id) return;

    void postSplashStartup.prefetchInitialHome(user.id).catch(error => {
      console.warn('Initial home prefetch failed:', error);
    });
  }, [user?.id]);

  const checkAppUpdate = useCallback(async () => {
    if (Platform.OS === 'web' || !animationComplete || isLoading || updateCheckInFlight.current) return;

    updateCheckInFlight.current = true;
    try {
      const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
      if (!platform) return;

      const decision = await checkForAppUpdate({
        installedVersion: getInstalledAppVersion(),
        platform,
        getActiveRelease: appUpdateService.getActiveRelease,
      });

      if (decision.kind === 'current' || shownReleaseIds.current.has(decision.releaseId)) return;

      const dismissed = decision.kind === 'optional'
        ? await AsyncStorage.getItem(`vasuli:update-dismissed:${decision.releaseId}`)
        : null;
      if (dismissed === 'true') return;

      shownReleaseIds.current.add(decision.releaseId);
      setAppUpdateDecision(decision);
    } catch (error) {
      console.warn('App update check failed:', error);
    } finally {
      updateCheckInFlight.current = false;
    }
  }, [animationComplete, isLoading]);

  useEffect(() => {
    const initialCheck = setTimeout(() => void checkAppUpdate(), 0);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void checkAppUpdate();
    });
    return () => {
      clearTimeout(initialCheck);
      subscription.remove();
    };
  }, [checkAppUpdate]);

  const handleAppUpdate = useCallback(() => {
    if (!appUpdateDecision) return;
    void Linking.openURL(appUpdateDecision.storeUrl).catch(error => {
      console.warn('Could not open app store:', error);
    });
  }, [appUpdateDecision]);

  const dismissAppUpdate = useCallback(() => {
    if (appUpdateDecision?.kind === 'optional') {
      void AsyncStorage.setItem(`vasuli:update-dismissed:${appUpdateDecision.releaseId}`, 'true');
    }
    setAppUpdateDecision(null);
  }, [appUpdateDecision]);

  const retryAppUpdate = useCallback(() => {
    if (appUpdateDecision) {
      shownReleaseIds.current.delete(appUpdateDecision.releaseId);
      setAppUpdateDecision(null);
    }
    void checkAppUpdate();
  }, [appUpdateDecision, checkAppUpdate]);

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
      <AppUpdatePrompt
        decision={appUpdateDecision}
        onUpdate={handleAppUpdate}
        onDismiss={dismissAppUpdate}
        onRetry={retryAppUpdate}
      />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Manrope_400Regular': require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'),
    'Manrope_500Medium': require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
    'Manrope_600SemiBold': require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'),
    'Manrope_700Bold': require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
    'Manrope_800ExtraBold': require('@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf'),
    // Aliases so any residual Nunito reference uses Manrope seamlessly
    'Nunito_400Regular': require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'),
    'Nunito_500Medium': require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
    'Nunito_600SemiBold': require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'),
    'Nunito_700Bold': require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
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
