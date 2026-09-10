/**
 * Analytics configuration resolution.
 *
 * Preview and production use separate PostHog projects supplied through EAS
 * environment values (`EXPO_PUBLIC_POSTHOG_API_KEY` /
 * `EXPO_PUBLIC_POSTHOG_HOST` plus the explicit
 * `EXPO_PUBLIC_POSTHOG_ENABLED` flag). Development and test builds remain
 * disabled by default. Missing configuration disables analytics without
 * affecting startup. Project selection never uses `NODE_ENV`.
 */

export const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com';
export const POSTHOG_QUEUE_LIMIT = 500;

export type AnalyticsEnvironment = 'development' | 'preview' | 'production' | 'test';

export interface AnalyticsConfig {
  enabled: boolean;
  apiKey: string | null;
  host: string;
  environment: AnalyticsEnvironment;
}

function parseEnabledFlag(raw: string | undefined): boolean {
  // Preview/production are enabled when a project token is present unless
  // explicitly disabled. Development and test are handled by the caller.
  return raw !== 'false';
}

export function getAnalyticsConfig(
  env?: Record<string, string | undefined>,
  // Injected (default: the real `__DEV__` global) so unit tests can cover
  // both dev bundles and release bundles deterministically.
  isDevBundle: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
): AnalyticsConfig {
  // IMPORTANT: when no explicit record is passed, each variable is read via
  // a direct `process.env.EXPO_PUBLIC_*` access. Expo inlines those at build
  // time with a Babel plugin that only recognizes direct member expressions —
  // reading them through an alias (e.g. a parameter defaulting to
  // `process.env`) silently yields `undefined` in release bundles, disabling
  // analytics with no error. Keep every access below direct.
  const resolved: Record<string, string | undefined> = env ?? {
    VITEST: process.env.VITEST,
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    EXPO_PUBLIC_POSTHOG_ENABLED: process.env.EXPO_PUBLIC_POSTHOG_ENABLED,
  };
  const environment = resolveEnvironment(resolved, isDevBundle);

  const apiKey = resolved.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || null;
  const host = resolved.EXPO_PUBLIC_POSTHOG_HOST?.trim() || POSTHOG_DEFAULT_HOST;
  const flagEnabled = parseEnabledFlag(resolved.EXPO_PUBLIC_POSTHOG_ENABLED);

  // Development and test builds are no-ops by default even if a token is
  // present, so local work never pollutes preview/production. Verify delivery
  // in preview builds, not the dev server.
  if (environment === 'development' || environment === 'test') {
    return { enabled: false, apiKey: null, host, environment };
  }

  if (!flagEnabled || !apiKey) {
    return { enabled: false, apiKey: null, host, environment };
  }

  return { enabled: true, apiKey, host, environment };
}

function resolveEnvironment(
  env: Record<string, string | undefined>,
  isDevBundle: boolean,
): AnalyticsEnvironment {
  if (env.VITEST === 'true' || env.NODE_ENV === 'test') return 'test';
  // A dev-served bundle is always a development client — even `start:prod`,
  // which acts on production data but still runs a dev bundle. Dev bundles
  // never send, regardless of any APP_ENV label, so dev workflows cannot
  // pollute preview or production metrics.
  if (isDevBundle) return 'development';
  const appEnv = (env.APP_ENV ?? env.EXPO_PUBLIC_APP_ENV ?? '').toLowerCase();
  if (appEnv === 'preview') return 'preview';
  if (appEnv === 'production') return 'production';
  if (appEnv === 'development') return 'development';
  // Release bundles: EAS preview/production environments must set
  // EXPO_PUBLIC_APP_ENV, but the project token always selects the project.
  // Anything that is not dev/test is an approved release environment.
  if (env.NODE_ENV === 'development') return 'development';
  return 'production';
}
