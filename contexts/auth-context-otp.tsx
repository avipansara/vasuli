import { otpService } from '@/services/otp-service';
import { userService } from '@/services/user-service';
import type { User } from '@/types/database';
import { withTimeout } from '@/lib/with-timeout';
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
    const appUser = await otpService.syncSupabaseAuthSessionToAppProfile();
    setUser(appUser);
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

      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  }, [user]);

  const signOut = useCallback(async () => {
    try {
      await otpService.signOut();

      // Clear user state
      setUser(null);

      console.log('[Auth] User signed out');
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
