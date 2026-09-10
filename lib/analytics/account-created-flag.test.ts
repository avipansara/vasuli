import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  },
}))

import { consumeAccountCreated, markAccountCreated } from '@/lib/analytics/account-created-flag'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

describe('account-created flag', () => {
  beforeEach(() => {
    store.clear()
    vi.clearAllMocks()
  })

  it('consumes the marker only for the user it was set for', async () => {
    await markAccountCreated(USER_A)

    // User B must not receive A's account-created event.
    await expect(consumeAccountCreated(USER_B)).resolves.toBe(false)

    // A's marker survives B's sign-in so A still emits exactly once.
    await expect(consumeAccountCreated(USER_A)).resolves.toBe(true)
    await expect(consumeAccountCreated(USER_A)).resolves.toBe(false)
  })

  it('drops a legacy global marker instead of attributing it to anyone', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    await AsyncStorage.setItem('vasuli:pending-account-created', 'true')

    await expect(consumeAccountCreated(USER_A)).resolves.toBe(false)
    await expect(consumeAccountCreated(USER_B)).resolves.toBe(false)
  })

  it('returns false when no marker is pending', async () => {
    await expect(consumeAccountCreated(USER_A)).resolves.toBe(false)
  })
})
