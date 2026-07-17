import { supabase } from '@/lib/supabase';
import { linkAuthUserToProfile } from '@/services/auth-profile-service';
import { ensureAppReviewDemoData } from '@/services/app-review-demo-service';
import { normalizeEmail } from '@/utils/validation';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Set to true for development/testing without real Supabase
const USE_MOCK_DATA = process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true';
const MOCK_OTP_CODE = '123456';
const AUTH_EMAIL_REDIRECT_URL = 'vasuli://auth/callback';
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

function getOAuthParams(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const paramsStart = hashIndex >= 0 ? hashIndex : queryIndex;
  const rawParams = paramsStart >= 0 ? url.slice(paramsStart + 1) : '';
  return new URLSearchParams(rawParams);
}

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
  name?: string;
  email?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const email = normalizeEmail(params.email);
    const name = params.name?.trim() || email?.split('@')[0] || 'User';

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

    // Test accounts are real Supabase Auth password users for strict RLS.
    if (isTestAccount(email)) {
      return { success: false, error: 'Test accounts must use sign in.' };
    }

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: AUTH_EMAIL_REDIRECT_URL,
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
      options: {
        emailRedirectTo: AUTH_EMAIL_REDIRECT_URL,
        shouldCreateUser: true,
      },
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
  name?: string;
  email?: string;
  code: string;
}): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  try {
    const { code } = params;
    const email = normalizeEmail(params.email);
    const name = params.name?.trim() || email?.split('@')[0] || 'User';

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

    // Test accounts are real Supabase Auth password users for strict RLS.
    if (isTestAccount(email)) {
      return { success: false, error: 'Test accounts must use sign in.' };
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

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: code,
      });

      if (authError || !data.user) {
        console.error('[TEST ACCOUNT] Supabase Auth password sign-in failed:', authError);
        return {
          success: false,
          error: 'Test account is not configured in Supabase Auth',
        };
      }

      const profile = await linkAuthUserToProfile({
        authUserId: data.user.id,
        email,
        name: normalizeEmail(email) === APP_REVIEWER_EMAIL ? APP_REVIEWER_NAME : 'Test Account',
      });

      try {
        await ensureAppReviewDemoData(profile);
      } catch (seedError) {
        console.error('[TEST ACCOUNT] Failed to seed app review demo data:', seedError);
      }

      const session = await createSessionFromProfile(profile);
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
 * Sign in with Google through Supabase's browser OAuth flow.
 *
 * Supabase redirects back to the app's custom scheme with either an implicit
 * session (tokens in the URL fragment) or a PKCE authorization code. Supporting
 * both keeps this flow compatible with the project's current Supabase client
 * configuration and future flow changes.
 */
export async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  try {
    const WebBrowser = await import('expo-web-browser');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: AUTH_EMAIL_REDIRECT_URL,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error || !data.url) {
      return { success: false, error: error?.message || 'Unable to start Google sign-in' };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_EMAIL_REDIRECT_URL);
    if (result.type !== 'success') {
      return {
        success: false,
        error: result.type === 'cancel' ? 'Google sign-in was cancelled' : 'Google sign-in did not complete',
      };
    }

    const params = getOAuthParams(result.url);
    const providerError = params.get('error_description') || params.get('error');
    if (providerError) {
      return { success: false, error: providerError };
    }

    const code = params.get('code');
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        return { success: false, error: exchangeError.message || 'Failed to complete Google sign-in' };
      }
    } else {
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) {
        return { success: false, error: 'Google sign-in returned an incomplete session' };
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        return { success: false, error: sessionError.message || 'Failed to save Google session' };
      }
    }

    const appSession = await syncSupabaseAuthSessionToAppProfile();
    if (!appSession) {
      return { success: false, error: 'Google sign-in succeeded, but your Vasuli profile could not be loaded' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in signInWithGoogle:', error);
    return { success: false, error: error?.message || 'Google sign-in failed' };
  }
}

/**
 * Reconcile the local app session with the persisted Supabase Auth session.
 *
 * This is important for users who verified OTP before the RLS bridge migration
 * was applied: the Supabase session may exist, but public.users.auth_user_id may
 * still be empty until we link it here.
 */
export async function syncSupabaseAuthSessionToAppProfile(expectedEmail?: string): Promise<AuthSession | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const authUser = session?.user;
  const email = normalizeEmail(authUser?.email);
  const expected = normalizeEmail(expectedEmail);

  if (!authUser?.id || !email) return null;
  if (expected && expected !== email) {
    await supabase.auth.signOut();
    return null;
  }

  const profile = await linkAuthUserToProfile({
    authUserId: authUser.id,
    email,
    name: typeof authUser.user_metadata?.name === 'string' ? authUser.user_metadata.name : undefined,
  });
  const appSession = await createSessionFromProfile(profile);
  await saveSession(appSession);
  return appSession;
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
  signInWithGoogle,
  syncSupabaseAuthSessionToAppProfile,
  getSession,
  clearSession,
  signOut,
};
