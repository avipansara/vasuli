import { AnimatedSplash } from '@/components/ui/animated-splash';
import { AuthProvider, useAuth } from '@/contexts/auth-context-otp';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/contexts/theme-context';
import { useNotifications } from '@/hooks/use-notifications';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(auth)',
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

function useProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to sign-in if not authenticated
      router.replace('/(auth)/sign-in-otp');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to tabs if authenticated
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  return isLoading;
}

function RootLayoutNav() {
  const { isDark } = useTheme();
  const { isAuthenticated } = useAuth();
  const isLoading = useProtectedRoute();
  const router = useRouter();
  const [animationComplete, setAnimationComplete] = useState(false);

  // Ensure animation plays for at least 2.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationComplete(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Initialize notifications - must be inside AuthProvider to access user context
  useNotifications();

  // Handle deep links for invitations
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      if (!event.url) return;

      console.log('[DeepLink] Received URL:', event.url);

      try {
        const parsed = Linking.parse(event.url);
        const path = parsed.path;

        // Extract inviterId from path (handles invite/ID or /invite/ID)
        let inviterId = '';
        if (path?.includes('invite/')) {
          const parts = path.split('invite/');
          inviterId = parts[1]?.split('/')[0]?.split('?')[0] || '';
        }

        if (inviterId) {
          console.log('[DeepLink] Found inviterId:', inviterId);

          // Try to fetch inviter name to make the alert better
          let inviterName = 'your friend';
          try {
            const { userService } = await import('@/services/user-service');
            const inviter = await userService.getById(inviterId);
            if (inviter?.name) {
              inviterName = inviter.name;
            }
          } catch (e) {
            console.warn('[DeepLink] Could not fetch inviter name:', e);
          }

          Alert.alert(
            'Invitation Received',
            `You have been invited to connect with ${inviterName} on Vasuli!`,
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Join Now',
                onPress: () => {
                  if (isAuthenticated) {
                    router.push('/(tabs)');
                    // Potentially redirect to invitations screen directly
                    setTimeout(() => router.push('/invitations'), 500);
                  } else {
                    router.push('/(auth)/sign-in-otp');
                  }
                }
              }
            ]
          );
        }
      } catch (err) {
        console.error('[DeepLink] Error parsing URL:', err);
      }
    };

    // Get initial URL if app was opened from a link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => subscription.remove();
  }, [router, isAuthenticated]);

  if (isLoading || !animationComplete) {
    return <AnimatedSplash />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={isDark ? AmbientDarkTheme : AmbientLightTheme}>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
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
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Nunito_400Regular': require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'),
    'Nunito_500Medium': require('@expo-google-fonts/nunito/500Medium/Nunito_500Medium.ttf'),
    'Nunito_600SemiBold': require('@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'),
    'Nunito_700Bold': require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AppThemeProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </AppThemeProvider>
  );
}
