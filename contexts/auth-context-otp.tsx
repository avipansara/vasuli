import { otpService } from '@/services/otp-service';
import { userService } from '@/services/user-service';
import type { User } from '@/types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    try {
      const session = await otpService.getSession();
      if (session) {
        setUser(session.user);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshUser() {
    try {
      if (!user) return;
      
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
  }

  async function signOut() {
    await otpService.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signOut,
        refreshUser,
      }}>
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
