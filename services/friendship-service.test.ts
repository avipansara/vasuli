import { beforeEach, describe, expect, it, vi } from 'vitest'

const friendshipRow = {
  id: 'fs-1',
  user_id: 'user-a',
  friend_id: 'user-b',
  status: 'pending',
  created_at: '2025-01-01T00:00:00.000Z',
}

const mocks = vi.hoisted(() => {
  const single = vi.fn()
  const updateEq = vi.fn()
  const from = vi.fn()
  return { single, updateEq, from }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}))

import { friendshipService } from '@/services/friendship-service'

describe('friendshipService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.single.mockResolvedValue({ data: friendshipRow, error: null })
    mocks.updateEq.mockResolvedValue({ error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'friendships') {
        return {}
      }
      return {
        insert: () => ({
          select: () => ({
            single: mocks.single,
          }),
        }),
        update: () => ({
          eq: mocks.updateEq,
        }),
      }
    })
  })

  it('create inserts pending friendship and maps row', async () => {
    const f = await friendshipService.create('user-a', 'user-b')

    expect(f.userId).toBe('user-a')
    expect(f.friendId).toBe('user-b')
    expect(f.status).toBe('pending')
    expect(mocks.from).toHaveBeenCalledWith('friendships')
  })

  it('accept updates status to accepted', async () => {
    await friendshipService.accept('fs-1')

    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'fs-1')
  })
})
