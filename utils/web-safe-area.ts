import { Platform, type ViewStyle } from 'react-native';

/** Return a data attribute RN Web forwards to DOM elements for early CSS safe-area rules. */
export function webSafeAreaProps(name: string) {
  return Platform.OS === 'web' ? { dataSet: { safeArea: name } } : {};
}

/** Build a dynamic browser inset expression while keeping the native numeric style type. */
export function webSafeAreaPaddingBottom(minimum: number): ViewStyle['paddingBottom'] {
  // RNW accepts browser CSS lengths at runtime; React Native's type omits CSS functions.
  return `max(env(safe-area-inset-bottom, 0px), ${minimum}px)` as unknown as ViewStyle['paddingBottom'];
}
