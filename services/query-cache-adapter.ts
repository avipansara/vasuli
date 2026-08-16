import type { QueryClient } from '@tanstack/react-query';

export type QueryCacheKey = string | readonly unknown[];

export type QueryCacheAdapter = {
  get<T>(key: QueryCacheKey): T | undefined;
  set<T>(key: QueryCacheKey, updater: T | ((current: T | undefined) => T)): void;
  cancel(key: QueryCacheKey): Promise<void>;
  invalidate(key: QueryCacheKey): Promise<void>;
  capture(keys: QueryCacheKey[]): Promise<QueryCacheSnapshot>;
  restore(snapshot: QueryCacheSnapshot): Promise<void>;
  invalidateSnapshot(snapshot: QueryCacheSnapshot): Promise<void>;
};

export type QueryCacheSnapshot = {
  entries: { key: QueryCacheKey; value: unknown }[];
};

export function createQueryCacheAdapter(cache: Omit<QueryCacheAdapter, 'capture' | 'restore' | 'invalidateSnapshot'>): QueryCacheAdapter {
  return {
    ...cache,
    async capture(keys) {
      await Promise.all(keys.map(key => cache.cancel(key)));
      return {
        entries: keys.map(key => ({ key, value: cache.get(key) })),
      };
    },
    async restore(snapshot) {
      snapshot.entries.forEach(({ key, value }) => cache.set(key, value));
    },
    async invalidateSnapshot(snapshot) {
      await Promise.all(snapshot.entries.map(({ key }) => cache.invalidate(key)));
    },
  };
}

export function createReactQueryCacheAdapter(queryClient: QueryClient): QueryCacheAdapter {
  return createQueryCacheAdapter({
    get: key => queryClient.getQueryData(key as readonly unknown[]),
    set: (key, updater) => queryClient.setQueryData(key as readonly unknown[], updater),
    cancel: key => queryClient.cancelQueries({ queryKey: key as readonly unknown[] }),
    invalidate: key => queryClient.invalidateQueries({ queryKey: key as readonly unknown[] }),
  });
}
