import { afterEach, describe, expect, it, vi } from 'vitest';

// Detox helpers are CommonJS because Jest executes them directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { launchAppWithRetry } = require('../e2e/helpers/auth') as {
  launchAppWithRetry: (config: Record<string, unknown>) => Promise<void>;
};

describe('Detox authentication launch helper', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries one transient simulator launch failure with the same configuration', async () => {
    vi.useFakeTimers();
    const launchApp = vi.fn()
      .mockRejectedValueOnce(new Error('FBSOpenApplicationServiceErrorDomain code=4'))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal('device', { launchApp });
    const config = { delete: true, newInstance: true, permissions: { notifications: 'NO' } };

    const launch = launchAppWithRetry(config);
    await vi.advanceTimersByTimeAsync(1000);
    await launch;

    expect(launchApp).toHaveBeenCalledTimes(2);
    expect(launchApp).toHaveBeenNthCalledWith(1, config);
    expect(launchApp).toHaveBeenNthCalledWith(2, config);
  });

  it('preserves the second launch error when both attempts fail', async () => {
    vi.useFakeTimers();
    const finalError = new Error('second launch failed');
    const launchApp = vi.fn()
      .mockRejectedValueOnce(new Error('first launch failed'))
      .mockRejectedValueOnce(finalError);
    vi.stubGlobal('device', { launchApp });

    const launch = launchAppWithRetry({ newInstance: true });
    const rejection = expect(launch).rejects.toBe(finalError);
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;

    expect(launchApp).toHaveBeenCalledTimes(2);
  });
});
