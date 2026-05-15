import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedQueryInvalidation(queryKey: QueryKey, delay = 500) {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey });
      timeoutRef.current = null;
    }, delay);
  }, [delay, queryClient, queryKey]);
}
