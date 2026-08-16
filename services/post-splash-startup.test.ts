import { describe, expect, it, vi } from 'vitest';

import { createPostSplashStartup } from '@/services/post-splash-startup';

describe('post-splash startup readiness', () => {
  it('prefetches the initial Friends home data for an authenticated profile', async () => {
    const prefetchQuery = vi.fn().mockResolvedValue(undefined);
    const getHomeSummaries = vi.fn().mockResolvedValue([
      { id: 'friend-1', name: 'Alex', balance: 12 },
    ]);
    const startup = createPostSplashStartup({
      queryClient: { prefetchQuery },
      getHomeSummaries,
    });

    await startup.prefetchInitialHome('user-1');

    expect(prefetchQuery).toHaveBeenCalledTimes(1);
    const request = prefetchQuery.mock.calls[0][0];
    expect(request.queryKey).toEqual(['friends', 'home', 'user-1']);

    await request.queryFn();

    expect(getHomeSummaries).toHaveBeenCalledWith('user-1');
  });

  it('deduplicates concurrent prefetch requests for the same profile', async () => {
    let resolvePrefetch!: () => void;
    const prefetchQuery = vi.fn().mockReturnValue(
      new Promise<void>(resolve => {
        resolvePrefetch = resolve;
      })
    );
    const startup = createPostSplashStartup({
      queryClient: { prefetchQuery },
      getHomeSummaries: vi.fn(),
    });

    const first = startup.prefetchInitialHome('user-1');
    const second = startup.prefetchInitialHome('user-1');

    expect(second).toBe(first);
    expect(prefetchQuery).toHaveBeenCalledTimes(1);

    resolvePrefetch();
    await Promise.all([first, second]);
  });

  it('reports prefetch failure without changing the startup contract', async () => {
    const prefetchError = new Error('network unavailable');
    const startup = createPostSplashStartup({
      queryClient: {
        prefetchQuery: vi.fn().mockRejectedValue(prefetchError),
      },
      getHomeSummaries: vi.fn(),
    });

    await expect(startup.prefetchInitialHome('user-1')).rejects.toBe(prefetchError);
  });
});
