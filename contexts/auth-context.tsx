import { supabase } from '@/lib/supabase';
import { userService } from '@/services/api';
import { normalizeEmail } from '@/utils/validation';
import type { User } from '@/types/database';
import React, { createContext, useContext, useEffect, useState } from 'react';

// Check if Supabase is configured
const USE_SUPABASE = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_KEY && process.env.EXPO_PUBLIC_USE_SUPABASE === 'true');

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (USE_SUPABASE) {
      // Listen for Supabase auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          // Fetch user profile from our users table
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          if (profile) {
            setUser({
              id: profile.id,
              name: profile.name,
              email: profile.email || undefined,
              phone: profile.phone || undefined,
              avatar: profile.avatar || undefined,
              pushToken: profile.push_token || undefined,
              isActive: profile.is_active ?? true,
              createdAt: new Date(profile.created_at).getTime(),
            });
          }
        } else {
          setUser(null);
        }
        setIsLoading(false);
      });

      // Check initial session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          setIsLoading(false);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      // Mock auth - load from userService
      loadMockUser();
    }
  }, []);

  async function loadMockUser() {
    try {
      // For mock, auto-login as first user or create one
      const allUsers = await userService.getAll();
      const currentUser = allUsers.find((u: User) => u.id === 'current-user');
      if (currentUser) {
        setUser(currentUser);
      }
    } catch (error) {
      console.error('Error loading mock user:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    if (USE_SUPABASE) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Invalid email or password');
        }
        throw new Error(error.message);
      }
      // User state will be updated by onAuthStateChange listener
    } else {
      // Mock auth
      const allUsers = await userService.getAll();
      const foundUser = allUsers.find((u: User) => normalizeEmail(u.email) === normalizeEmail(email));
      
      if (!foundUser) {
        throw new Error('No account found with this email');
      }
      
      setUser(foundUser);
    }
  }

  async function signUp(name: string, email: string, password: string) {
    if (USE_SUPABASE) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: 'vasuli://auth/callback',
        },
      });
      
      if (error) {
        if (error.message.includes('already registered')) {
          throw new Error('An account with this email already exists');
        }
        throw new Error(error.message);
      }
      // User profile will be created by database trigger
      // User state will be updated by onAuthStateChange listener
    } else {
      // Mock auth
      const allUsers = await userService.getAll();
      const existingUser = allUsers.find((u: User) => normalizeEmail(u.email) === normalizeEmail(email));
      
      if (existingUser) {
        throw new Error('An account with this email already exists');
      }
      
      const newUser = await userService.create({ name, email, isActive: true });
      setUser(newUser);
    }
  }

  async function signOut() {
    if (USE_SUPABASE) {
      await supabase.auth.signOut();
    }
    setUser(null);
  }

  async function resetPassword(email: string) {
    if (USE_SUPABASE) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'vasuli://auth/reset-password',
      });
      
      if (error) {
        throw new Error(error.message);
      }
    } else {
      // Mock - just pretend it worked
      console.log('Password reset requested for:', email);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signOut,
        resetPassword,
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
