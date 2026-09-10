import {
  allowedPropertiesForEvent,
  bucketGroupSize,
  isKnownAnalyticsEvent,
  normalizeCurrencyCode,
  type AnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsPlatform,
} from '@/lib/analytics/events';
import type { AnalyticsConfig } from '@/lib/analytics/config';
import type { IdentityHasher } from '@/lib/analytics/identity';
import type { ReleaseContextSource } from '@/lib/analytics/release-context';
import type { AnalyticsPreferenceStore } from '@/lib/analytics/preference-store';
import type { PostHogClientLike } from '@/lib/analytics/posthog-adapter';
import { getInstalledAppVersion } from '@/lib/app-version';
import { Platform } from 'react-native';

/**
 * One typed analytics boundary for screens, controllers, and domain
 * services. Application code calls this service; only the adapter/provider
 * layer touches the PostHog SDK.
 *
 * Gates: an event is accepted only when a client exists for an authenticated
 * person, the environment is approved (preview/production), configuration is
 * complete, and the device preference enables capture. Everything else is a
 * silent no-op (with a dev warning). Calls never throw and are never awaited
 * in a critical product path.
 */

export interface AnalyticsServiceDeps {
  createClient: (config: AnalyticsConfig) => PostHogClientLike;
  config: AnalyticsConfig;
  preferenceStore: AnalyticsPreferenceStore;
  identityHasher: IdentityHasher;
  releaseContextSource: ReleaseContextSource;
  warn?: (message: string, details?: unknown) => void;
  /**
   * Temporary diagnostics: when true, every gate decision and accepted event
   * is logged. Intended for verifying delivery from release builds (where
   * dev tools are unavailable). Never enable in EAS environments.
   */
  debug?: boolean;
}

type QueuedEvent = {
  event: AnalyticsEventName;
  properties: Record<string, unknown>;
  distinctId: string;
};

function currentPlatform(): AnalyticsPlatform | undefined {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return undefined;
}

export function categorizeExpenseFailure(error: unknown): import('@/lib/analytics/events').ExpenseFailureCategory {
  if (!error || typeof error !== 'object') return 'unknown';
  const code =
    'code' in error && typeof error.code === 'string'
      ? error.code.toLowerCase()
      : 'message' in error && typeof error.message === 'string'
        ? error.message.toLowerCase()
        : '';
  if (/network|timeout|offline|fetch|econn|retry|transient/.test(code)) return 'network';
  if (/unauthor|permission|forbidden|rls|denied/.test(code)) return 'permission';
  if (/conflict|stale|duplicate|already|reuse/.test(code)) return 'conflict';
  if (/valid|invalid|required|format|amount|input/.test(code)) return 'validation';
  return 'unknown';
}

export class AnalyticsService {
  private client: PostHogClientLike | null = null;
  private distinctId: string | null = null;
  private userUuid: string | null = null;
  private preferenceEnabled = true;
  private releaseContext: Record<string, string> = {};
  /** Identity captured at track() time so account switching cannot reattribute. */
  private pendingIdentity: { distinctId: string } | null = null;
  private fetchLoggingEnabled = false;
  private appSessionStarted = false;

  constructor(private readonly deps: AnalyticsServiceDeps) {
    if (deps.debug) this.enableFetchLogging();
  }

  get isReady(): boolean {
    return this.client !== null && this.distinctId !== null && this.preferenceEnabled;
  }

  get currentDistinctId(): string | null {
    return this.distinctId;
  }

  /** SDK client for the provider layer (PostHogProvider). Null until identify. */
  getClient(): import('@/lib/analytics/posthog-adapter').PostHogClientLike | null {
    return this.client;
  }

  /** Resolve the device preference before any capture (call after auth resolves). */
  async initializePreference(): Promise<void> {
    try {
      const stored = await this.deps.preferenceStore.getPreference();
      this.preferenceEnabled = stored ?? true;
      if (!this.preferenceEnabled) {
        await this.optOutClient().catch(() => undefined);
      }
    } catch {
      this.preferenceEnabled = true;
    }
  }

  /**
   * Initialize (or re-initialize) for an authenticated person. No-ops when
   * the environment is not approved or configuration is incomplete.
   */
  async identify(userUuid: string): Promise<void> {
    if (!userUuid) return;
    if (!this.deps.config.enabled || !this.deps.config.apiKey) {
      this.debugLog('identify skipped: environment not approved or configuration missing.', {
        enabled: this.deps.config.enabled,
        environment: this.deps.config.environment,
        host: this.deps.config.host,
        hasApiKey: !!this.deps.config.apiKey,
        isDevBundle: typeof __DEV__ !== 'undefined' && __DEV__,
        appEnv: process.env.APP_ENV ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
        // Names only — never values.
        envKeys: Object.keys(process.env ?? {}).filter(key => key.startsWith('EXPO_PUBLIC_')).sort(),
      });
      this.devWarn('Analytics disabled: missing configuration or unapproved environment.');
      return;
    }
    if (this.userUuid === userUuid && this.client && this.distinctId) {
      await this.applyPreferenceToClient().catch(() => undefined);
      return;
    }

    // Account switching: flush best-effort, reset identity, then init incoming.
    this.appSessionStarted = false;
    await this.flush().catch(() => undefined);
    await this.resetClient().catch(() => undefined);
    this.appSessionStarted = false;

    let distinctId: string;
    try {
      distinctId = await this.deps.identityHasher.deriveDistinctId(userUuid);
    } catch (error) {
      this.devWarn('Analytics identity hashing failed; capture stays disabled.', error);
      return;
    }
    if (!this.client) {
      try {
        this.client = this.deps.createClient(this.deps.config);
      } catch (error) {
        this.devWarn('Analytics client creation failed.', error);
        return;
      }
    }
    // Wait for SDK storage init before identify/opt-in: every SDK operation
    // is otherwise deferred behind init while opt-out reads back `true`,
    // silently dropping early events. Bounded so a hung init can't stall us.
    try {
      await this.waitForClientReady(this.client);
    } catch (error) {
      this.debugLog('client ready wait failed; continuing best-effort.', error);
    }
    this.userUuid = userUuid;
    this.distinctId = distinctId;
    this.pendingIdentity = { distinctId };
    this.releaseContext = this.cleanReleaseContext();
    this.debugLog('identified', { distinctId });
    try {
      await this.client.identify(distinctId);
      this.registerReleaseContext();
      await this.applyPreferenceToClient();
      await this.debugProbe();
    } catch (error) {
      this.debugLog('identify call failed.', error);
      this.devWarn('Analytics identify failed.', error);
    }
  }

  async track(event: string, properties: Record<string, unknown> = {}): Promise<boolean> {
    return this.trackInternal(event, properties);
  }

  /** Capture one authenticated app/auth session start per service session. */
  async trackAppSessionStarted(): Promise<boolean> {
    if (this.appSessionStarted) return false;
    const captured = await this.track('app session started', {});
    if (captured) this.appSessionStarted = true;
    return captured;
  }

  /** Convenience: hash a group UUID into its pseudonymous key. */
  async groupKey(groupUuid: string | null | undefined): Promise<string | undefined> {
    if (!groupUuid) return undefined;
    try {
      return await this.deps.identityHasher.deriveGroupKey(groupUuid);
    } catch {
      return undefined;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    try {
      await this.deps.preferenceStore.setPreference(enabled);
    } catch {
      // Persist failure still updates the in-memory gate so the toggle feels
      // responsive; the stored value retries on next change.
    }
    this.preferenceEnabled = enabled;
    await this.applyPreferenceToClient().catch(() => undefined);
    // Opt-in resumes only future approved capture; opt-out drops nothing
    // retroactively (no custom queue exists beyond the SDK's bounded store).
  }

  async flush(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.flush();
    } catch {
      // Best-effort; flushing never blocks product operations.
    }
  }

  /** Sign-out: best-effort flush, then clear identity and super properties. */
  async signOut(): Promise<void> {
    await this.flush().catch(() => undefined);
    await this.resetClient().catch(() => undefined);
    this.appSessionStarted = false;
    this.userUuid = null;
    this.distinctId = null;
    this.pendingIdentity = null;
    this.releaseContext = {};
  }

  // -- internals -----------------------------------------------------------

  private async trackInternal(
    eventName: string,
    properties: Record<string, unknown>,
  ): Promise<boolean> {
    if (!isKnownAnalyticsEvent(eventName)) {
      this.debugLog(`rejected unknown event: ${eventName}`);
      this.devWarn(`Unknown analytics event rejected: ${eventName}`);
      return false;
    }
    if (!this.client || !this.distinctId || !this.preferenceEnabled) {
      this.debugLog(`dropped "${eventName}": no identity or preference disabled`, {
        hasClient: !!this.client,
        hasIdentity: !!this.distinctId,
        preferenceEnabled: this.preferenceEnabled,
      });
      return false;
    }
    if (!this.deps.config.enabled) {
      this.debugLog(`dropped "${eventName}": environment not approved or unconfigured.`);
      return false;
    }

    const validated = this.validateProperties(eventName, properties);
    if (!validated) {
      this.debugLog(`dropped "${eventName}": properties failed validation.`, properties);
      this.devWarn(`Invalid properties rejected for event: ${eventName}`, properties);
      return false;
    }

    const identity = this.pendingIdentity;
    if (!identity) return false;
    const payload = { ...validated, ...this.releaseContextWithDefaults() };
    try {
      // Capture synchronously; the SDK owns batching/retry. Never await in
      // product paths — callers must not await track() critically.
      this.client.capture(eventName, payload);
      this.debugLog(`captured "${eventName}"`, payload);
      if (this.deps.debug) {
        // Immediate delivery for verification; production relies on batch
        // thresholds and background flushes instead.
        this.client
          .flush()
          .then(() => this.debugLog(`flush after "${eventName}" resolved`))
          .catch((error: unknown) => this.debugLog(`flush after "${eventName}" rejected`, error));
      }
      void identity;
      return true;
    } catch (error) {
      this.debugLog(`capture failed for "${eventName}".`, error);
      this.devWarn('Analytics capture failed.', error);
      return false;
    }
  }

  private validateProperties(
    event: AnalyticsEventName,
    properties: Record<string, unknown>,
  ): Record<string, string> | null {
    const allowed = new Set(allowedPropertiesForEvent(event));
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(properties ?? {})) {
      if (value === null || value === undefined) continue;
      if (!allowed.has(key)) {
        this.devWarn(`Property "${key}" not allowed for event "${event}"`);
        return null;
      }
      if (!this.isAllowedValue(key, value)) return null;
      clean[key] = value as string;
    }
    return clean;
  }

  private isAllowedValue(key: string, value: unknown): boolean {
    switch (key) {
      case 'platform':
        return value === 'ios' || value === 'android' || value === 'web';
      case 'app_version':
      case 'group_key':
        return typeof value === 'string' && value.length > 0 && value.length <= 128;
      case 'group_size_bucket':
        return value === '2' || value === '3-5' || value === '6-10' || value === '11+';
      case 'expense_input_method':
        return value === 'manual' || value === 'scan' || value === 'import';
      case 'invite_type':
        return value === 'email' || value === 'friend_request';
      case 'currency_code':
        return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
      case 'failure_category':
        return (
          value === 'validation' ||
          value === 'network' ||
          value === 'permission' ||
          value === 'conflict' ||
          value === 'unknown'
        );
      default:
        return false;
    }
  }

  private releaseContextWithDefaults(): Record<string, string> {
    const out: Record<string, string> = { ...this.releaseContext };
    if (!out.platform) {
      const platform = currentPlatform();
      if (platform) out.platform = platform;
    }
    if (!out.app_version) {
      try {
        const version = getInstalledAppVersion();
        if (version) out.app_version = version;
      } catch {
        // best-effort
      }
    }
    return out;
  }

  private cleanReleaseContext(): Record<string, string> {
    const raw = this.deps.releaseContextSource() as Record<string, unknown>;
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      if (typeof value === 'string' && value) clean[key] = value;
    }
    return clean;
  }

  private registerReleaseContext(): void {
    if (!this.client) return;
    // Remove stale super properties from a previous update context first.
    const register = this.client.register.bind(this.client);
    const unregister = this.client.unregister.bind(this.client);
    try {
      for (const key of Object.keys(this.releaseContext)) {
        unregister(key);
      }
      if (Object.keys(this.releaseContext).length > 0) {
        register(this.releaseContext);
      }
    } catch {
      // Super-property registration is best-effort.
    }
  }

  private async applyPreferenceToClient(): Promise<void> {
    if (!this.client) return;
    try {
      if (this.preferenceEnabled) {
        await this.client.optIn();
      } else {
        await this.client.optOut();
      }
    } catch {
      // Preference application is best-effort.
    }
  }

  private async optOutClient(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.optOut();
    } catch {
      // best-effort
    }
  }

  private async resetClient(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.reset();
    } catch {
      // best-effort
    }
  }

  private static readonly CLIENT_READY_TIMEOUT_MS = 5000;

  private async waitForClientReady(client: PostHogClientLike): Promise<void> {
    if (typeof client.ready !== 'function') return;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('PostHog client ready timed out')),
        AnalyticsService.CLIENT_READY_TIMEOUT_MS,
      );
    });
    await Promise.race([client.ready(), timeout]);
  }

  /**
   * Debug-only end-to-end probe: reports the SDK opt-out state, flushes the
   * queue, and sends one identifiable `debug_probe` event via raw fetch.
   * Runs only when the local `debug` flag is set. Delete the probe event
   * from PostHog after verification.
   */
  private async debugProbe(): Promise<void> {
    if (!this.deps.debug || !this.client) return;
    try {
      const client = this.client as PostHogClientLike & { optedOut?: boolean; _isInitialized?: boolean };
      this.debugLog('probe: sdk optedOut state', { optedOut: client.optedOut ?? null });
      this.debugLog('probe: sdk initialized', { initialized: client._isInitialized ?? null });
      await this.client.flush();
      this.debugLog('probe: flush resolved');
    } catch (error) {
      this.debugLog('probe: flush rejected', error);
    }
    try {
      const host = (this.deps.config.host || '').replace(/\/$/, '');
      const response = await fetch(`${host}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.deps.config.apiKey,
          event: 'debug_probe',
          distinct_id: this.distinctId,
          properties: { source: 'vasuli-analytics-debug' },
        }),
      });
      this.debugLog('probe: raw fetch status', { status: response.status });
    } catch (error) {
      this.debugLog('probe: raw fetch failed (device cannot reach PostHog)', error);
    }
  }

  /**
   * Debug-only HTTP tap: logs every request the app makes to the PostHog
   * host (SDK flushes included) with its status code. Transparent
   * pass-through; enabled only with the local `debug` flag.
   */
  private enableFetchLogging(): void {
    if (this.fetchLoggingEnabled) return;
    this.fetchLoggingEnabled = true;
    try {
      const host = (this.deps.config.host || '').replace(/\/$/, '');
      const originalFetch = globalThis.fetch.bind(globalThis);
      const service = this;
      globalThis.fetch = (async (input: unknown, init?: unknown) => {
        const url = typeof input === 'string' ? input : String((input as { url?: unknown })?.url ?? input);
        const isPostHog = host && url.startsWith(host);
        try {
          const response = await originalFetch(input as never, init as never);
          if (isPostHog) {
            service.debugLog('http', {
              method: (init as { method?: string } | undefined)?.method ?? 'GET',
              path: url.slice(host.length),
              status: (response as { status?: unknown })?.status ?? null,
            });
          }
          return response;
        } catch (error) {
          if (isPostHog) service.debugLog('http failed', { url: url.slice(host.length), error });
          throw error;
        }
      }) as typeof fetch;
    } catch {
      // fetch tap is best-effort
    }
  }

  private debugLog(message: string, details?: unknown): void {
    if (!this.deps.debug) return;
    try {
      this.deps.warn?.(`[debug] ${message}`, details);
    } catch {
      // warn hook is best-effort
    }
    try {
      if (details !== undefined) {
        console.warn(`[Analytics:debug] ${message}`, details);
      } else {
        console.warn(`[Analytics:debug] ${message}`);
      }
    } catch {
      // logging is best-effort
    }
  }

  private devWarn(message: string, details?: unknown): void {
    if (__DEV__) {
      if (details !== undefined) {
        console.warn(`[Analytics] ${message}`, details);
      } else {
        console.warn(`[Analytics] ${message}`);
      }
    }
    try {
      this.deps.warn?.(message, details);
    } catch {
      // warn hook is best-effort
    }
  }
}

export type TrackInput<N extends AnalyticsEventName = AnalyticsEventName> = AnalyticsEvent<N>;

export { bucketGroupSize, normalizeCurrencyCode };
export type { QueuedEvent };
