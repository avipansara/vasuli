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
  const verifyOtp = vi.fn()
  const signOut = vi.fn()
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
    verifyOtp,
    signOut,
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
      verifyOtp: mocks.verifyOtp,
      signOut: mocks.signOut,
    },
  },
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
    mocks.verifyOtp.mockResolvedValue({
      data: {
        user: { id: 'auth-user-id', email: 'existing@example.com' },
        session: { access_token: 'supabase-access-token' },
      },
      error: null,
    })
    mocks.signOut.mockResolvedValue({ error: null })
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

  it('verifies the built-in Apple reviewer OTP and saves a session', async () => {
    const result = await otpService.verifySignInCode({
      email: 'apple.reviewer@vasuli.app',
      code: '123456',
    })

    expect(result.success).toBe(true)
    expect(result.session?.user.email).toBe('apple.reviewer@vasuli.app')
    expect(mocks.ensureAppReviewDemoData).toHaveBeenCalledWith(reviewerUser)
    expect(mocks.setItem).toHaveBeenCalledWith(
      'auth_session',
      expect.stringContaining('"email":"apple.reviewer@vasuli.app"')
    )
  })

  it('creates the Apple reviewer user if it does not exist yet', async () => {
    mocks.usersSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    })

    const result = await otpService.verifySignInCode({
      email: 'apple.reviewer@vasuli.app',
      code: '123456',
    })

    expect(result.success).toBe(true)
    expect(mocks.usersInsertSingle).toHaveBeenCalled()
    expect(result.session?.user.name).toBe('Apple Reviewer')
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
      options: { shouldCreateUser: true },
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
      options: { shouldCreateUser: true },
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
