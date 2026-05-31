import { supabase } from '@/lib/supabase';
import { linkAuthUserToProfile } from '@/services/auth-profile-service';
import { ensureAppReviewDemoData } from '@/services/app-review-demo-service';
import { normalizeEmail } from '@/utils/validation';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Set to true for development/testing without real Supabase
const USE_MOCK_DATA = process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true';
const MOCK_OTP_CODE = '123456';
const APP_REVIEWER_EMAIL = 'apple.reviewer@vasuli.app';
const APP_REVIEWER_OTP = '123456';
const APP_REVIEWER_NAME = 'Apple Reviewer';

// Apple App Store test accounts (from environment variables)
const TEST_ACCOUNT_1_EMAIL = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL || '';
const TEST_ACCOUNT_2_EMAIL = process.env.EXPO_PUBLIC_TEST_ACCOUNT_2_EMAIL || '';
const TEST_ACCOUNT_OTP = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP || APP_REVIEWER_OTP;

// Test accounts list for easy iteration
const TEST_ACCOUNTS = [
  { email: APP_REVIEWER_EMAIL },
  { email: TEST_ACCOUNT_1_EMAIL },
  { email: TEST_ACCOUNT_2_EMAIL },
];

/**
 * Check if the email is a test account
 */
function isTestAccount(email?: string): boolean {
  const normalizedInputEmail = normalizeEmail(email);
  return TEST_ACCOUNTS.some(account => {
    const normalizedConfiguredEmail = normalizeEmail(account.email);
    return !!(
      normalizedConfiguredEmail &&
      normalizedInputEmail &&
      normalizedConfiguredEmail === normalizedInputEmail
    );
  });
}

function getTestAccountOTP(email?: string): string {
  return normalizeEmail(email) === APP_REVIEWER_EMAIL ? APP_REVIEWER_OTP : TEST_ACCOUNT_OTP;
}

async function findUserByEmail(email: string) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  return { user, error };
}

async function createTestAccountUser(email: string) {
  const { data: user, error } = await supabase
    .from('users')
    .insert({
      name: normalizeEmail(email) === APP_REVIEWER_EMAIL ? APP_REVIEWER_NAME : 'Test Account',
      email,
      email_verified: !!email,
      phone_verified: false,
    })
    .select()
    .single();

  return { user, error };
}

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  pushToken?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: number;
}

/**
 * Create and send OTP code for sign up
 */
export async function sendSignUpCode(params: {
  name: string;
  email?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { name } = params;
    const email = normalizeEmail(params.email);

    if (!email) {
      return { success: false, error: 'Email is required' };
    }

    // Mock mode for development
    if (USE_MOCK_DATA) {
      console.log(`[MOCK] Sign up code sent to ${email}. Use code: ${MOCK_OTP_CODE}`);
      // Store pending signup info for verification
      await AsyncStorage.setItem('pending_signup', JSON.stringify({ name, email }));
      return { success: true };
    }

    // Test account mode - skip email sending
    if (isTestAccount(email)) {
      console.log(`[TEST ACCOUNT] Sign up code for ${email}. Use code: ${TEST_ACCOUNT_OTP}`);
      // Store pending signup info for verification
      await AsyncStorage.setItem('pending_signup', JSON.stringify({ name, email }));
      return { success: true };
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, name, is_active')
      .eq('email', email)
      .single();

    if (existingUser && existingUser.is_active !== false) {
      return { success: false, error: 'User already exists. Please sign in instead.' };
    }

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: { name },
      },
    });

    if (authError) {
      console.error('Error sending Supabase Auth sign-up OTP:', authError);
      return { success: false, error: authError.message || 'Failed to send verification code' };
    }

    await AsyncStorage.setItem('pending_signup', JSON.stringify({ name, email }));
    return { success: true };
  } catch (error: any) {
    console.error('Error in sendSignUpCode:', error);
    return { success: false, error: error.message || 'Failed to send verification code' };
  }
}

/**
 * Create and send OTP code for sign in
 */
export async function sendSignInCode(params: {
  email?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const email = normalizeEmail(params.email);

    if (!email) {
      return { success: false, error: 'Email is required' };
    }

    // Mock mode for development
    if (USE_MOCK_DATA) {
      console.log(`[MOCK] Sign in code sent to ${email}. Use code: ${MOCK_OTP_CODE}`);
      // Store pending signin info for verification
      await AsyncStorage.setItem('pending_signin', JSON.stringify({ email }));
      return { success: true };
    }

    // Test account mode - skip email sending
    if (isTestAccount(email)) {
      console.log(`[TEST ACCOUNT] Sign in code for ${email}. Use code: ${TEST_ACCOUNT_OTP}`);
      return { success: true };
    }

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (authError) {
      console.error('Error sending Supabase Auth OTP:', authError);
      return { success: false, error: authError.message || 'Failed to send verification code' };
    }

    await AsyncStorage.setItem('pending_signin', JSON.stringify({ email }));
    return { success: true };
  } catch (error: any) {
    console.error('Error in sendSignInCode:', error);
    return { success: false, error: error.message || 'Failed to send verification code' };
  }
}

/**
 * Verify OTP code for sign up and create user account
 */
export async function verifySignUpCode(params: {
  name: string;
  email?: string;
  code: string;
}): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  try {
    const { name, code } = params;
    const email = normalizeEmail(params.email);

    if (!email) {
      return { success: false, error: 'Email is required' };
    }

    // Mock mode for development
    if (USE_MOCK_DATA) {
      if (code !== MOCK_OTP_CODE) {
        return { success: false, error: 'Invalid verification code. Use code for testing.' };
      }

      // Create mock user and session
      const mockUser = {
        id: 'current-user',
        name: name,
        email: email,
        phone: undefined,
        avatar: undefined,
        email_verified: !!email,
        phone_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const session = await createSession(mockUser);
      await saveSession(session);
      await AsyncStorage.removeItem('pending_signup');

      console.log('[MOCK] Sign up successful!');
      return { success: true, session };
    }

    // Test account mode - auto-verify with code 
    if (isTestAccount(email)) {
      if (code !== getTestAccountOTP(email)) {
        return { success: false, error: 'Invalid verification code. Use code for test account.' };
      }

      // Check if test user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (existingUser) {
        // User exists, create session
        const session = await createSession(existingUser);
        await saveSession(session);
        console.log('[TEST ACCOUNT] Sign up successful (existing user)!');
        return { success: true, session };
      }

      // Create new test user
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          name,
          email,
          email_verified: !!email,
          phone_verified: false,
        })
        .select()
        .single();

      if (userError) {
        console.error('[TEST ACCOUNT] Error creating user:', userError);
        return { success: false, error: 'Failed to create test user account' };
      }

      const session = await createSession(newUser);
      await saveSession(session);
      console.log('[TEST ACCOUNT] Sign up successful (new user)!');
      return { success: true, session };
    }

    const { data, error: authError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (authError || !data.user) {
      return { success: false, error: authError?.message || 'Invalid verification code' };
    }

    const profile = await linkAuthUserToProfile({
      authUserId: data.user.id,
      email,
      name,
    });
    const session = await createSessionFromProfile(profile);
    await saveSession(session);
    await AsyncStorage.removeItem('pending_signup');

    return { success: true, session };
  } catch (error: any) {
    console.error('Error in verifySignUpCode:', error);
    return { success: false, error: error.message || 'Failed to verify code' };
  }
}

/**
 * Verify OTP code for sign in
 */
export async function verifySignInCode(params: {
  email?: string;
  code: string;
}): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  try {
    const { code } = params;
    const email = normalizeEmail(params.email);

    if (!email) {
      return { success: false, error: 'Email is required' };
    }

    // Mock mode for development
    if (USE_MOCK_DATA) {
      if (code !== MOCK_OTP_CODE) {
        return { success: false, error: 'Invalid verification code. Use code for testing.' };
      }

      // Create mock user and session
      const mockUser = {
        id: 'current-user',
        name: 'You',
        email: email,
        phone: undefined,
        avatar: undefined,
        email_verified: !!email,
        phone_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const session = await createSession(mockUser);
      await saveSession(session);
      await AsyncStorage.removeItem('pending_signin');

      console.log('[MOCK] Sign in successful!');
      return { success: true, session };
    }

    // Test account mode - auto-verify with code
    if (isTestAccount(email)) {
      if (code !== getTestAccountOTP(email)) {
        return { success: false, error: 'Invalid verification code. Use test account credentials.' };
      }

      // Find test user
      let { user, error: userError } = await findUserByEmail(email);

      if (userError || !user) {
        const created = await createTestAccountUser(email);
        user = created.user;
        userError = created.error;
      }

      if (userError || !user) {
        return { success: false, error: 'Failed to create test account' };
      }

      try {
        await ensureAppReviewDemoData(user);
      } catch (seedError) {
        console.error('[TEST ACCOUNT] Failed to seed app review demo data:', seedError);
      }

      const session = await createSession(user);
      await saveSession(session);
      console.log('[TEST ACCOUNT] Sign in successful!');
      return { success: true, session };
    }

    const { data, error: authError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (authError || !data.user) {
      return { success: false, error: authError?.message || 'Invalid verification code' };
    }

    const profile = await linkAuthUserToProfile({
      authUserId: data.user.id,
      email,
    });
    const session = await createSessionFromProfile(profile);
    await saveSession(session);
    await AsyncStorage.removeItem('pending_signin');

    return { success: true, session };
  } catch (error: any) {
    console.error('Error in verifySignInCode:', error);
    return { success: false, error: error.message || 'Failed to verify code' };
  }
}

/**
 * Create a session for a user
 */
async function createSession(user: any): Promise<AuthSession> {
  const token = generateSessionToken();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      emailVerified: user.email_verified,
      phoneVerified: user.phone_verified,
      pushToken: user.push_token || undefined,
      isActive: user.is_active ?? true,
      createdAt: new Date(user.created_at).getTime(),
      updatedAt: new Date(user.updated_at).getTime(),
    },
    token,
    expiresAt,
  };
}

async function createSessionFromProfile(user: any): Promise<AuthSession> {
  const token = generateSessionToken();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      emailVerified: !!user.email,
      phoneVerified: !!user.phone,
      pushToken: user.pushToken,
      isActive: user.isActive ?? true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt ?? user.createdAt,
    },
    token,
    expiresAt,
  };
}

/**
 * Generate a random session token
 */
function generateSessionToken(): string {
  // Simple random token generator for React Native
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Save session to AsyncStorage
 */
async function saveSession(session: AuthSession): Promise<void> {
  await AsyncStorage.setItem('auth_session', JSON.stringify(session));
}

/**
 * Get current session from AsyncStorage
 */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const sessionData = await AsyncStorage.getItem('auth_session');
    if (!sessionData) return null;

    const session: AuthSession = JSON.parse(sessionData);

    // Check if session is expired
    if (session.expiresAt < Date.now()) {
      await clearSession();
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

/**
 * Clear session from AsyncStorage
 */
export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem('auth_session');
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  await clearSession();
}

export const otpService = {
  sendSignUpCode,
  sendSignInCode,
  verifySignUpCode,
  verifySignInCode,
  getSession,
  clearSession,
  signOut,
};
