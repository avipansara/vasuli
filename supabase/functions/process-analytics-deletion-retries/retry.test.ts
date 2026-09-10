import { describe, expect, it } from 'vitest'
import { DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE, parseBatchSize, posthogDeleteUrl } from './retry'

describe('analytics deletion retry helpers', () => {
  it('bounds the worker batch size', () => {
    expect(parseBatchSize(undefined)).toBe(DEFAULT_BATCH_SIZE)
    expect(parseBatchSize('0')).toBe(DEFAULT_BATCH_SIZE)
    expect(parseBatchSize('250')).toBe(MAX_BATCH_SIZE)
    expect(parseBatchSize('7')).toBe(7)
  })

  it('builds a project-scoped PostHog deletion URL', () => {
    expect(posthogDeleteUrl('https://us.i.posthog.com/', 'a/b')).toBe(
      'https://us.i.posthog.com/api/projects/a%2Fb/persons/bulk_delete/',
    )
  })
})
