import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY || 'placeholder-key';
const isTestEnvironment = process.env.NODE_ENV === 'test';

if (__DEV__) {
  console.log('[Supabase] runtime project', supabaseUrl.replace(/^https:\/\//, '').replace(/\.supabase\.co\/?$/, ''));
}

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_KEY) {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('Supabase credentials not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY in your .env file.');
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: !isTestEnvironment,
      persistSession: !isTestEnvironment,
      detectSessionInUrl: false,
    },
  })
