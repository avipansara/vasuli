import { beforeEach, describe, expect, it, vi } from 'vitest'

const inviteRow = {
  id: 'inv-row-id',
  inviter_id: 'inviter-uuid',
  invitee_email: 'friend@example.com',
  invitee_phone: null,
  invitee_name: null,
  status: 'pending',
  created_at: '2025-01-01T00:00:00.000Z',
  expires_at: '2025-02-01T00:00:00.000Z',
}

const mocks = vi.hoisted(() => {
  const invoke = vi.fn<() => Promise<any>>(() =>
    Promise.resolve({ data: { success: true }, error: null })
  )
  const insertSelectSingle = vi.fn(() =>
    Promise.resolve({ data: inviteRow, error: null })
  )
  const deleteEq = vi.fn(() => Promise.resolve({ error: null }))
  const from = vi.fn()
  const getByEmail = vi.fn<() => Promise<any>>(() => Promise.resolve(null))
  const getByIds = vi.fn<() => Promise<any[]>>(() => Promise.resolve([]))
  const getFriends = vi.fn(() => Promise.resolve([]))
  const receivedOrder = vi.fn<() => Promise<{ data: any[]; error: any }>>(() => Promise.resolve({ data: [], error: null }))
  const createFriendship = vi.fn(() => Promise.resolve({
    id: 'friendship-1',
    userId: 'inviter-uuid',
    friendId: 'existing-user',
    status: 'pending',
    createdAt: Date.now(),
  }))
  const areFriends = vi.fn(() => Promise.resolve(false))
  return { invoke, insertSelectSingle, deleteEq, from, getByEmail, getByIds, getFriends, receivedOrder, createFriendship, areFriends }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  },
}))

vi.mock('@/services/user-service', () => ({
  userService: { getByEmail: mocks.getByEmail, getByIds: mocks.getByIds },
}))

vi.mock('@/services/friendship-service', () => ({
  friendshipService: {
    create: mocks.createFriendship,
    areFriends: mocks.areFriends,
    getFriends: mocks.getFriends,
  },
}))

vi.mock('@/services/notification-service', () => ({
  createInvitationNotification: vi.fn(() => ({})),
  notificationService: {
    sendPushNotification: vi.fn(),
  },
}))

import { invitationService } from '@/services/invitation-service'

describe('invitationService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null })
    mocks.insertSelectSingle.mockResolvedValue({ data: inviteRow, error: null })
    mocks.deleteEq.mockResolvedValue({ error: null })
    mocks.getByEmail.mockResolvedValue(null)
    mocks.getByIds.mockResolvedValue([])
    mocks.getFriends.mockResolvedValue([])
    mocks.receivedOrder.mockResolvedValue({ data: [], error: null })
    mocks.areFriends.mockResolvedValue(false)
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'invitations') {
        return {}
      }
      return {
        insert: () => ({
          select: () => ({
            single: mocks.insertSelectSingle,
          }),
        }),
        delete: () => ({
          eq: mocks.deleteEq,
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: mocks.receivedOrder,
            }),
          }),
        }),
      }
    })
  })

  it('normalizes email, inserts row, and invokes send-invitation', async () => {
    const result = await invitationService.create({
      inviterId: 'inviter-uuid',
      inviteeEmail: '  Friend@Example.com ',
      inviteeName: 'Friend',
      inviterName: 'Me',
    })

    expect(result.inviteeEmail).toBe('friend@example.com')
    expect(mocks.invoke).toHaveBeenCalledWith(
      'send-invitation',
      expect.objectContaining({
        body: expect.objectContaining({
          inviteeEmail: 'friend@example.com',
          inviteeName: 'Friend',
          inviterName: 'Me',
          inviterId: 'inviter-uuid',
          invitationId: 'inv-row-id',
        }),
      })
    )
  })

  it('creates a pending friendship request for an existing user', async () => {
    mocks.getByEmail.mockResolvedValueOnce({
      id: 'existing-user',
      name: 'Existing Friend',
      email: 'friend@example.com',
      isActive: true,
      createdAt: Date.now(),
    })

    const result = await invitationService.sendRequestOrInvitation({
      inviterId: 'inviter-uuid',
      inviteeEmail: 'friend@example.com',
      inviteeName: 'Existing Friend',
    })

    expect(result.type).toBe('friend_request')
    expect(mocks.createFriendship).toHaveBeenCalledWith('inviter-uuid', 'existing-user')
    expect(mocks.insertSelectSingle).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('skips email invoke for synthetic phone-placeholder inbox', async () => {
    await invitationService.create({
      inviterId: 'inviter-uuid',
      inviteeEmail: 'x@phone.placeholder',
    })

    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('does not create a new pending request for an existing friendship', async () => {
    mocks.getByEmail.mockResolvedValueOnce({
      id: 'existing-user',
      name: 'Existing Friend',
      email: 'friend@example.com',
      isActive: true,
      createdAt: Date.now(),
    })
    mocks.areFriends.mockResolvedValueOnce(true)

    await expect(
      invitationService.sendRequestOrInvitation({
        inviterId: 'inviter-uuid',
        inviteeEmail: 'friend@example.com',
      })
    ).rejects.toThrow('You are already friends with this person')
    expect(mocks.createFriendship).not.toHaveBeenCalled()
  })

  it('deletes invitation row when invoke returns error', async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Edge failed' },
    })

    await expect(
      invitationService.create({
        inviterId: 'inviter-uuid',
        inviteeEmail: 'a@b.com',
      })
    ).rejects.toThrow()

    expect(mocks.deleteEq).toHaveBeenCalledWith('id', 'inv-row-id')
  })

  it('returns a visible inviter name when the stored profile name is blank', async () => {
    mocks.receivedOrder.mockResolvedValueOnce({ data: [inviteRow], error: null })
    mocks.getByEmail.mockResolvedValueOnce({ id: 'invitee-uuid' })
    mocks.getByIds.mockResolvedValueOnce([{
      id: 'inviter-uuid',
      name: '   ',
      email: 'alex@example.com',
    }])

    const invitations = await invitationService.getReceivedInvitations('friend@example.com')

    expect(invitations[0].inviterName).toBe('alex')
  })

  it('never returns an empty inviter label when the profile cannot be resolved', async () => {
    mocks.receivedOrder.mockResolvedValueOnce({ data: [inviteRow], error: null })
    mocks.getByEmail.mockResolvedValueOnce({ id: 'invitee-uuid' })
    mocks.getByIds.mockResolvedValueOnce([])

    const invitations = await invitationService.getReceivedInvitations('friend@example.com')

    expect(invitations[0].inviterName).toBe('A friend')
  })

  it('trims inviter names before sending invitation emails', async () => {
    await invitationService.create({
      inviterId: 'inviter-uuid',
      inviteeEmail: 'friend@example.com',
      inviterName: '  Alex  ',
    })

    expect(mocks.invoke).toHaveBeenCalledWith(
      'send-invitation',
      expect.objectContaining({
        body: expect.objectContaining({ inviterName: 'Alex' }),
      })
    )
  })
})
