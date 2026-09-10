/** Pure helpers for account deletion. */

export const DISTINCT_ID_DOMAIN = 'vasuli-analytics-distinct-id/v1';

export function buildDistinctIdInput(userUuid: string): string {
  return `${DISTINCT_ID_DOMAIN}:${userUuid.trim()}`;
}

export function parseProjectIdList(raw: string): string[] {
  return raw.split(',').map(part => part.trim()).filter(Boolean);
}

export function posthogDeleteUrl(host: string, projectId: string): string {
  return `${host.replace(/\/$/, '')}/api/projects/${encodeURIComponent(projectId)}/persons/bulk_delete/`;
}
