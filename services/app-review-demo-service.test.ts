import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.EXPO_PUBLIC_APP_REVIEWER_EMAIL = 'reviewer@example.test'
})

const reviewer = {
  id: 'reviewer-id',
  name: 'Apple Reviewer',
  email: 'reviewer@example.test',
}

const demoUsersByEmail: Record<string, any> = {
  'maya.demo@vasuli.app': { id: 'maya-id', name: 'Maya Rao', email: 'maya.demo@vasuli.app', isActive: true, createdAt: 1 },
  'ben.demo@vasuli.app': { id: 'ben-id', name: 'Ben Carter', email: 'ben.demo@vasuli.app', isActive: true, createdAt: 1 },
  'sofia.demo@vasuli.app': { id: 'sofia-id', name: 'Sofia Kim', email: 'sofia.demo@vasuli.app', isActive: true, createdAt: 1 },
}

const mocks = vi.hoisted(() => ({
  getByEmail: vi.fn(),
  createUser: vi.fn(),
  createAccepted: vi.fn(),
  getUserGroups: vi.fn(),
  createGroup: vi.fn(),
  getMembers: vi.fn(),
  addMember: vi.fn(),
  getByGroup: vi.fn(),
  getUserExpenses: vi.fn(),
  createExpense: vi.fn(),
  createSettlement: vi.fn(),
  logGroupCreated: vi.fn(),
  logMemberAdded: vi.fn(),
  logExpenseCreated: vi.fn(),
  logSettlementCreated: vi.fn(),
}))

vi.mock('@/services/user-service', () => ({
  userService: {
    getByEmail: mocks.getByEmail,
    create: mocks.createUser,
  },
}))

vi.mock('@/services/friendship-service', () => ({
  friendshipService: {
    createAccepted: mocks.createAccepted,
  },
}))

vi.mock('@/services/group-service', () => ({
  groupService: {
    getUserGroups: mocks.getUserGroups,
    create: mocks.createGroup,
    getMembers: mocks.getMembers,
    addMember: mocks.addMember,
  },
}))

vi.mock('@/services/expense-service', () => ({
  expenseService: {
    getByGroup: mocks.getByGroup,
    getUserExpenses: mocks.getUserExpenses,
    create: mocks.createExpense,
  },
}))

vi.mock('@/services/settlement-service', () => ({
  settlementService: {
    getByGroup: mocks.getByGroup,
    create: mocks.createSettlement,
  },
}))

vi.mock('@/services/activity-service', () => ({
  activityService: {
    logGroupCreated: mocks.logGroupCreated,
    logMemberAdded: mocks.logMemberAdded,
    logExpenseCreated: mocks.logExpenseCreated,
    logSettlementCreated: mocks.logSettlementCreated,
  },
}))

import { ensureAppReviewDemoData } from '@/services/app-review-demo-service'

describe('ensureAppReviewDemoData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getByEmail.mockImplementation((email: string) => Promise.resolve(demoUsersByEmail[email] ?? null))
    mocks.createUser.mockImplementation((user: { email: string }) => Promise.resolve(demoUsersByEmail[user.email]))
    mocks.createAccepted.mockResolvedValue(undefined)
    mocks.getUserGroups.mockResolvedValue([])
    mocks.createGroup.mockImplementation((group: { name: string; description?: string }) =>
      Promise.resolve({
        id: `${group.name.toLowerCase().replaceAll(' ', '-')}-id`,
        name: group.name,
        description: group.description,
        createdAt: 1,
        updatedAt: 1,
      })
    )
    mocks.getMembers.mockResolvedValue([])
    mocks.addMember.mockResolvedValue(undefined)
    mocks.getByGroup.mockResolvedValue([])
    mocks.getUserExpenses.mockResolvedValue([])
    mocks.createExpense.mockImplementation((expense: { description: string }) =>
      Promise.resolve({
        id: `${expense.description.toLowerCase().replaceAll(' ', '-')}-id`,
        ...expense,
        createdAt: 1,
        updatedAt: 1,
      })
    )
    mocks.createSettlement.mockResolvedValue({
      id: 'settlement-id',
      amount: 45,
      createdAt: 1,
    })
    mocks.logGroupCreated.mockResolvedValue({})
    mocks.logMemberAdded.mockResolvedValue({})
    mocks.logExpenseCreated.mockResolvedValue({})
    mocks.logSettlementCreated.mockResolvedValue({})
  })

  it('does nothing for non-reviewer users', async () => {
    await ensureAppReviewDemoData({
      id: 'regular-id',
      name: 'Regular User',
      email: 'regular@example.com',
    })

    expect(mocks.getByEmail).not.toHaveBeenCalled()
    expect(mocks.createExpense).not.toHaveBeenCalled()
  })

  it('creates friends, groups, expenses, a settlement, and activity for the reviewer', async () => {
    await ensureAppReviewDemoData(reviewer)

    expect(mocks.getByEmail).toHaveBeenCalledTimes(3)
    expect(mocks.createAccepted).toHaveBeenCalledTimes(3)
    expect(mocks.createGroup).toHaveBeenCalledTimes(2)
    expect(mocks.addMember).toHaveBeenCalledTimes(7)
    expect(mocks.createExpense).toHaveBeenCalledTimes(6)
    expect(mocks.createSettlement).toHaveBeenCalledTimes(1)
    expect(mocks.logExpenseCreated).toHaveBeenCalledTimes(6)
    expect(mocks.logSettlementCreated).toHaveBeenCalledTimes(1)
  })
})
