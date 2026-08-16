type StartupDetails = Record<string, boolean | number | string | undefined>;

const launchStartedAt = Date.now();

function isDevelopmentBuild() {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
}

export function markStartup(name: string, details?: StartupDetails) {
  if (!isDevelopmentBuild()) return;

  const elapsedMs = Date.now() - launchStartedAt;
  console.log(`[Startup] ${name} +${elapsedMs}ms`, details ?? '');
}

export async function measureStartup<T>(
  name: string,
  work: () => Promise<T>,
  details?: StartupDetails,
): Promise<T> {
  const startedAt = Date.now();
  markStartup(`${name}.start`, details);

  try {
    const result = await work();
    markStartup(`${name}.complete`, { ...details, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    markStartup(`${name}.error`, {
      ...details,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}
