import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { isNetworkOnline } from '@/lib/network-status';

onlineManager.setEventListener(setOnline => {
  return NetInfo.addEventListener(state => {
    setOnline(isNetworkOnline(state));
  });
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      networkMode: 'online',
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});
