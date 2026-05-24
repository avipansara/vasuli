import { describe, expect, it } from 'vitest'

import {
  getEmailErrorMessage,
  getPersonNameErrorMessage,
  isEmailValid,
  normalizeCurrencyInput,
  normalizeEmail,
  normalizePersonName,
  validateAndFormatEmail,
} from './validation'

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

describe('normalizeEmail', () => {
  it('returns undefined for empty, whitespace, or missing', () => {
    expect(normalizeEmail(undefined)).toBe(undefined)
    expect(normalizeEmail('')).toBe(undefined)
    expect(normalizeEmail('   ')).toBe(undefined)
  })

  it('trims and lowercases for lookup parity', () => {
    expect(normalizeEmail('  Varun.y.n@Gmail.COM  ')).toBe('varun.y.n@gmail.com')
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

describe('normalizePersonName', () => {
  it('trims and collapses repeated whitespace', () => {
    expect(normalizePersonName('  Ada    Lovelace  ')).toBe('Ada Lovelace')
    expect(normalizePersonName('Grace\tHopper')).toBe('Grace Hopper')
  })

  it('accepts common punctuation and non-English letters', () => {
    expect(normalizePersonName("  José O'Connor-Singh  ")).toBe("José O'Connor-Singh")
  })

  it('returns null for names shorter than two characters after normalization', () => {
    expect(normalizePersonName('A')).toBe(null)
    expect(normalizePersonName('   ')).toBe(null)
  })

  it('returns null for names over fifty characters or with control characters', () => {
    expect(normalizePersonName('A'.repeat(51))).toBe(null)
    expect(normalizePersonName('Ada\nLovelace')).toBe(null)
  })
})

describe('getPersonNameErrorMessage', () => {
  it('describes empty, short, long, and control-character names', () => {
    expect(getPersonNameErrorMessage('')).toContain('enter')
    expect(getPersonNameErrorMessage('A')).toContain('at least 2')
    expect(getPersonNameErrorMessage('A'.repeat(51))).toContain('50')
    expect(getPersonNameErrorMessage('Ada\nLovelace')).toContain('line breaks')
  })
})

describe('normalizeCurrencyInput', () => {
  it('keeps at most two decimal places', () => {
    expect(normalizeCurrencyInput('12.345')).toBe('12.34')
    expect(normalizeCurrencyInput('0.999')).toBe('0.99')
  })

  it('removes extra decimal separators and non-numeric characters', () => {
    expect(normalizeCurrencyInput('$1,234.567')).toBe('1234.56')
    expect(normalizeCurrencyInput('12.3.4')).toBe('12.34')
  })

  it('allows in-progress currency input', () => {
    expect(normalizeCurrencyInput('')).toBe('')
    expect(normalizeCurrencyInput('.')).toBe('.')
    expect(normalizeCurrencyInput('12.')).toBe('12.')
  })
})
