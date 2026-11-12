import { useSafeAreaInsets as useSafeAreaContextInsets } from 'react-native-safe-area-context';

export function usePlatformSafeAreaInsets() {
  return useSafeAreaContextInsets();
}
