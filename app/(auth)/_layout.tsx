import { RouteErrorBoundary } from '@/components/ui/route-error-boundary';
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <RouteErrorBoundary homeHref="/(auth)/sign-in-otp">
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in-otp" />
      <Stack.Screen name="sign-up-otp" />
    </Stack>
    </RouteErrorBoundary>
  );
}
