import { describe, expect, it } from 'vitest';

import { checkForAppUpdate } from '@/services/app-update-coordinator';

describe('app update coordinator', () => {
  it('returns the current decision when no active release exists', async () => {
    await expect(checkForAppUpdate({
      installedVersion: '1.0.17',
      platform: 'ios',
      getActiveRelease: async () => null,
    })).resolves.toEqual({ kind: 'current' });
  });
});
