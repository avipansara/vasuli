import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getInstalledAppVersion } from '@/lib/app-version';
import type { AnalyticsPlatform } from './events';
export { RELEASE_CONTEXT_KEYS } from './events';

/**
 * Release context attached to every event so regressions can be tied to
 * builds and updates. Values come from Expo config / EAS Update at runtime;
 * unavailable values are omitted (never null or stale).
 */

export interface ReleaseContext {
  app_version?: string;
  platform?: AnalyticsPlatform;
  eas_update_id?: string;
  eas_channel?: string;
  eas_runtime_version?: string;
  eas_project_id?: string;
  eas_account?: string;
}

function currentPlatform(): AnalyticsPlatform | undefined {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return undefined;
}

export function getReleaseContext(): ReleaseContext {
  const context: ReleaseContext = {};
  const platform = currentPlatform();
  if (platform) context.platform = platform;

  try {
    const appVersion = getInstalledAppVersion();
    if (appVersion) context.app_version = appVersion;
  } catch {
    // App version is best-effort context.
  }

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const eas = (extra?.eas ?? {}) as Record<string, unknown>;
  if (typeof eas.projectId === 'string' && eas.projectId) {
    context.eas_project_id = eas.projectId;
  }

  try {
    // expo-updates is optional on web; require lazily so web never crashes.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as {
      updateId?: string | null;
      channel?: string | null;
      runtimeVersion?: string | null;
    };
    if (Updates.updateId) context.eas_update_id = Updates.updateId;
    if (Updates.channel) context.eas_channel = Updates.channel;
    if (Updates.runtimeVersion) context.eas_runtime_version = Updates.runtimeVersion;
  } catch {
    // Updates unavailable (e.g. web / Expo Go without updates).
  }

  const account =
    (extra?.easAccount as string | undefined) ??
    (Constants.expoConfig?.owner as string | undefined) ??
    (process.env.EXPO_PUBLIC_EAS_ACCOUNT as string | undefined);
  if (account) context.eas_account = account;

  return context;
}

export type ReleaseContextSource = () => ReleaseContext;
