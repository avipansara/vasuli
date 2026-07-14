import { describe, expect, it } from 'vitest';
import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('rejects when an async operation does not finish in time', async () => {
    const pending = new Promise<void>(() => undefined);

    await expect(withTimeout(pending, 5, 'Startup timed out')).rejects.toThrow('Startup timed out');
  });

  it('returns the operation result and clears the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ready'), 50)).resolves.toBe('ready');
  });
});
