import { beforeEach, describe, expect, it, vi } from 'vitest'

const reviewerUser = {
  id: 'apple-reviewer-user-id',
  name: 'Apple Reviewer',
  email: 'apple.reviewer@vasuli.app',
  phone: null,
  avatar: null,
  email_verified: true,
  phone_verified: false,
  push_token: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const mocks = vi.hoisted(() => {
  const getItem = vi.fn()
  const setItem = vi.fn()
  const removeItem = vi.fn()
  const usersSingle = vi.fn()
  const usersInsertSingle = vi.fn()
  const from = vi.fn()
  const signInWithOtp = vi.fn()
  const signInWithOAuth = vi.fn()
  const signInWithPassword = vi.fn()
  const verifyOtp = vi.fn()
  const getSession = vi.fn()
  const setSession = vi.fn()
  const exchangeCodeForSession = vi.fn()
  const signOut = vi.fn()
  const openAuthSessionAsync = vi.fn()
  const addEventListener = vi.fn()
  const removeEventListener = vi.fn()
  const ensureAppReviewDemoData = vi.fn()
  const linkAuthUserToProfile = vi.fn()

  return {
    getItem,
    setItem,
    removeItem,
    usersSingle,
    usersInsertSingle,
    from,
    signInWithOtp,
    signInWithOAuth,
    signInWithPassword,
    verifyOtp,
    getSession,
    setSession,
    exchangeCodeForSession,
    signOut,
    openAuthSessionAsync,
    addEventListener,
    removeEventListener,
    ensureAppReviewDemoData,
    linkAuthUserToProfile,
  }
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
    removeItem: mocks.removeItem,
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithPassword: mocks.signInWithPassword,
      verifyOtp: mocks.verifyOtp,
      getSession: mocks.getSession,
      setSession: mocks.setSession,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      signOut: mocks.signOut,
    },
  },
}))

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: mocks.openAuthSessionAsync,
}))

vi.mock('expo-linking', () => ({
  addEventListener: mocks.addEventListener,
}))

vi.mock('@/services/app-review-demo-service', () => ({
  ensureAppReviewDemoData: mocks.ensureAppReviewDemoData,
}))

vi.mock('@/services/auth-profile-service', () => ({
  linkAuthUserToProfile: mocks.linkAuthUserToProfile,
}))

import { otpService } from '@/services/otp-service'

describe('otpService App Review account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setItem.mockResolvedValue(undefined)
    mocks.removeItem.mockResolvedValue(undefined)
    mocks.ensureAppReviewDemoData.mockResolvedValue(undefined)
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null })
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/oauth' }, error: null })
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'apple-reviewer-auth-id',
          email: 'apple.reviewer@vasuli.app',
          user_metadata: { name: 'Apple Reviewer' },
        },
      },
      error: null,
    })
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.verifyOtp.mockResolvedValue({
      data: {
        user: { id: 'auth-user-id', email: 'existing@example.com' },
        session: { access_token: 'supabase-access-token' },
      },
      error: null,
    })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.setSession.mockResolvedValue({ error: null })
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'vasuli://auth/callback#access_token=access-token&refresh_token=refresh-token',
    })
    mocks.addEventListener.mockReturnValue({ remove: mocks.removeEventListener })
    mocks.linkAuthUserToProfile.mockResolvedValue({
      id: 'existing-public-user-id',
      name: 'Existing User',
      email: 'existing@example.com',
      isActive: true,
      createdAt: 1,
    })
    mocks.usersSingle.mockResolvedValue({ data: reviewerUser, error: null })
    mocks.usersInsertSingle.mockResolvedValue({ data: reviewerUser, error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: mocks.usersSingle,
            }),
          }),
          insert: () => ({
            select: () => ({
              single: mocks.usersInsertSingle,
            }),
          }),
        }
      }

      return {}
    })
  })

  it('accepts the built-in Apple reviewer email as a test sign-in without sending OTP', async () => {
    const result = await otpService.sendSignInCode({
      email: ' Apple.Reviewer@Vasuli.App ',
    })

    expect(result).toEqual({ success: true })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('requests the Google account chooser and syncs the returned session', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'google-auth-id',
            email: 'google@example.com',
            user_metadata: { name: 'Google User' },
          },
        },
      },
    })

    const result = await otpService.signInWithGoogle()

    expect(result).toEqual({ success: true })
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'vasuli://auth/callback',
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    })
    expect(mocks.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://accounts.google.com/oauth',
      'vasuli://auth/callback',
    )
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    })
    expect(mocks.linkAuthUserToProfile).toHaveBeenCalledWith({
      authUserId: 'google-auth-id',
      email: 'google@example.com',
      name: 'Google User',
    })
  })

  it('accepts the Android deep-link event when the browser reports dismissal', async () => {
    mocks.openAuthSessionAsync.mockResolvedValueOnce({ type: 'dismiss' })
    mocks.addEventListener.mockImplementationOnce((_event, callback) => {
      callback({
        url: 'vasuli://auth/callback#access_token=android-access&refresh_token=android-refresh',
      })
      return { remove: mocks.removeEventListener }
    })
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'android-google-auth-id',
            email: 'android@example.com',
            user_metadata: { name: 'Android User' },
          },
        },
      },
    })

    const result = await otpService.signInWithGoogle()

    expect(result).toEqual({ success: true })
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: 'android-access',
      refresh_token: 'android-refresh',
    })
  })

  it('verifies the built-in Apple reviewer OTP and saves a session', async () => {
    mocks.linkAuthUserToProfile.mockResolvedValueOnce({
      id: 'apple-reviewer-user-id',
      name: 'Apple Reviewer',
      email: 'apple.reviewer@vasuli.app',
      isActive: true,
      createdAt: 1,
    })

    const result = await otpService.verifySignInCode({
      email: 'apple.reviewer@vasuli.app',
      code: '123456',
    })

    expect(result.success).toBe(true)
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'apple.reviewer@vasuli.app',
      password: '123456',
    })
    expect(mocks.linkAuthUserToProfile).toHaveBeenCalledWith({
      authUserId: 'apple-reviewer-auth-id',
      email: 'apple.reviewer@vasuli.app',
      name: 'Apple Reviewer',
    })
    expect(result.session?.user.email).toBe('apple.reviewer@vasuli.app')
    expect(mocks.ensureAppReviewDemoData).toHaveBeenCalledWith(expect.objectContaining({
      id: 'apple-reviewer-user-id',
      email: 'apple.reviewer@vasuli.app',
    }))
    expect(mocks.setItem).toHaveBeenCalledWith(
      'auth_session',
      expect.stringContaining('"email":"apple.reviewer@vasuli.app"')
    )
  })

  it('rejects the Apple reviewer OTP when the Supabase Auth password user is missing', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    })

    const result = await otpService.verifySignInCode({
      email: 'apple.reviewer@vasuli.app',
      code: '123456',
    })

    expect(result).toEqual({
      success: false,
      error: 'Test account is not configured in Supabase Auth',
    })
    expect(mocks.ensureAppReviewDemoData).not.toHaveBeenCalled()
  })

  it('rejects an incorrect Apple reviewer OTP', async () => {
    const result = await otpService.verifySignInCode({
      email: 'apple.reviewer@vasuli.app',
      code: '000000',
    })

    expect(result).toEqual({
      success: false,
      error: 'Invalid verification code. Use test account credentials.',
    })
    expect(mocks.setItem).not.toHaveBeenCalled()
  })

  it('sends Supabase Auth OTP for an existing email sign-in', async () => {
    const result = await otpService.sendSignInCode({
      email: ' Existing@Example.com ',
    })

    expect(result).toEqual({ success: true })
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'existing@example.com',
      options: {
        emailRedirectTo: 'vasuli://auth/callback',
        shouldCreateUser: true,
      },
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('still sends Supabase Auth OTP when the legacy public profile is not found first', async () => {
    mocks.usersSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    })

    const result = await otpService.sendSignInCode({
      email: 'legacy@example.com',
    })

    expect(result).toEqual({ success: true })
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'legacy@example.com',
      options: {
        emailRedirectTo: 'vasuli://auth/callback',
        shouldCreateUser: true,
      },
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects phone-only sign-in requests before touching Supabase', async () => {
    const result = await otpService.sendSignInCode({
      phone: '+15550000000',
    } as any)

    expect(result).toEqual({ success: false, error: 'Email is required' })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
  })

  it('sends Supabase Auth OTP for a new email sign-up', async () => {
    mocks.usersSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    })

    const result = await otpService.sendSignUpCode({
      name: 'New User',
      email: ' New@Example.com ',
    })

    expect(result).toEqual({ success: true })
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'new@example.com',
      options: {
        emailRedirectTo: 'vasuli://auth/callback',
        shouldCreateUser: true,
        data: { name: 'New User' },
      },
    })
  })

  it('rejects phone-only sign-up requests before touching Supabase', async () => {
    const result = await otpService.sendSignUpCode({
      name: 'Phone User',
      phone: '+15550000000',
    } as any)

    expect(result).toEqual({ success: false, error: 'Email is required' })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
  })

  it('verifies Supabase Auth sign-up OTP and creates or links a public profile', async () => {
    mocks.verifyOtp.mockResolvedValueOnce({
      data: {
        user: { id: 'new-auth-id', email: 'new@example.com' },
        session: { access_token: 'supabase-access-token' },
      },
      error: null,
    })
    mocks.linkAuthUserToProfile.mockResolvedValueOnce({
      id: 'new-public-user-id',
      name: 'New User',
      email: 'new@example.com',
      isActive: true,
      createdAt: 1,
    })

    const result = await otpService.verifySignUpCode({
      name: 'New User',
      email: 'new@example.com',
      code: '654321',
    })

    expect(result.success).toBe(true)
    expect(result.session?.user.id).toBe('new-public-user-id')
    expect(mocks.linkAuthUserToProfile).toHaveBeenCalledWith({
      authUserId: 'new-auth-id',
      email: 'new@example.com',
      name: 'New User',
    })
  })

  it('rejects phone-only sign-up verification before touching Supabase', async () => {
    const result = await otpService.verifySignUpCode({
      name: 'Phone User',
      phone: '+15550000000',
      code: '654321',
    } as any)

    expect(result).toEqual({ success: false, error: 'Email is required' })
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.linkAuthUserToProfile).not.toHaveBeenCalled()
  })

  it('verifies Supabase Auth OTP and links to the existing public profile', async () => {
    const result = await otpService.verifySignInCode({
      email: 'existing@example.com',
      code: '654321',
    })

    expect(result.success).toBe(true)
    expect(result.session?.user.id).toBe('existing-public-user-id')
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: 'existing@example.com',
      token: '654321',
      type: 'email',
    })
    expect(mocks.linkAuthUserToProfile).toHaveBeenCalledWith({
      authUserId: 'auth-user-id',
      email: 'existing@example.com',
    })
  })

  it('syncs a persisted Supabase Auth session back to the app profile', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'auth-user-id',
            email: 'Existing@Example.com',
            user_metadata: { name: 'Existing User' },
          },
        },
      },
    })

    const session = await otpService.syncSupabaseAuthSessionToAppProfile(' existing@example.com ')

    expect(session?.user.id).toBe('existing-public-user-id')
    expect(mocks.linkAuthUserToProfile).toHaveBeenCalledWith({
      authUserId: 'auth-user-id',
      email: 'existing@example.com',
      name: 'Existing User',
    })
    expect(mocks.setItem).toHaveBeenCalledWith(
      'auth_session',
      expect.stringContaining('"id":"existing-public-user-id"')
    )
  })

  it('does not sync a Supabase Auth session for a different local email', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'auth-user-id',
            email: 'other@example.com',
            user_metadata: {},
          },
        },
      },
    })

    const session = await otpService.syncSupabaseAuthSessionToAppProfile('existing@example.com')

    expect(session).toBeNull()
    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.linkAuthUserToProfile).not.toHaveBeenCalled()
  })

  it('rejects phone-only sign-in verification before touching Supabase', async () => {
    const result = await otpService.verifySignInCode({
      phone: '+15550000000',
      code: '654321',
    } as any)

    expect(result).toEqual({ success: false, error: 'Email is required' })
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.linkAuthUserToProfile).not.toHaveBeenCalled()
  })
})
