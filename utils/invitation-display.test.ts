import { describe, expect, it } from 'vitest'

import { getSentInvitationDisplay } from './invitation-display'

describe('getSentInvitationDisplay', () => {
  it('shows both name and email when both are present', () => {
    expect(
      getSentInvitationDisplay({ inviteeName: '  Priya  ', inviteeEmail: 'priya@example.com' }),
    ).toEqual({ title: 'Priya', subtitle: 'priya@example.com' })
  })

  it('keeps an email-only invitation readable', () => {
    expect(getSentInvitationDisplay({ inviteeEmail: 'priya@example.com' })).toEqual({
      title: 'Email invitation',
      subtitle: 'priya@example.com',
    })
  })

  it('never returns a blank title', () => {
    expect(getSentInvitationDisplay({})).toEqual({ title: 'Invitation', subtitle: undefined })
    expect(getSentInvitationDisplay({ inviteeName: '   ', inviteeEmail: '   ' })).toEqual({
      title: 'Invitation',
      subtitle: undefined,
    })
  })
})
