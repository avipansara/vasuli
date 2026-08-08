import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getSession = vi.fn()
  const from = vi.fn()
  const expenseSingle = vi.fn()
  const expenseInsert = vi.fn()
  const splitsInsert = vi.fn()
  const linkAuthUserToProfile = vi.fn()

  return {
    getSession,
    from,
    expenseSingle,
    expenseInsert,
    splitsInsert,
    linkAuthUserToProfile,
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
    from: mocks.from,
  },
}))

vi.mock('@/services/auth-profile-service', () => ({
  linkAuthUserToProfile: mocks.linkAuthUserToProfile,
}))

import { expenseService } from '@/services/expense-service'

describe('expenseService.create auth bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'auth-user-id',
            email: 'current@example.com',
            user_metadata: { name: 'Current User' },
          },
        },
      },
    })
    mocks.linkAuthUserToProfile.mockResolvedValue({
      id: 'current-user-id',
      name: 'Current User',
      email: 'current@example.com',
      isActive: true,
      createdAt: 1,
    })
    mocks.expenseSingle.mockResolvedValue({
      data: {
        id: 'expense-id',
        group_id: null,
        description: 'Lunch',
        amount: 12,
        currency: 'USD',
        paid_by: 'current-user-id',
        category: null,
        date: '2026-01-01T00:00:00.000Z',
        image_url: null,
        notes: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    })
    mocks.splitsInsert.mockResolvedValue({ error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'expenses') {
        return {
          insert: expenseInsert.mockImplementation(() => ({
            select: () => ({
              single: mocks.expenseSingle,
            }),
          })),
        }
      }

      if (table === 'expense_splits') {
        return {
          insert: mocks.splitsInsert,
        }
      }

      return {}
    })
  })

  it('links the Supabase Auth session before inserting an expense', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'auth-user-id',
            email: 'current@example.com',
            user_metadata: { name: 'Current User' },
          },
        },
      },
    })

    await expenseService.create({
      description: 'Lunch',
      amount: 12,
      currency: 'USD',
      paidBy: 'current-user-id',
      date: Date.parse('2026-01-01T00:00:00.000Z'),
    }, [])

    expect(mocks.linkAuthUserToProfile).toHaveBeenCalledWith({
      authUserId: 'auth-user-id',
      email: 'current@example.com',
      name: 'Current User',
    })
    expect(mocks.expenseSingle).toHaveBeenCalled()
  })

  it('rejects a mismatched Supabase Auth session before inserting', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'other-auth-user-id',
            email: 'other@example.com',
            user_metadata: {},
          },
        },
      },
    })
    mocks.linkAuthUserToProfile.mockResolvedValueOnce({
      id: 'other-public-user-id',
      name: 'Other User',
      email: 'other@example.com',
      isActive: true,
      createdAt: 1,
    })

    await expect(expenseService.create({
      description: 'Lunch',
      amount: 12,
      currency: 'USD',
      paidBy: 'current-user-id',
      date: Date.parse('2026-01-01T00:00:00.000Z'),
    }, [])).rejects.toThrow('Supabase Auth session does not match the current app user.')

    expect(mocks.expenseSingle).not.toHaveBeenCalled()
  })

  it('requires a Supabase Auth session before inserting', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } })

    await expect(expenseService.create({
      description: 'Lunch',
      amount: 12,
      currency: 'USD',
      paidBy: 'current-user-id',
      date: Date.parse('2026-01-01T00:00:00.000Z'),
    }, [])).rejects.toThrow('A Supabase Auth session is required to create expenses.')

    expect(mocks.linkAuthUserToProfile).not.toHaveBeenCalled()
    expect(mocks.expenseSingle).not.toHaveBeenCalled()
  })

  it('keeps the signed-in creator separate from the selected payer', async () => {
    await expenseService.create({
      description: 'Dinner',
      amount: 40,
      currency: 'USD',
      paidBy: 'friend-user-id',
      createdBy: 'current-user-id',
      date: Date.parse('2026-01-01T00:00:00.000Z'),
    }, [])

    expect(mocks.linkAuthUserToProfile).toHaveBeenCalled()
    expect(mocks.expenseInsert).toHaveBeenCalledWith(expect.objectContaining({
      paid_by: 'friend-user-id',
      created_by: 'current-user-id',
    }))
  })
})
