let nextGroupDetailTraceId = 0;

export function createGroupDetailTraceId(): string {
  nextGroupDetailTraceId += 1;
  return `group-detail-${Date.now()}-${nextGroupDetailTraceId}`;
}

export function logGroupDetailDiagnostic(
  event: string,
  details: Record<string, unknown>,
  level: 'log' | 'warn' | 'error' = 'log',
): void {
  if (!__DEV__) return;
  console[level](`[GroupDetail][${event}]`, details);
}
