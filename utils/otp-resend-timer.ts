export function createOtpResendDeadline(
  durationMs = 60_000,
  now = Date.now(),
): number {
  return now + durationMs;
}

export function getOtpResendSeconds(
  deadline: number | null,
  now = Date.now(),
): number {
  if (deadline === null) return 0;

  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
