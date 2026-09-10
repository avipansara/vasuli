import PostHog from 'posthog-react-native';
import type { CaptureEvent } from '@posthog/core';
import { POSTHOG_QUEUE_LIMIT, type AnalyticsConfig } from './config';
import { filterOutboundEvent } from './outbound-filter';

/**
 * PostHog client factory. Phase-one product analytics only:
 *
 * - No lifecycle, screen/touch autocapture, session replay, push capture,
 *   GeoIP, feature flags, or remote flag requests.
 * - Error Tracking stays disabled until phase two.
 * - `before_send` runs the final outbound privacy filter.
 * - The SDK owns batching, retries, and bounded offline persistence
 *   (`maxQueueSize` drops the oldest event when full).
 */

export type PostHogClientLike = Pick<
  PostHog,
  'capture' | 'identify' | 'reset' | 'flush' | 'optIn' | 'optOut' | 'register' | 'unregister'
> & {
  /** Resolves when async SDK initialization (storage preload) completes. */
  ready?: () => Promise<unknown>;
};

export function createPostHogClient(config: AnalyticsConfig): PostHog {
  return new PostHog(config.apiKey as string, {
    host: config.host,
    // Start opted out; the analytics service opts in only after authenticated
    // identity, environment, configuration, and device preference all resolve.
    defaultOptIn: false,
    disabled: false,
    // No automatic collection: the emitted data must match the reviewed taxonomy.
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    disableGeoip: true,
    // No feature flags, experiments, or surveys in phase one.
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    sendFeatureFlagEvent: false,
    // Identified people only; never create person profiles for anonymous traffic
    // (and there is no anonymous traffic: capture requires auth).
    personProfiles: 'identified_only',
    // Bounded offline queue owned by the SDK; oldest drops when full.
    flushAt: 20,
    maxQueueSize: POSTHOG_QUEUE_LIMIT,
    before_send: (event: CaptureEvent | null) => {
      try {
        return filterOutboundEvent(
          event as unknown as Parameters<typeof filterOutboundEvent>[0],
        ) as unknown as CaptureEvent;
      } catch (error) {
        console.warn('[Analytics] Outbound filter failed; dropping event:', error);
        return null;
      }
    },
  });
}
