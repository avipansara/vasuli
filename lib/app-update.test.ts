import { describe, expect, it } from 'vitest';

import { getAppUpdateDecision } from '@/lib/app-update';

describe('app update decision', () => {
  it('offers an optional store update with release notes when a newer version is available', () => {
    expect(getAppUpdateDecision({
      installedVersion: '1.0.17',
      release: {
        id: 'release-1-0-18',
        version: '1.0.18',
        minimumSupportedVersion: '1.0.0',
        storeUrl: 'https://apps.apple.com/app/vasuli/id123',
        title: 'A smoother split',
        notes: ['Faster group balances', 'Improved expense search'],
      },
    })).toEqual({
      kind: 'optional',
      releaseId: 'release-1-0-18',
      version: '1.0.18',
      storeUrl: 'https://apps.apple.com/app/vasuli/id123',
      title: 'A smoother split',
      notes: ['Faster group balances', 'Improved expense search'],
    });
  });

  it('ignores a release with an invalid version instead of prompting', () => {
    expect(getAppUpdateDecision({
      installedVersion: '1.0.17',
      release: {
        id: 'release-invalid',
        version: 'not-a-version',
        minimumSupportedVersion: '1.0.0',
        storeUrl: 'https://play.google.com/store/apps/details?id=vasuli',
        title: 'Invalid release',
        notes: [],
      },
    })).toEqual({ kind: 'current' });
  });

  it('ignores a release without a usable store link', () => {
    expect(getAppUpdateDecision({
      installedVersion: '1.0.17',
      release: {
        id: 'release-no-link',
        version: '1.0.18',
        minimumSupportedVersion: '1.0.0',
        storeUrl: '',
        title: 'Missing link',
        notes: ['A change'],
      },
    })).toEqual({ kind: 'current' });
  });
});
