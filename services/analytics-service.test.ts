import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

vi.mock('@/lib/app-version', () => ({
  getInstalledAppVersion: () => '1.2.3',
  getAppVersionLabel: () => 'Version 1.2.3',
}))

import type { AnalyticsConfig } from '@/lib/analytics/config'
import { AnalyticsService, categorizeExpenseFailure } from '@/services/analytics-service'

const USER_UUID = '11111111-1111-4111-8111-111111111111'
// Fixed pseudonymous stand-ins: the real hasher emits 64-hex digests that
// never contain the raw UUID (see lib/analytics/identity.ts).
const DISTINCT_ID = 'd'.repeat(64)
const GROUP_KEY = 'e'.repeat(64)

function createClientDouble() {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    optIn: vi.fn().mockResolvedValue(undefined),
    optOut: vi.fn().mockResolvedValue(undefined),
    register: vi.fn(),
    unregister: vi.fn(),
  }
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const client = createClientDouble()
  const preference = { stored: null as boolean | null }
  const warnings: Array<{ message: string; details?: unknown }> = []
  const deps = {
    createClient: vi.fn(() => client),
    config: {
      enabled: true,
      apiKey: 'phc_preview',
      host: 'https://us.i.posthog.com',
      environment: 'preview',
    } as AnalyticsConfig,
    preferenceStore: {
      getPreference: vi.fn(async () => preference.stored),
      setPreference: vi.fn(async (enabled: boolean) => {
        preference.stored = enabled
      }),
    },
    identityHasher: {
      deriveDistinctId: vi.fn(async (id: string) =>
        id === 'user-b' ? 'b'.repeat(64) : DISTINCT_ID,
      ),
      deriveGroupKey: vi.fn(async () => GROUP_KEY),
    },
    releaseContextSource: vi.fn(() => ({
      platform: 'ios',
      app_version: '1.2.3',
      eas_channel: 'master',
    })),
    warn: vi.fn((message: string, details?: unknown) => {
      warnings.push({ message, details })
    }),
    ...overrides,
  }
  return { deps, client, preference, warnings }
}

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores events before authentication, while signed out, and without identity', async () => {
    const { deps, client } = createDeps()
    const service = new AnalyticsService(deps as never)

    expect(await service.track('expense created', {})).toBe(false)
    expect(client.capture).not.toHaveBeenCalled()

    await service.signOut()
    expect(await service.track('expense created', {})).toBe(false)
    expect(client.capture).not.toHaveBeenCalled()
  })

  it('stays a no-op in development, without configuration, and while opted out', async () => {
    const disabled = createDeps({
      config: { enabled: false, apiKey: null, host: 'https://us.i.posthog.com', environment: 'development' },
    })
    const devService = new AnalyticsService(disabled.deps as never)
    await devService.identify(USER_UUID)
    expect(disabled.deps.createClient).not.toHaveBeenCalled()
    expect(await devService.track('expense created', {})).toBe(false)

    const { deps, client } = createDeps()
    const service = new AnalyticsService(deps as never)
    await service.setEnabled(false)
    await service.identify(USER_UUID)
    expect(client.optOut).toHaveBeenCalled()
    expect(await service.track('expense created', {})).toBe(false)
    expect(client.capture).not.toHaveBeenCalled()
  })

  it('initializes identity without emitting lifecycle, screen, touch, push, replay, flag, or anonymous events', async () => {
    const { deps, client } = createDeps()
    const service = new AnalyticsService(deps as never)

    await service.initializePreference()
    await service.identify(USER_UUID)

    expect(client.identify).toHaveBeenCalledTimes(1)
    expect(client.identify).toHaveBeenCalledWith(DISTINCT_ID)
    // No anonymous or automatic capture during initialization.
    expect(client.capture).not.toHaveBeenCalled()
    expect(service.currentDistinctId).toBe(DISTINCT_ID)
    expect(service.currentDistinctId).not.toContain(USER_UUID)
  })

  it('captures one authenticated app session start until sign-out or account switch', async () => {
    const { deps, client } = createDeps()
    const service = new AnalyticsService(deps as never)

    expect(await service.trackAppSessionStarted()).toBe(false)
    await service.identify(USER_UUID)
    expect(await service.trackAppSessionStarted()).toBe(true)
    expect(await service.trackAppSessionStarted()).toBe(false)
    expect(client.capture).toHaveBeenCalledTimes(1)
    expect(client.capture).toHaveBeenCalledWith('app session started', expect.any(Object))

    await service.signOut()
    await service.identify(USER_UUID)
    expect(await service.trackAppSessionStarted()).toBe(true)
    expect(client.capture).toHaveBeenCalledTimes(2)

    await service.identify('22222222-2222-4222-8222-222222222222')
    expect(await service.trackAppSessionStarted()).toBe(true)
    expect(client.capture).toHaveBeenCalledTimes(3)
  })

  it('derives stable pseudonymous group keys and never sends raw IDs', async () => {
    const { deps, client } = createDeps()
    const service = new AnalyticsService(deps as never)
    await service.identify(USER_UUID)

    const key = await service.groupKey(USER_UUID)
    expect(key).toBe(GROUP_KEY)

    await service.track('expense created', {
      group_key: key,
      group_size_bucket: '3-5',
      expense_input_method: 'manual',
      currency_code: 'USD',
    })
    expect(client.capture).toHaveBeenCalledWith(
      'expense created',
      expect.objectContaining({ group_key: GROUP_KEY }),
    )
    const payload = client.capture.mock.calls[0][1] as Record<string, unknown>
    expect(JSON.stringify(payload)).not.toContain(USER_UUID)
  })

  it('prevents sign-out and account switching from reattributing events', async () => {
    const { deps, client } = createDeps()
    const service = new AnalyticsService(deps as never)
    await service.identify('user-a')
    expect(await service.track('expense started', {})).toBe(true)
    expect(client.capture).toHaveBeenCalledTimes(1)

    await service.signOut()
    expect(client.reset).toHaveBeenCalled()
    // No outgoing event can be attributed to the next person.
    expect(await service.track('expense started', {})).toBe(false)

    await service.identify('user-b')
    expect(client.identify).toHaveBeenLastCalledWith('b'.repeat(64))
    expect(service.currentDistinctId).toBe('b'.repeat(64))
    expect(await service.track('expense started', {})).toBe(true)
    expect(client.capture).toHaveBeenCalledTimes(2)
  })

  it('keeps device-level opt-out across reset and sign-in', async () => {
    const { deps, client } = createDeps()
    const service = new AnalyticsService(deps as never)

    await service.setEnabled(false)
    await service.identify(USER_UUID)
    expect(await service.track('expense started', {})).toBe(false)

    await service.signOut()
    await service.identify(USER_UUID)
    // Opt-out survived SDK reset and sign-in; only future opt-in resumes capture.
    expect(client.optOut).toHaveBeenCalled()
    expect(await service.track('expense started', {})).toBe(false)

    await service.setEnabled(true)
    expect(await service.track('expense started', {})).toBe(true)
  })

  it('rejects unknown events and properties outside the declared shape', async () => {
    const { deps, client, warnings } = createDeps()
    const service = new AnalyticsService(deps as never)
    await service.identify(USER_UUID)

    expect(await service.track('account signed in' as never, {})).toBe(false)
    expect(
      await service.track('expense created', { description: 'Dinner' } as never),
    ).toBe(false)
    expect(
      await service.track('expense created', { amount: 42 } as never),
    ).toBe(false)
    expect(
      await service.track('expense created', { currency_code: 'dinner' }),
    ).toBe(false)
    expect(client.capture).not.toHaveBeenCalled()
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('registers release context when available and clears stale values', async () => {
    const { deps, client } = createDeps()
    const service = new AnalyticsService(deps as never)
    await service.identify(USER_UUID)
    expect(client.register).toHaveBeenCalledWith(
      expect.objectContaining({ eas_channel: 'master', app_version: '1.2.3' }),
    )

    const emptySource = createDeps({ releaseContextSource: () => ({}) })
    const bare = new AnalyticsService(emptySource.deps as never)
    await bare.identify(USER_UUID)
    expect(emptySource.client.register).not.toHaveBeenCalled()

    // Context change removes stale super properties before registering.
    const rotating = createDeps({
      releaseContextSource: vi
        .fn()
        .mockReturnValueOnce({ eas_update_id: 'update-1' })
        .mockReturnValue({ eas_update_id: 'update-2' }),
    })
    const rotatingService = new AnalyticsService(rotating.deps as never)
    await rotatingService.identify('user-1')
    await rotatingService.identify('user-2')
    expect(rotating.client.unregister).toHaveBeenCalledWith('eas_update_id')
    expect(rotating.client.register).toHaveBeenLastCalledWith({ eas_update_id: 'update-2' })
  })

  it('never rejects or delays product operations on SDK failure', async () => {
    const failingClient = createClientDouble()
    failingClient.capture.mockImplementation(() => {
      throw new Error('offline')
    })
    failingClient.flush.mockRejectedValue(new Error('offline'))
    const { deps } = createDeps({ createClient: () => failingClient })
    const service = new AnalyticsService(deps as never)
    await service.identify(USER_UUID)

    await expect(service.track('expense created', {})).resolves.toBe(false)
    await expect(service.flush()).resolves.toBeUndefined()
    await expect(service.signOut()).resolves.toBeUndefined()
  })

  it('waits for SDK readiness before identify so early events are not dropped', async () => {
    let releaseReady!: () => void
    const readyGate = new Promise<void>(resolve => {
      releaseReady = resolve
    })
    const slowClient = createClientDouble()
    const readyMock = vi.fn(() => readyGate)
    const slowDeps = createDeps({
      createClient: () => ({ ...slowClient, ready: readyMock }),
    })
    const service = new AnalyticsService(slowDeps.deps as never)

    const identified = service.identify(USER_UUID)
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(slowClient.identify).not.toHaveBeenCalled()

    releaseReady()
    await identified
    expect(readyMock).toHaveBeenCalled()
    expect(slowClient.identify).toHaveBeenCalledWith(DISTINCT_ID)
    expect(await service.track('expense started', {})).toBe(true)
  })

  it('logs gate decisions through the warn hook when debug is enabled', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 200 } as Response)
    try {
      const { deps, warnings } = createDeps({ debug: true })
      const service = new AnalyticsService(deps as never)
      expect(await service.track('expense started', {})).toBe(false)
      expect(warnings.some(entry => entry.message.includes('[debug]'))).toBe(true)

      await service.identify(USER_UUID)
      expect(await service.track('expense started', {})).toBe(true)
      expect(
        warnings.some(entry => entry.message.includes('captured "expense started"')),
      ).toBe(true)
      expect(fetchSpy).toHaveBeenCalledOnce()
      expect(
        warnings.some(entry => entry.message.includes('probe: raw fetch status')),
      ).toBe(true)
    } finally {
      warnSpy.mockRestore()
      fetchSpy.mockRestore()
    }
  })

  it('categorizes expense failures without raw errors', () => {    expect(categorizeExpenseFailure({ code: 'NETWORK_ERROR' })).toBe('network')
    expect(categorizeExpenseFailure({ code: 'permission_denied' })).toBe('permission')
    expect(categorizeExpenseFailure({ code: 'conflict' })).toBe('conflict')
    expect(categorizeExpenseFailure({ code: 'invalid_input' })).toBe('validation')
    expect(categorizeExpenseFailure(new Error('Failed to create expense'))).toBe('unknown')
    expect(categorizeExpenseFailure(null)).toBe('unknown')
  })
})
