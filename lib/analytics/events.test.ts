import { describe, expect, it } from 'vitest'

import {
  bucketGroupSize,
  isKnownAnalyticsEvent,
  normalizeCurrencyCode,
  WEEKLY_ACTIVE_EVENTS,
} from '@/lib/analytics/events'
import { buildDistinctIdInput, buildGroupKeyInput } from '@/lib/analytics/domains'

describe('analytics taxonomy', () => {
  it('recognizes only the reviewed event names', () => {
    expect(isKnownAnalyticsEvent('expense created')).toBe(true)
    expect(isKnownAnalyticsEvent('$screen')).toBe(false)
    expect(isKnownAnalyticsEvent('$autocapture')).toBe(false)
    expect(isKnownAnalyticsEvent('Application Opened')).toBe(false)
    expect(isKnownAnalyticsEvent('account signed in')).toBe(false)
    expect(isKnownAnalyticsEvent('settlement creation failed')).toBe(true)
    expect(isKnownAnalyticsEvent('app session started')).toBe(true)
    expect(isKnownAnalyticsEvent('expense updated')).toBe(true)
    expect(isKnownAnalyticsEvent('expense deleted')).toBe(true)
    expect(isKnownAnalyticsEvent('settlement reversed')).toBe(true)
    expect(isKnownAnalyticsEvent('settlement cancelled')).toBe(true)
  })

  it('keeps lifecycle and corrective events out of weekly active people', () => {
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('app session started')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('expense updated')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('expense deleted')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('settlement reversed')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('settlement cancelled')
  })

  it('excludes passive views and errors from weekly active people', () => {
    expect(WEEKLY_ACTIVE_EVENTS).toContain('expense created')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('group viewed')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('expense started')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('expense creation failed')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('settlement started')
    expect(WEEKLY_ACTIVE_EVENTS).not.toContain('settlement creation failed')
  })

  it('buckets group sizes instead of collecting exact counts', () => {
    expect(bucketGroupSize(2)).toBe('2')
    expect(bucketGroupSize(4)).toBe('3-5')
    expect(bucketGroupSize(8)).toBe('6-10')
    expect(bucketGroupSize(25)).toBe('11+')
    expect(bucketGroupSize(null)).toBeUndefined()
    expect(bucketGroupSize(1)).toBeUndefined()
  })

  it('normalizes currency codes and rejects free text', () => {
    expect(normalizeCurrencyCode('usd')).toBe('USD')
    expect(normalizeCurrencyCode('Dinner with friends')).toBeUndefined()
    expect(normalizeCurrencyCode('')).toBeUndefined()
  })

  it('derives stable domain-separated inputs that cannot collide', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(buildDistinctIdInput(id)).toBe(`vasuli-analytics-distinct-id/v1:${id}`)
    expect(buildGroupKeyInput(id)).toBe(`vasuli-analytics-group-key/v1:${id}`)
    expect(buildDistinctIdInput(id)).not.toBe(buildGroupKeyInput(id))
  })
})
