import { queryKeys } from '@/services/query-keys';
import type { FriendSummary } from '@/services/friend-summary-service';

type StartupQueryClient = {
  prefetchQuery<TData>(options: {
    queryKey: readonly unknown[];
    queryFn: () => Promise<TData>;
  }): Promise<unknown>;
};

type PostSplashStartupDependencies = {
  queryClient: StartupQueryClient;
  getHomeSummaries: (userId: string) => Promise<FriendSummary[]>;
};

export function createPostSplashStartup({
  queryClient,
  getHomeSummaries,
}: PostSplashStartupDependencies) {
  const inFlightPrefetches = new Map<string, Promise<void>>();

  return {
    prefetchInitialHome(userId: string): Promise<void> {
      const existingPrefetch = inFlightPrefetches.get(userId);
      if (existingPrefetch) return existingPrefetch;

      const prefetch = queryClient
        .prefetchQuery({
          queryKey: queryKeys.friends.home(userId),
          queryFn: () => getHomeSummaries(userId),
        })
        .then(() => undefined);

      inFlightPrefetches.set(userId, prefetch);
      void prefetch.then(
        () => {
          if (inFlightPrefetches.get(userId) === prefetch) {
            inFlightPrefetches.delete(userId);
          }
        },
        () => {
          if (inFlightPrefetches.get(userId) === prefetch) {
            inFlightPrefetches.delete(userId);
          }
        },
      );

      return prefetch;
    },
  };
}
