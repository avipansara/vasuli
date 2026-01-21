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
import { useEffect } from 'react';
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
  const isLoading = useProtectedRoute();
  const router = useRouter();

  // Initialize notifications - must be inside AuthProvider to access user context
  useNotifications();

  // Handle deep links for invitations
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { path } = Linking.parse(event.url);
      if (path?.startsWith('invite/')) {
        const inviterId = path.split('/')[1];
        if (inviterId) {
          Alert.alert(
            'Invitation Received',
            'You have been invited to join Vasuli! Sign up to connect with your friend.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign Up',
                onPress: () => router.push('/(auth)/sign-up-otp')
              }
            ]
          );
        }
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
  }, [router]);

  if (isLoading) {
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
