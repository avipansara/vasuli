import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useRef } from 'react';

interface UseRefetchOnFocusOptions {
  enabled?: boolean;
  isFetching: boolean;
  isStale: boolean;
  refetch: () => Promise<unknown>;
}

/** Refresh a query on focus only when its cache is stale. */
export function useRefetchOnFocus({
  enabled = true,
  isFetching,
  isStale,
  refetch,
}: UseRefetchOnFocusOptions) {
  const stateRef = useRef({ enabled, isFetching, isStale, refetch });
  stateRef.current = { enabled, isFetching, isStale, refetch };

  useFocusEffect(
    useCallback(() => {
      const state = stateRef.current;
      if (!state.enabled || state.isFetching || !state.isStale) return;

      void state.refetch();
    }, [enabled])
  );
}
