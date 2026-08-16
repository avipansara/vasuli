import { describe, expect, it, vi } from 'vitest';
import { createQueryCacheAdapter, createReactQueryCacheAdapter } from './query-cache-adapter';
import { QueryClient } from '@tanstack/react-query';

describe('query cache adapter', () => {
  it('captures query values after cancelling and restores them as a group', async () => {
    const cache = new Map<string, unknown>([['home', { balance: 10 }], ['detail', { id: 'group-1' }]]);
    const cancel = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn((key: readonly unknown[], value: unknown) => cache.set(String(key[0]), value));
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const adapter = createQueryCacheAdapter({
      get: <T>(key: readonly unknown[]) => cache.get(String(key[0])) as T | undefined,
      set,
      cancel,
      invalidate,
    });

    const snapshot = await adapter.capture([['home'], ['detail']]);
    cache.set('home', { balance: 0 });
    cache.set('detail', null);

    await adapter.restore(snapshot);

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenNthCalledWith(1, ['home'], { balance: 10 });
    expect(set).toHaveBeenNthCalledWith(2, ['detail'], { id: 'group-1' });
  });

  it('can invalidate every key in a captured transaction', async () => {
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const adapter = createQueryCacheAdapter({
      get: () => undefined,
      set: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      invalidate,
    });

    const snapshot = await adapter.capture([['home'], ['detail']]);
    await adapter.invalidateSnapshot(snapshot);

    expect(invalidate).toHaveBeenCalledWith(['home']);
    expect(invalidate).toHaveBeenCalledWith(['detail']);
  });

  it('maps a React Query client to the shared cache adapter', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['home'], { balance: 10 });
    const adapter = createReactQueryCacheAdapter(queryClient);

    const snapshot = await adapter.capture([['home']]);
    queryClient.setQueryData(['home'], { balance: 0 });
    await adapter.restore(snapshot);

    expect(queryClient.getQueryData(['home'])).toEqual({ balance: 10 });
  });
});
