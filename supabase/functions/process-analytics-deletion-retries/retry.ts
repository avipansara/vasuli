/** Pure helpers for the service-side analytics deletion retry worker. */

export const DEFAULT_BATCH_SIZE = 25;
export const MAX_BATCH_SIZE = 100;

export function parseBatchSize(raw: string | undefined): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(value, MAX_BATCH_SIZE);
}

export function posthogDeleteUrl(host: string, projectId: string): string {
  return `${host.replace(/\/$/, '')}/api/projects/${encodeURIComponent(projectId)}/persons/bulk_delete/`;
}
