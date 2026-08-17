import { describe, expect, it, vi } from 'vitest';

import { createAppUpdateService } from '@/services/app-update-service';

describe('app update release service', () => {
  it('returns the active release for the requested platform', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'release-1-0-18',
        version: '1.0.18',
        minimum_supported_version: '1.0.0',
        store_url: 'https://apps.apple.com/app/vasuli/id123',
        title: 'A smoother split',
        notes: ['Faster group balances'],
      },
      error: null,
    });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };

    const service = createAppUpdateService({
      supabase: { from: vi.fn().mockReturnValue(query) },
    });

    await expect(service.getActiveRelease('ios')).resolves.toEqual({
      id: 'release-1-0-18',
      version: '1.0.18',
      minimumSupportedVersion: '1.0.0',
      storeUrl: 'https://apps.apple.com/app/vasuli/id123',
      title: 'A smoother split',
      notes: ['Faster group balances'],
    });
  });
});
