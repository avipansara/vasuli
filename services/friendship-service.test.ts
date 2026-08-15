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
  const pendingStatusEq = vi.fn()
  const pendingFriendIdEq = vi.fn(() => ({ eq: pendingStatusEq }))
  const from = vi.fn()
  const getByIds = vi.fn()
  return { single, updateEq, pendingStatusEq, pendingFriendIdEq, from, getByIds }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('@/services/user-service', () => ({
  userService: {
    getByIds: mocks.getByIds,
  },
}))

import { friendshipService } from '@/services/friendship-service'

describe('friendshipService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.single.mockResolvedValue({ data: friendshipRow, error: null })
    mocks.updateEq.mockResolvedValue({ error: null })
    mocks.pendingStatusEq.mockResolvedValue({ data: [friendshipRow], error: null })
    mocks.getByIds.mockResolvedValue([{ id: 'user-a', name: 'Alex Requester' }])
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
        select: () => ({
          eq: mocks.pendingFriendIdEq,
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

  it('includes the requester profile name for pending requests', async () => {
    const requests = await friendshipService.getPendingRequestsWithRequesters('user-b')

    expect(requests).toEqual([expect.objectContaining({
      id: 'fs-1',
      requesterName: 'Alex Requester',
    })])
    expect(mocks.getByIds).toHaveBeenCalledWith(['user-a'])
  })

  it('fails instead of returning an anonymous pending request', async () => {
    mocks.getByIds.mockResolvedValue([])

    await expect(
      friendshipService.getPendingRequestsWithRequesters('user-b')
    ).rejects.toThrow('Unable to load the profile for a pending friend request.')
  })
})
