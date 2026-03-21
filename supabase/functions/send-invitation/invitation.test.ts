import { describe, expect, it } from 'vitest'

import { inviteCtaUrl, parseInvitationBody } from './invitation'

describe('parseInvitationBody', () => {
  it('accepts camelCase payload', () => {
    const r = parseInvitationBody({
      inviteeEmail: 'a@b.com',
      inviteeName: 'Alex',
      inviterName: 'Sam',
      inviterId: '11111111-1111-4111-8111-111111111111',
      invitationId: '22222222-2222-4222-8222-222222222222',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.inviteeEmail).toBe('a@b.com')
      expect(r.data.invitationId).toBe('22222222-2222-4222-8222-222222222222')
    }
  })

  it('accepts snake_case payload', () => {
    const r = parseInvitationBody({
      invitee_email: 'a@b.com',
      invitee_name: 'Alex',
      inviter_name: 'Sam',
      inviter_id: '11111111-1111-4111-8111-111111111111',
      invitation_id: '22222222-2222-4222-8222-222222222222',
    })
    expect(r.ok).toBe(true)
  })

  it('returns missing fields when empty', () => {
    const r = parseInvitationBody({
      inviteeEmail: 'a@b.com',
      inviteeName: 'Alex',
      inviterName: 'Sam',
      inviterId: 'x',
      invitationId: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok && 'missing' in r) {
      expect(r.missing).toContain('invitationId')
    }
  })

  it('rejects non-object body', () => {
    expect(parseInvitationBody(null).ok).toBe(false)
    expect(parseInvitationBody('x').ok).toBe(false)
  })
})

describe('inviteCtaUrl', () => {
  it('encodes inviter id and appends invitation query', () => {
    const url = inviteCtaUrl('id/with space', 'uuid-here')
    expect(url).toContain(encodeURIComponent('id/with space'))
    expect(url).toContain('invitation=uuid-here')
    expect(url.startsWith('https://split-space.com/invite/')).toBe(true)
  })
})
