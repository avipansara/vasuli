import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device-level analytics preference.
 *
 * Stored separately from PostHog identity storage because SDK `reset()` can
 * clear its opt-out state. Survives sign-out and identity reset; does not
 * synchronize across devices. `null` means the user never chose: capture
 * defaults to enabled once all other gates pass.
 */

const STORAGE_KEY = 'vasuli:analytics-enabled';

export async function getAnalyticsPreference(): Promise<boolean | null> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  } catch (error) {
    console.warn('[Analytics] Failed to read preference:', error);
    return null;
  }
}

export async function setAnalyticsPreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(enabled));
  } catch (error) {
    console.warn('[Analytics] Failed to persist preference:', error);
    throw error;
  }
}

export type AnalyticsPreferenceStore = {
  getPreference: () => Promise<boolean | null>;
  setPreference: (enabled: boolean) => Promise<void>;
};

export const defaultPreferenceStore: AnalyticsPreferenceStore = {
  getPreference: getAnalyticsPreference,
  setPreference: setAnalyticsPreference,
};
