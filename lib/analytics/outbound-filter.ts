import {
  allowedPropertiesForEvent,
  isKnownAnalyticsEvent,
  RELEASE_CONTEXT_KEYS,
  type AnalyticsEventName,
} from './events';
import type { CaptureEvent } from '@posthog/core';

/**
 * Final outbound privacy filter applied after SDK enrichment (via
 * `before_send`). Only approved event properties plus approved release
 * context survive; everything else the SDK adds automatically is stripped.
 * An event that cannot be made compliant is dropped (null).
 *
 * Never allow raw identifiers, free text, amounts, URLs, tokens, or payloads:
 * the typed service boundary already rejects those, and this filter is the
 * second line of defence against SDK-added properties.
 */

const APPROVED_SDK_PROPERTIES = new Set([
  '$lib',
  '$lib_version',
  '$app_version',
  '$app_build',
  '$app_name',
  '$app_namespace',
  '$os_name',
  '$os_version',
  '$device_type',
  '$device_manufacturer',
  '$device_model',
  '$locale',
  '$timezone',
  '$is_emulator',
]);

/** Patterns that must never leave the device. */
const FORBIDDEN_VALUE_PATTERNS: RegExp[] = [
  /@phone\.placeholder$/i,
];

const FORBIDDEN_KEY_FRAGMENTS = [
  'email',
  'phone',
  'name',
  'token',
  'password',
  'secret',
  'auth',
  'description',
  'note',
  'amount',
  'request',
  'response',
  'body',
  'url',
  'href',
  'error',
  'exception',
  'stack',
  'breadcrumb',
];

/**
 * EAS-owned infrastructure identifiers. UUID-shaped by definition (EAS
 * project ID, EAS update ID) and never user or group identifiers, so the
 * raw-UUID guard below must not treat them as leaked IDs.
 */
const UUID_SHAPED_INFRASTRUCTURE_KEYS = new Set(['eas_project_id', 'eas_update_id']);

function isForbiddenKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (lower === 'group_key' || lower === 'currency_code' || lower === 'failure_category') {
    return false;
  }
  return FORBIDDEN_KEY_FRAGMENTS.some(fragment => lower.includes(fragment));
}

function looksLikeRawUuid(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function sanitizeProperties(
  event: AnalyticsEventName,
  properties: Record<string, unknown>,
): Record<string, unknown> | null {
  const allowed = new Set<string>([
    ...allowedPropertiesForEvent(event),
    ...RELEASE_CONTEXT_KEYS,
    ...APPROVED_SDK_PROPERTIES,
  ]);
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) continue;
    // `$`-namespaced keys are SDK-owned: unknown ones are stripped. A bare
    // sensitive key means an upstream leak, so the event is dropped instead.
    if (!key.startsWith('$') && isForbiddenKey(key)) return null;
    if (!allowed.has(key)) continue;
    if (looksLikeRawUuid(value) && !UUID_SHAPED_INFRASTRUCTURE_KEYS.has(key)) return null;
    if (typeof value === 'string') {
      if (FORBIDDEN_VALUE_PATTERNS.some(pattern => pattern.test(value))) return null;
      // Free-text guard: approved string props are short enums/versions/keys.
      if (value.length > 128) return null;
    }
    if (typeof value === 'object') return null;
    clean[key] = value;
  }

  return clean;
}

export function filterOutboundEvent(
  rawEvent: CaptureEvent | null | undefined,
): CaptureEvent | null {
  if (!rawEvent || typeof rawEvent.event !== 'string') return null;

  const { event } = rawEvent;
  // Only Vasuli product events pass; every automatic PostHog event
  // ($screen, $autocapture, lifecycle, push, feature-flag, replay…) is dropped.
  if (!isKnownAnalyticsEvent(event)) return null;

  const properties =
    rawEvent.properties && typeof rawEvent.properties === 'object' ? rawEvent.properties : {};
  const cleanProperties = sanitizeProperties(event, properties as Record<string, unknown>);
  if (!cleanProperties) return null;

  const out: CaptureEvent = {
    event,
    properties: cleanProperties as CaptureEvent['properties'],
  };
  if (typeof rawEvent.uuid === 'string') out.uuid = rawEvent.uuid;
  if (rawEvent.timestamp instanceof Date) out.timestamp = rawEvent.timestamp;
  return out;
}
