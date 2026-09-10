import { PostHogProvider } from 'posthog-react-native';
import type PostHog from 'posthog-react-native';
import { AppState } from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/contexts/auth-context-otp';
import { consumeAccountCreated } from '@/lib/analytics/account-created-flag';
import { getAnalyticsConfig } from '@/lib/analytics/config';
import { defaultIdentityHasher } from '@/lib/analytics/identity';
import { createPostHogClient } from '@/lib/analytics/posthog-adapter';
import { defaultPreferenceStore } from '@/lib/analytics/preference-store';
import { getReleaseContext } from '@/lib/analytics/release-context';
import { AnalyticsService } from '@/services/analytics-service';
import type { AnalyticsEventName } from '@/lib/analytics/events';

interface AnalyticsContextType {
  service: AnalyticsService;
  isEnabled: boolean;
  isLoading: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

function createService(): AnalyticsService {
  return new AnalyticsService({
    createClient: config => createPostHogClient(config),
    config: getAnalyticsConfig(),
    preferenceStore: defaultPreferenceStore,
    identityHasher: defaultIdentityHasher,
    releaseContextSource: getReleaseContext,
    // Local release-build diagnostics only. Never set in EAS environments.
    debug: process.env.EXPO_PUBLIC_POSTHOG_DEBUG === 'true',
  });
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [service] = useState(createService);
  const [client, setClient] = useState<PostHog | null>(null);
  const [isEnabled, setIsEnabledState] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncIdentity() {
      if (authLoading) return;

      if (!user?.id) {
        // Signed out: flush best-effort, reset identity, tear down the client
        // so no anonymous events can be captured.
        if (lastUserId.current) {
          await service.signOut().catch(() => undefined);
          lastUserId.current = null;
        }
        if (!cancelled) {
          setClient(null);
          setIsLoading(false);
        }
        return;
      }

      if (lastUserId.current === user.id && client) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      await service.initializePreference().catch(() => undefined);
      await service.identify(user.id).catch(() => undefined);
      lastUserId.current = user.id;
      await service.trackAppSessionStarted().catch(() => false);
      // The activation journey starts exactly once: a fresh profile creation
      // emits `account created` here, after identity exists. Repeat sign-ins
      // never set the flag and cannot restart the window. The marker is bound
      // to the created user ID so account switching cannot reattribute it.
      if (await consumeAccountCreated(user.id).catch(() => false)) {
        await service.track('account created', {}).catch(() => undefined);
      }
      if (!cancelled) {
        // Same instance the service captures through; the provider layer is
        // the only place outside the adapter that touches the SDK client.
        setClient(service.getClient() as unknown as PostHog);
        setIsEnabledState(service.isReady);
        setIsLoading(false);
      }
    }

    void syncIdentity();
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, service, client]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      setIsEnabledState(enabled);
      await service.setEnabled(enabled).catch(() => undefined);
      setIsEnabledState(service.isReady);
    },
    [service],
  );

  // Best-effort flush when the app backgrounds: small queues (below the
  // batch threshold) would otherwise sit unsent until the next flush trigger.
  // Never blocks UI; failures stay invisible.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') {
        service.flush().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [service]);

  const value = useMemo(
    () => ({ service, isEnabled, isLoading, setEnabled }),
    [service, isEnabled, isLoading, setEnabled],
  );

  // The SDK provider is mounted only with an authenticated, gated client so
  // no anonymous pre-login activity is ever captured or merged. Autocapture
  // is intentionally not enabled: only the typed taxonomy is emitted.
  if (client) {
    return (
      <AnalyticsContext.Provider value={value}>
        <PostHogProvider client={client}>{children}</PostHogProvider>
      </AnalyticsContext.Provider>
    );
  }

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsContextType {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}
