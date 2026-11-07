import { beforeEach, describe, expect, it, vi } from 'vitest'

const existingUser = {
  id: 'existing-public-user-id',
  name: 'Existing User',
  email: 'existing@example.com',
  phone: null,
  avatar: null,
  push_token: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const createdUser = {
  id: 'new-public-user-id',
  name: 'New User',
  email: 'new@example.com',
  phone: null,
  avatar: null,
  push_token: null,
  is_active: true,
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

const mocks = vi.hoisted(() => {
  const singleByEmail = vi.fn()
  const singleByAuthUserId = vi.fn()
  const updateSingle = vi.fn()
  const insertPayload = vi.fn()
  const insertSingle = vi.fn()
  const from = vi.fn()
  return { singleByEmail, singleByAuthUserId, updateSingle, insertPayload, insertSingle, from }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}))

import { linkAuthUserToProfile } from '@/services/auth-profile-service'

describe('linkAuthUserToProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.singleByEmail.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    mocks.singleByAuthUserId.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    mocks.updateSingle.mockResolvedValue({ data: existingUser, error: null })
    mocks.insertSingle.mockResolvedValue({ data: createdUser, error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'users') return {}

      return {
        select: () => ({
          eq: (column: string) => ({
            single:
              column === 'email'
                ? mocks.singleByEmail
                : column === 'auth_user_id'
                  ? mocks.singleByAuthUserId
                  : vi.fn(),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: mocks.updateSingle,
            }),
          }),
        }),
        insert: (payload: unknown) => {
          mocks.insertPayload(payload)
          return {
            select: () => ({
              single: mocks.insertSingle,
            }),
          }
        },
      }
    })
  })

  it('links an existing email profile without changing the public user id', async () => {
    mocks.singleByEmail.mockResolvedValueOnce({ data: existingUser, error: null })
    mocks.updateSingle.mockResolvedValueOnce({
      data: { ...existingUser, auth_user_id: 'auth-user-id' },
      error: null,
    })

    const result = await linkAuthUserToProfile({
      authUserId: 'auth-user-id',
      email: ' Existing@Example.com ',
      name: 'Ignored Name',
    })

    expect(result.user.id).toBe('existing-public-user-id')
    expect(result.user.email).toBe('existing@example.com')
    expect(result.created).toBe(false)
    expect(mocks.insertSingle).not.toHaveBeenCalled()
  })

  it('creates a profile when no email match exists', async () => {
    mocks.insertSingle.mockResolvedValueOnce({
      data: { ...createdUser, auth_user_id: 'new-auth-id' },
      error: null,
    })

    const result = await linkAuthUserToProfile({
      authUserId: 'new-auth-id',
      email: 'new@example.com',
      name: 'New User',
    })

    expect(result.user.id).toBe('new-public-user-id')
    expect(result.user.name).toBe('New User')
    expect(result.created).toBe(true)
    expect(mocks.insertPayload).toHaveBeenCalledWith({
      auth_user_id: 'new-auth-id',
      name: 'New User',
      email: 'new@example.com',
      is_active: true,
    })
    expect(mocks.updateSingle).not.toHaveBeenCalled()
  })

  it('stores Apple Private Relay email and resolves by auth_user_id when email is hidden or omitted on repeat login', async () => {
    mocks.singleByAuthUserId.mockResolvedValueOnce({
      data: {
        ...existingUser,
        id: 'apple-profile-id',
        auth_user_id: 'apple-auth-id',
        email: 'xyz123@privaterelay.appleid.com',
        name: 'Alex Taylor',
      },
      error: null,
    })

    const result = await linkAuthUserToProfile({
      authUserId: 'apple-auth-id',
      allowMissingEmail: true,
    })

    expect(result.user.id).toBe('apple-profile-id')
    expect(result.user.email).toBe('xyz123@privaterelay.appleid.com')
    expect(result.created).toBe(false)
    expect(mocks.insertSingle).not.toHaveBeenCalled()
  })

  it('rejects phone-only profile linking', async () => {
    await expect(
      linkAuthUserToProfile({
        authUserId: 'auth-user-id',
      })
    ).rejects.toThrow('Email is required to link an auth user')

    expect(mocks.from).not.toHaveBeenCalled()
  })
})
