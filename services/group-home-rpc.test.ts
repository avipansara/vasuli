import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
  },
}));

// The mocked Supabase boundary must be registered before importing the service.
// eslint-disable-next-line import/first
import { groupService } from '@/services/group-service';

describe('Groups home read model', () => {
  it('loads and maps the authenticated RPC projection into GroupWithMembers data', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'group-1',
          name: 'Trip to Austin',
          description: 'Weekend trip',
          image_url: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
          your_balance: -42.5,
        },
      ],
      error: null,
    });

    const result = await groupService.getHomeSummaries('current-user');

    expect(mocks.rpc).toHaveBeenCalledWith('get_groups_home_summaries');
    expect(result).toEqual([
      {
        id: 'group-1',
        name: 'Trip to Austin',
        description: 'Weekend trip',
        imageUrl: undefined,
        createdAt: new Date('2026-01-01T00:00:00.000Z').getTime(),
        updatedAt: new Date('2026-01-02T00:00:00.000Z').getTime(),
        yourBalance: -42.5,
      },
    ]);
  });
});
