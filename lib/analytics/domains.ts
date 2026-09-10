/**
 * Versioned, domain-separated hash inputs. User and group namespaces can
 * never collide; bumping a version string rotates the derived IDs.
 */

export const DISTINCT_ID_DOMAIN = 'vasuli-analytics-distinct-id/v1';
export const GROUP_KEY_DOMAIN = 'vasuli-analytics-group-key/v1';

/** Pure domain-separated inputs (stable, versioned, collision-free). */
export function buildDistinctIdInput(userUuid: string): string {
  return `${DISTINCT_ID_DOMAIN}:${userUuid.trim()}`;
}

export function buildGroupKeyInput(groupUuid: string): string {
  return `${GROUP_KEY_DOMAIN}:${groupUuid.trim()}`;
}
