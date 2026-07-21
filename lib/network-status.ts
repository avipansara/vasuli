import type { NetInfoState } from '@react-native-community/netinfo';

/** Treat an unknown reachability value as online until NetInfo proves otherwise. */
export function isNetworkOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}
