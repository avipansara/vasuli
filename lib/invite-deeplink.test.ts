import { beforeEach, describe, expect, it, vi } from 'vitest'

const parseMock = vi.fn()

vi.mock('expo-linking', () => ({
  parse: (...args: unknown[]) => parseMock(...args),
}))

import { buildInvitePath, parseInviteFromUrl, PENDING_INVITE_PATH_KEY } from './invite-deeplink'

describe('parseInviteFromUrl', () => {
  beforeEach(() => {
    parseMock.mockReset()
  })

  it('returns inviterId and invitationId from path and query', () => {
    parseMock.mockReturnValue({
      path: '/invite/abc-123',
      queryParams: { invitation: 'inv-uuid' },
    })
    expect(parseInviteFromUrl('https://example.com/invite/abc-123?invitation=inv-uuid')).toEqual({
      inviterId: 'abc-123',
      invitationId: 'inv-uuid',
    })
  })

  it('uses first query value when invitation is an array', () => {
    parseMock.mockReturnValue({
      path: 'invite/user-id',
      queryParams: { invitation: ['first', 'second'] },
    })
    expect(parseInviteFromUrl('vasuli://invite/user-id?invitation=first')).toEqual({
      inviterId: 'user-id',
      invitationId: 'first',
    })
  })

  it('returns null when invite path is missing', () => {
    parseMock.mockReturnValue({
      path: '/home',
      queryParams: {},
    })
    expect(parseInviteFromUrl('https://example.com/home')).toBeNull()
  })

  it('returns null on parse errors', () => {
    parseMock.mockImplementation(() => {
      throw new Error('bad url')
    })
    expect(parseInviteFromUrl('x')).toBeNull()
  })
})

describe('buildInvitePath', () => {
  it('includes invitation query when provided', () => {
    expect(buildInvitePath('u1', 'inv-1')).toBe('/invite/u1?invitation=inv-1')
  })

  it('encodes invitation id in query', () => {
    expect(buildInvitePath('u1', 'a b')).toBe('/invite/u1?invitation=a%20b')
  })

  it('omits query when invitation omitted', () => {
    expect(buildInvitePath('u1')).toBe('/invite/u1')
  })
})

describe('PENDING_INVITE_PATH_KEY', () => {
  it('is a stable storage key', () => {
    expect(PENDING_INVITE_PATH_KEY).toBe('vasuli_pending_invite_path')
  })
})
