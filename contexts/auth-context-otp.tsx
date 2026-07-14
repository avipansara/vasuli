import { otpService } from '@/services/otp-service';
import { userService } from '@/services/user-service';
import type { User } from '@/types/database';
import { withTimeout } from '@/lib/with-timeout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_INITIALIZATION_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    withTimeout(
      loadSession(),
      AUTH_INITIALIZATION_TIMEOUT_MS,
      'Auth initialization timed out',
    )
      .catch(error => {
        console.error('Error loading session:', error);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function loadSession() {
    const session = await otpService.getSession();
    if (session) {
      const reconciledSession = await otpService.syncSupabaseAuthSessionToAppProfile(session.user.email);
      setUser(reconciledSession?.user ?? session.user);
    } else {
      const reconciledSession = await otpService.syncSupabaseAuthSessionToAppProfile();
      if (reconciledSession) {
        setUser(reconciledSession.user);
        return;
      }

      // Explicitly clear if no session found to prevent stale data issues
      await otpService.clearSession();
    }
  }

  const refreshUser = useCallback(async () => {
    try {
      // If user doesn't exist yet (after sign-in/sign-up), load the session
      if (!user) {
        await loadSession();
        return;
      }

      // Fetch fresh user data from database
      const freshUser = await userService.getById(user.id);
      if (freshUser) {
        setUser(freshUser);

        // Update session in AsyncStorage with fresh data
        const sessionData = await AsyncStorage.getItem('auth_session');
        if (sessionData) {
          const session = JSON.parse(sessionData);
          session.user = freshUser;
          await AsyncStorage.setItem('auth_session', JSON.stringify(session));
        }
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  }, [user]);

  const signOut = useCallback(async () => {
    try {
      // Clear session from AsyncStorage
      await otpService.signOut();

      // Clear user state
      setUser(null);

      // Force aggressive cleanup of all app data on sign out to prevent "caching" issues
      await AsyncStorage.multiRemove([
        'auth_session',
        'pending_signup',
        'pending_signin',
        'supabase.auth.token' // legacy token if any
      ]);

      console.log('[Auth] User signed out, all critical data cleared');
    } catch (error) {
      console.error('[Auth] Error during sign out:', error);
      // Still clear user state even if there's an error
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    signOut,
    refreshUser,
  }), [user, isLoading, signOut, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
