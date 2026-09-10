import { describe, expect, it } from 'vitest'

import { getAnalyticsConfig } from '@/lib/analytics/config'

describe('getAnalyticsConfig', () => {
  // NOTE: vitest runs with `__DEV__ === true`, so release-bundle cases pass
  // `isDevBundle: false` explicitly; dev-bundle cases use the default.
  it('disables development builds even with a token present', () => {
    const config = getAnalyticsConfig({
      APP_ENV: 'development',
      EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_dev',
      EXPO_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
    })
    expect(config.enabled).toBe(false)
    expect(config.apiKey).toBeNull()
    expect(config.environment).toBe('development')
  })

  it('disables dev bundles carrying a preview/production label (e.g. start:prod)', () => {
    const config = getAnalyticsConfig(
      {
        APP_ENV: 'production',
        EXPO_PUBLIC_APP_ENV: 'preview',
        EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_preview',
      },
      true,
    )
    expect(config.enabled).toBe(false)
    expect(config.apiKey).toBeNull()
    expect(config.environment).toBe('development')
  })

  it('disables test builds even with a token present', () => {
    const config = getAnalyticsConfig({
      NODE_ENV: 'test',
      EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_test',
    })
    expect(config.enabled).toBe(false)
    expect(config.apiKey).toBeNull()
    expect(config.environment).toBe('test')
  })

  it('enables preview with its own project token', () => {
    const config = getAnalyticsConfig(
      {
        APP_ENV: 'preview',
        EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_preview',
        EXPO_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
      },
      false,
    )
    expect(config.enabled).toBe(true)
    expect(config.apiKey).toBe('phc_preview')
    expect(config.environment).toBe('preview')
  })

  it('enables production with its own project token', () => {
    const config = getAnalyticsConfig(
      {
        APP_ENV: 'production',
        EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_production',
        EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
      },
      false,
    )
    expect(config.enabled).toBe(true)
    expect(config.apiKey).toBe('phc_production')
    expect(config.host).toBe('https://eu.i.posthog.com')
    expect(config.environment).toBe('production')
  })

  it('disables preview without a token and production when explicitly flagged off', () => {
    expect(
      getAnalyticsConfig({ APP_ENV: 'preview' }).enabled,
    ).toBe(false)
    expect(
      getAnalyticsConfig({
        APP_ENV: 'production',
        EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_production',
        EXPO_PUBLIC_POSTHOG_ENABLED: 'false',
      }).enabled,
    ).toBe(false)
  })

  it('defaults the host when none is configured', () => {
    const config = getAnalyticsConfig({
      APP_ENV: 'preview',
      EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_preview',
    })
    expect(config.host).toBe('https://us.i.posthog.com')
  })
})
