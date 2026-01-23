import { useAuth } from '@/contexts/auth-context-otp';
import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Root Redirect Gate
 * This component handles the initial app routing logic as soon as the app boots.
 * It prevents the default resolution to (tabs)/index by explicitly directing 
 * users based on their authentication state.
 */
export default function Index() {
    const { isAuthenticated, isLoading } = useAuth();

    // Wait for auth session to be loaded from storage
    if (isLoading) {
        return null;
    }

    if (isAuthenticated) {
        return <Redirect href="/(tabs)" />;
    }

    return <Redirect href="/(auth)/sign-in-otp" />;
}
