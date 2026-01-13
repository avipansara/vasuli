import { userService } from '@/services/api';
import type { User } from '@/types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = '@vasuli_auth_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  async function loadStoredUser() {
    try {
      const storedUser = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        // Verify user still exists in database
        const existingUser = await userService.getById(parsedUser.id);
        if (existingUser) {
          setUser(existingUser);
        } else {
          await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    // For mock data, find user by email
    // In production with Supabase, this would use supabase.auth.signInWithPassword
    const allUsers = await userService.getAll();
    const foundUser = allUsers.find((u: User) => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!foundUser) {
      throw new Error('No account found with this email');
    }
    
    // Mock: Accept any password for now (Supabase will handle real auth)
    setUser(foundUser);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(foundUser));
  }

  async function signUp(name: string, email: string, password: string) {
    // Check if email already exists
    const allUsers = await userService.getAll();
    const existingUser = allUsers.find((u: User) => u.email?.toLowerCase() === email.toLowerCase());
    
    if (existingUser) {
      throw new Error('An account with this email already exists');
    }
    
    // Create new user
    const newUser = await userService.create({
      name,
      email,
    });
    
    setUser(newUser);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser));
  }

  async function signOut() {
    setUser(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
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
