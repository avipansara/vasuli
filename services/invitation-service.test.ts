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
  const invoke = vi.fn(() =>
    Promise.resolve({ data: { success: true }, error: null })
  )
  const insertSelectSingle = vi.fn(() =>
    Promise.resolve({ data: inviteRow, error: null })
  )
  const deleteEq = vi.fn(() => Promise.resolve({ error: null }))
  const from = vi.fn()
  return { invoke, insertSelectSingle, deleteEq, from }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  },
}))

vi.mock('@/services/user-service', () => ({
  userService: {
    getByEmail: vi.fn(() => Promise.resolve(null)),
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

  it('skips email invoke for synthetic phone-placeholder inbox', async () => {
    await invitationService.create({
      inviterId: 'inviter-uuid',
      inviteeEmail: 'x@phone.placeholder',
    })

    expect(mocks.invoke).not.toHaveBeenCalled()
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
})
