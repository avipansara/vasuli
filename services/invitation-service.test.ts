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
  const getFriends = vi.fn((): Promise<string[]> => Promise.resolve([]))
  const receivedOrder = vi.fn<() => Promise<{ data: any[]; error: any }>>(() => Promise.resolve({ data: [], error: null }))
  const sentOrder = vi.fn<() => Promise<{ data: any[]; error: any }>>(() => Promise.resolve({ data: [], error: null }))
  const linkSingle = vi.fn<() => Promise<{ data: any; error: any }>>(() => Promise.resolve({ data: null, error: null }))
  const linkLimit = vi.fn<() => Promise<{ data: any[]; error: any }>>(() => Promise.resolve({ data: [], error: null }))
  const invitationSingle = vi.fn<() => Promise<{ data: any; error: any }>>(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
  const updateEq = vi.fn(() => Promise.resolve({ error: null }))
  const createFriendship = vi.fn(() => Promise.resolve({
    id: 'friendship-1',
    userId: 'inviter-uuid',
    friendId: 'existing-user',
    status: 'pending',
    createdAt: Date.now(),
  }))
  const areFriends = vi.fn(() => Promise.resolve(false))
  return { invoke, insertSelectSingle, deleteEq, updateEq, from, getByEmail, getByIds, getFriends, receivedOrder, sentOrder, linkSingle, linkLimit, invitationSingle, createFriendship, areFriends }
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
    mocks.sentOrder.mockResolvedValue({ data: [], error: null })
    mocks.linkSingle.mockResolvedValue({ data: null, error: null })
    mocks.linkLimit.mockResolvedValue({ data: [], error: null })
    mocks.invitationSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    mocks.updateEq.mockResolvedValue({ error: null })
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
        update: () => ({
          eq: mocks.updateEq,
        }),
        delete: () => ({
          eq: mocks.deleteEq,
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({ limit: mocks.linkLimit }),
              }),
              order: mocks.receivedOrder,
            }),
            order: mocks.sentOrder,
            maybeSingle: mocks.linkSingle,
            single: mocks.invitationSingle,
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

  describe('getByInviter', () => {
  it('hides a pending invitation when the invitee is already a friend', async () => {
    mocks.sentOrder.mockResolvedValueOnce({ data: [inviteRow], error: null })
    mocks.getByEmail.mockResolvedValueOnce({ id: 'invitee-uuid' })
    mocks.getFriends.mockResolvedValueOnce(['invitee-uuid'])

    await expect(invitationService.getByInviter('inviter-uuid')).resolves.toEqual([])
  })

  it('keeps a pending invitation when the invitee is not a friend', async () => {
    mocks.sentOrder.mockResolvedValueOnce({ data: [inviteRow], error: null })
    mocks.getByEmail.mockResolvedValueOnce({ id: 'invitee-uuid' })
    mocks.getFriends.mockResolvedValueOnce([])

    const invitations = await invitationService.getByInviter('inviter-uuid')

    expect(invitations).toHaveLength(1)
    expect(invitations[0].inviteeEmail).toBe('friend@example.com')
  })

  it('keeps accepted history even when the invitee is a friend', async () => {
    mocks.sentOrder.mockResolvedValueOnce({
      data: [{ ...inviteRow, status: 'accepted' }],
      error: null,
    })
    mocks.getByEmail.mockResolvedValueOnce({ id: 'invitee-uuid' })
    mocks.getFriends.mockResolvedValueOnce(['invitee-uuid'])

    const invitations = await invitationService.getByInviter('inviter-uuid')

    expect(invitations).toHaveLength(1)
    expect(invitations[0].status).toBe('accepted')
  })
})

  describe('acceptInvitationFromLink', () => {
    const linkRow = {
      id: 'inv-1',
      inviter_id: 'inviter-uuid',
      invitee_email: 'friend@example.com',
      status: 'pending',
    }

    it('accepts a matching pending invitation', async () => {
      mocks.linkSingle.mockResolvedValueOnce({ data: linkRow, error: null })

      const result = await invitationService.acceptInvitationFromLink({
        invitationId: 'inv-1',
        inviterId: 'inviter-uuid',
        inviteeEmail: '  Friend@Example.com ',
      })

      expect(result).toEqual({ outcome: 'accepted' })
      expect(mocks.updateEq).toHaveBeenCalledWith('id', 'inv-1')
    })

    it('reports already-accepted without writing', async () => {
      mocks.linkSingle.mockResolvedValueOnce({
        data: { ...linkRow, status: 'accepted' },
        error: null,
      })

      const result = await invitationService.acceptInvitationFromLink({
        invitationId: 'inv-1',
        inviterId: 'inviter-uuid',
        inviteeEmail: 'friend@example.com',
      })

      expect(result).toEqual({ outcome: 'already-accepted' })
      expect(mocks.updateEq).not.toHaveBeenCalled()
    })

    it('reports declined without writing', async () => {
      mocks.linkSingle.mockResolvedValueOnce({
        data: { ...linkRow, status: 'declined' },
        error: null,
      })

      const result = await invitationService.acceptInvitationFromLink({
        invitationId: 'inv-1',
        inviterId: 'inviter-uuid',
        inviteeEmail: 'friend@example.com',
      })

      expect(result).toEqual({ outcome: 'declined' })
      expect(mocks.updateEq).not.toHaveBeenCalled()
    })

    it('reports expired without writing', async () => {
      mocks.linkSingle.mockResolvedValueOnce({
        data: { ...linkRow, status: 'expired' },
        error: null,
      })

      const result = await invitationService.acceptInvitationFromLink({
        invitationId: 'inv-1',
        inviterId: 'inviter-uuid',
        inviteeEmail: 'friend@example.com',
      })

      expect(result).toEqual({ outcome: 'expired' })
      expect(mocks.updateEq).not.toHaveBeenCalled()
    })

    it('reports invalid when the email does not match', async () => {
      mocks.linkSingle.mockResolvedValueOnce({ data: linkRow, error: null })

      const result = await invitationService.acceptInvitationFromLink({
        invitationId: 'inv-1',
        inviterId: 'inviter-uuid',
        inviteeEmail: 'someone-else@example.com',
      })

      expect(result).toEqual({ outcome: 'invalid' })
      expect(mocks.updateEq).not.toHaveBeenCalled()
    })

    it('reports invalid when the row is missing', async () => {
      mocks.linkSingle.mockResolvedValueOnce({ data: null, error: null })

      const result = await invitationService.acceptInvitationFromLink({
        invitationId: 'inv-1',
        inviterId: 'inviter-uuid',
        inviteeEmail: 'friend@example.com',
      })

      expect(result).toEqual({ outcome: 'invalid' })
      expect(mocks.updateEq).not.toHaveBeenCalled()
    })

    it('accepts the newest pending row when no invitation id is given', async () => {
      mocks.linkLimit.mockResolvedValueOnce({
        data: [{ id: 'inv-9', status: 'pending' }],
        error: null,
      })

      const result = await invitationService.acceptInvitationFromLink({
        inviterId: 'inviter-uuid',
        inviteeEmail: 'friend@example.com',
      })

      expect(result).toEqual({ outcome: 'accepted' })
      expect(mocks.updateEq).toHaveBeenCalledWith('id', 'inv-9')
    })

    it('reports invalid when no pending row exists and no id is given', async () => {
      mocks.linkLimit.mockResolvedValueOnce({ data: [], error: null })

      const result = await invitationService.acceptInvitationFromLink({
        inviterId: 'inviter-uuid',
        inviteeEmail: 'friend@example.com',
      })

      expect(result).toEqual({ outcome: 'invalid' })
      expect(mocks.updateEq).not.toHaveBeenCalled()
    })
  })

  describe('getById', () => {
    it('returns the mapped invitation', async () => {
      mocks.invitationSingle.mockResolvedValueOnce({ data: inviteRow, error: null })

      const invitation = await invitationService.getById('inv-row-id')

      expect(invitation?.inviteeEmail).toBe('friend@example.com')
      expect(invitation?.status).toBe('pending')
    })

    it('returns null when the row is missing', async () => {
      mocks.invitationSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })

      await expect(invitationService.getById('missing')).resolves.toBeNull()
    })
  })

})

