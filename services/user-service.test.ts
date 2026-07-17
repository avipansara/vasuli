import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userService } from '@/services/user-service'

const mocks = vi.hoisted(() => {
  const single = vi.fn()
  const maybeSingle = vi.fn()
  const from = vi.fn()
  return { single, maybeSingle, from }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}))

describe('userService.getById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'users') {
        return {}
      }
      const query = {
        single: mocks.single,
        maybeSingle: mocks.maybeSingle,
      }
      return {
        select: () => ({
          eq: () => query,
          ilike: () => query,
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

describe('userService.getByEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockImplementation(() => ({
      select: () => ({
        ilike: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }))
  })

  it('normalizes email input and finds profiles regardless of stored casing', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'u2',
        name: 'Casey User',
        email: 'Casey@Example.com',
        phone: null,
        avatar: null,
        push_token: null,
        is_active: true,
        created_at: '2025-01-01T00:00:00.000Z',
      },
      error: null,
    })

    const user = await userService.getByEmail(' CASEY@example.com ')

    expect(user?.id).toBe('u2')
    expect(mocks.maybeSingle).toHaveBeenCalledOnce()
  })
})
