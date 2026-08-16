import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Returns the user-facing version used for release comparisons.
 */
export function getInstalledAppVersion(): string | null {
  const configVersion = Constants.expoConfig?.version?.trim() || null;

  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return configVersion;
  }

  return Application.nativeApplicationVersion?.trim() || configVersion;
}

/**
 * User-facing version string.
 *
 * - **Store / dev builds:** Uses the native binary's marketing version + build
 *   (`expo-application`), i.e. what App Store / Play show for that install.
 * - **Expo Go:** Native version would be Expo Go's, so we use `app.json` `version`.
 * - **Web:** `app.json` `version` only (`expo-application` is null on web).
 */
export function getAppVersionLabel(): string {
  const configVersion = Constants.expoConfig?.version?.trim() || '';

  if (Platform.OS === 'web') {
    return configVersion ? `Version ${configVersion}` : 'Version';
  }

  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return configVersion ? `Version ${configVersion}` : 'Version';
  }

  const nativeVersion = Application.nativeApplicationVersion?.trim();
  const nativeBuild = Application.nativeBuildVersion?.trim();

  if (nativeVersion && nativeBuild) {
    return `Version ${nativeVersion} (${nativeBuild})`;
  }
  if (nativeVersion) {
    return `Version ${nativeVersion}`;
  }
  return configVersion ? `Version ${configVersion}` : 'Version';
}
