import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OTP_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS = 3;

// Set to true for development/testing without real Supabase
const USE_MOCK_DATA = process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true';
const MOCK_OTP_CODE = '123456';

// Apple App Store test accounts (from environment variables)
const TEST_ACCOUNT_1_EMAIL = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL || '';
const TEST_ACCOUNT_1_PHONE = process.env.EXPO_PUBLIC_TEST_ACCOUNT_PHONE || '';
const TEST_ACCOUNT_2_EMAIL = process.env.EXPO_PUBLIC_TEST_ACCOUNT_2_EMAIL || '';
const TEST_ACCOUNT_2_PHONE = process.env.EXPO_PUBLIC_TEST_ACCOUNT_2_PHONE || '';
const TEST_ACCOUNT_OTP = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP || '';

// Test accounts list for easy iteration
const TEST_ACCOUNTS = [
  { email: TEST_ACCOUNT_1_EMAIL, phone: TEST_ACCOUNT_1_PHONE },
  { email: TEST_ACCOUNT_2_EMAIL, phone: TEST_ACCOUNT_2_PHONE },
];

/**
 * Check if the email/phone is a test account
 */
function isTestAccount(email?: string, phone?: string): boolean {
  return TEST_ACCOUNTS.some(account => {
    const emailMatches = !!(account.email && email === account.email);
    const phoneMatches = !!(account.phone && phone === account.phone);
    return emailMatches || phoneMatches;
  });
}

export interface VerificationCode {
  id: string;
  userId?: string;
  email?: string;
  phone?: string;
  code: string;
  type: 'signup' | 'signin';
  verified: boolean;
  expiresAt: number;
  createdAt: number;
  attempts: number;
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
 * Generate a random 6-digit OTP code
 */
function generateOTPCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create and send OTP code for sign up
 */
export async function sendSignUpCode(params: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { name, email, phone } = params;

    if (!email && !phone) {
      return { success: false, error: 'Email or phone is required' };
    }

    // Mock mode for development
    if (USE_MOCK_DATA) {
      console.log(`[MOCK] Sign up code sent to ${email || phone}. Use code: ${MOCK_OTP_CODE}`);
      // Store pending signup info for verification
      await AsyncStorage.setItem('pending_signup', JSON.stringify({ name, email, phone }));
      return { success: true };
    }

    // Test account mode - skip email sending
    if (isTestAccount(email, phone)) {
      console.log(`[TEST ACCOUNT] Sign up code for ${email || phone}. Use code: ${TEST_ACCOUNT_OTP}`);
      // Store pending signup info for verification
      await AsyncStorage.setItem('pending_signup', JSON.stringify({ name, email, phone }));
      return { success: true };
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, name, is_active')
      .or(email ? `email.eq.${email}` : `phone.eq.${phone}`)
      .single();

    if (existingUser && existingUser.is_active !== false) {
      return { success: false, error: 'User already exists. Please sign in instead.' };
    }

    // Generate OTP code
    const code = generateOTPCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // Store verification code
    const { error: insertError } = await supabase
      .from('verification_codes')
      .insert({
        email,
        phone,
        code,
        type: 'signup',
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('Error creating verification code:', insertError);
      return { success: false, error: 'Failed to create verification code' };
    }

    // Send OTP via edge function (skip for test accounts)
    if (!isTestAccount(email, phone)) {
      const { error: sendError } = await supabase.functions.invoke('send-otp', {
        body: {
          email,
          phone,
          code,
          name,
          type: 'signup',
        },
      });

      if (sendError) {
        console.error('Error sending OTP:', sendError);
        // Don't fail - code was created, just email/SMS failed
      }
    } else {
      console.log(`[TEST ACCOUNT] Skipped sending email to ${email || phone}`);
    }

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
  phone?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { email, phone } = params;

    if (!email && !phone) {
      return { success: false, error: 'Email or phone is required' };
    }

    // Mock mode for development
    if (USE_MOCK_DATA) {
      console.log(`[MOCK] Sign in code sent to ${email || phone}. Use code: ${MOCK_OTP_CODE}`);
      // Store pending signin info for verification
      await AsyncStorage.setItem('pending_signin', JSON.stringify({ email, phone }));
      return { success: true };
    }

    // Test account mode - skip email sending
    if (isTestAccount(email, phone)) {
      console.log(`[TEST ACCOUNT] Sign in code for ${email || phone}. Use code: ${TEST_ACCOUNT_OTP}`);
      return { success: true };
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email, phone, is_active')
      .or(email ? `email.eq.${email}` : `phone.eq.${phone}`)
      .single();

    if (userError || !user) {
      return { success: false, error: 'User not found. Please sign up first.' };
    }

    if (user.is_active === false) {
      return { success: false, error: 'Account deleted. Please sign up to create a new account.' };
    }

    // Generate OTP code
    const code = generateOTPCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // Store verification code
    const { error: insertError } = await supabase
      .from('verification_codes')
      .insert({
        user_id: user.id,
        email: email || user.email,
        phone: phone || user.phone,
        code,
        type: 'signin',
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('Error creating verification code:', insertError);
      return { success: false, error: 'Failed to create verification code' };
    }

    // Send OTP via edge function (skip for test accounts)
    if (!isTestAccount(email || user.email, phone || user.phone)) {
      const { error: sendError } = await supabase.functions.invoke('send-otp', {
        body: {
          email: email || user.email,
          phone: phone || user.phone,
          code,
          name: user.name,
          type: 'signin',
        },
      });

      if (sendError) {
        console.error('Error sending OTP:', sendError);
        // Don't fail - code was created, just email/SMS failed
      }
    } else {
      console.log(`[TEST ACCOUNT] Skipped sending email to ${email || user.email || phone || user.phone}`);
    }

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
  phone?: string;
  code: string;
}): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  try {
    const { name, email, phone, code } = params;

    if (!email && !phone) {
      return { success: false, error: 'Email or phone is required' };
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
        phone: phone,
        avatar: undefined,
        email_verified: !!email,
        phone_verified: !!phone,
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
    if (isTestAccount(email, phone)) {
      if (code !== TEST_ACCOUNT_OTP) {
        return { success: false, error: 'Invalid verification code. Use code for test account.' };
      }

      // Check if test user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .or(email ? `email.eq.${email}` : `phone.eq.${phone}`)
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
          phone,
          email_verified: !!email,
          phone_verified: !!phone,
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

    // Find verification code
    const { data: verificationCode, error: codeError } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('code', code)
      .eq('type', 'signup')
      .eq('verified', false)
      .or(email ? `email.eq.${email}` : `phone.eq.${phone}`)
      .single();

    if (codeError || !verificationCode) {
      return { success: false, error: 'Invalid verification code' };
    }

    // Check if code is expired
    if (new Date(verificationCode.expires_at) < new Date()) {
      return { success: false, error: 'Verification code has expired' };
    }

    // Check max attempts
    if (verificationCode.attempts >= MAX_ATTEMPTS) {
      return { success: false, error: 'Too many attempts. Please request a new code.' };
    }

    // Mark code as verified
    const { error: updateError } = await supabase
      .from('verification_codes')
      .update({ verified: true })
      .eq('id', verificationCode.id);

    if (updateError) {
      console.error('Error updating verification code:', updateError);
      return { success: false, error: 'Failed to verify code' };
    }

    // Check if user exists (deleted user scenario)
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, name, is_active')
      .or(email ? `email.eq.${email}` : `phone.eq.${phone}`)
      .single();

    let newUser;
    let userError;

    if (existingUser && existingUser.is_active === false) {
      // Reactivate: Update existing user
      const { data, error } = await supabase
        .from('users')
        .update({
          name,
          email,
          phone,
          email_verified: !!email,
          phone_verified: !!phone,
          avatar: null,
          push_token: null,
          is_active: true,
        })
        .eq('id', existingUser.id)
        .select()
        .single();
      newUser = data;
      userError = error;
    } else {
      // Create user account
      const { data, error } = await supabase
        .from('users')
        .insert({
          name,
          email,
          phone,
          email_verified: !!email,
          phone_verified: !!phone,
        })
        .select()
        .single();
      newUser = data;
      userError = error;
    }

    if (userError) {
      console.error('Error creating user:', userError);
      return { success: false, error: 'Failed to create user account' };
    }

    // Create session
    const session = await createSession(newUser);
    await saveSession(session);

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
  phone?: string;
  code: string;
}): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  try {
    const { email, phone, code } = params;

    if (!email && !phone) {
      return { success: false, error: 'Email or phone is required' };
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
        phone: phone,
        avatar: undefined,
        email_verified: !!email,
        phone_verified: !!phone,
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
    if (isTestAccount(email, phone)) {
      if (code !== TEST_ACCOUNT_OTP) {
        return { success: false, error: 'Invalid verification code. Use test account credentials.' };
      }

      // Find test user
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .or(email ? `email.eq.${email}` : `phone.eq.${phone}`)
        .single();

      if (userError || !user) {
        return { success: false, error: 'Test account not found. Please sign up first.' };
      }

      const session = await createSession(user);
      await saveSession(session);
      console.log('[TEST ACCOUNT] Sign in successful!');
      return { success: true, session };
    }

    // Find verification code
    const { data: verificationCode, error: codeError } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('code', code)
      .eq('type', 'signin')
      .eq('verified', false)
      .or(email ? `email.eq.${email}` : `phone.eq.${phone}`)
      .single();

    if (codeError || !verificationCode) {
      return { success: false, error: 'Invalid verification code' };
    }

    // Check if code is expired
    if (new Date(verificationCode.expires_at) < new Date()) {
      return { success: false, error: 'Verification code has expired' };
    }

    // Check max attempts
    if (verificationCode.attempts >= MAX_ATTEMPTS) {
      return { success: false, error: 'Too many attempts. Please request a new code.' };
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', verificationCode.user_id!)
      .single();

    if (userError || !user) {
      return { success: false, error: 'User not found' };
    }

    // Mark code as verified
    const { error: updateError } = await supabase
      .from('verification_codes')
      .update({ verified: true })
      .eq('id', verificationCode.id);

    if (updateError) {
      console.error('Error updating verification code:', updateError);
      return { success: false, error: 'Failed to verify code' };
    }

    // Create session
    const session = await createSession(user);
    await saveSession(session);

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
