import { describe, expect, it } from 'vitest'

import { getEmailErrorMessage, isEmailValid, validateAndFormatEmail } from './validation'

describe('isEmailValid', () => {
  it('returns false for empty or non-string', () => {
    expect(isEmailValid('')).toBe(false)
    expect(isEmailValid('   ')).toBe(false)
    expect(isEmailValid(null as unknown as string)).toBe(false)
  })

  it('accepts simple valid addresses', () => {
    expect(isEmailValid('a@b.co')).toBe(true)
    expect(isEmailValid('user.name+tag@example.com')).toBe(true)
  })

  it('rejects addresses without domain or @', () => {
    expect(isEmailValid('notanemail')).toBe(false)
    expect(isEmailValid('missing@')).toBe(false)
    expect(isEmailValid('@nodomain.com')).toBe(false)
  })
})

describe('validateAndFormatEmail', () => {
  it('returns lowercase trimmed email when valid', () => {
    expect(validateAndFormatEmail('  User@EXAMPLE.com  ')).toBe('user@example.com')
  })

  it('returns null when invalid', () => {
    expect(validateAndFormatEmail('bad')).toBe(null)
  })
})

describe('getEmailErrorMessage', () => {
  it('describes empty input', () => {
    expect(getEmailErrorMessage('')).toContain('enter')
  })

  it('mentions @ when missing', () => {
    expect(getEmailErrorMessage('userexample.com')).toContain('@')
  })
})
