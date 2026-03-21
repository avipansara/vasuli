import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const single = vi.fn()
  const from = vi.fn()
  return { single, from }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}))

import { userService } from '@/services/user-service'

describe('userService.getById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'users') {
        return {}
      }
      return {
        select: () => ({
          eq: () => ({
            single: mocks.single,
          }),
        }),
      }
    })
  })

  it('returns null when PostgREST reports no row (PGRST116)', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    })

    await expect(userService.getById('missing-id')).resolves.toBeNull()
  })

  it('returns mapped user when found', async () => {
    mocks.single.mockResolvedValue({
      data: {
        id: 'u1',
        name: 'Test',
        email: 't@example.com',
        phone: null,
        avatar: null,
        push_token: null,
        is_active: true,
        created_at: '2025-01-01T00:00:00.000Z',
      },
      error: null,
    })

    const u = await userService.getById('u1')
    expect(u?.id).toBe('u1')
    expect(u?.name).toBe('Test')
    expect(u?.email).toBe('t@example.com')
  })
})
