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
import { friendSummaryService } from '@/services/friend-summary-service';

describe('Friends home read model', () => {
  it('loads and maps the authenticated RPC projection into FriendSummary data', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'friend-1',
          name: 'Asha',
          email: 'asha@example.com',
          phone: null,
          avatar: null,
          push_token: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
          balance: 25,
          recent_expenses: [
            {
              id: 'expense-1',
              group_id: null,
              description: 'Dinner',
              amount: 25,
              currency: 'USD',
              paid_by: 'current-user',
              created_by: 'current-user',
              category: null,
              date: '2026-01-02T00:00:00.000Z',
              image_url: null,
              notes: null,
              created_at: '2026-01-02T00:00:00.000Z',
              updated_at: '2026-01-02T00:00:00.000Z',
            },
          ],
        },
      ],
      error: null,
    });

    const result = await friendSummaryService.getHomeSummaries('current-user');

    expect(mocks.rpc).toHaveBeenCalledWith('get_friend_home_summaries');
    expect(result).toEqual([
      {
        id: 'friend-1',
        name: 'Asha',
        email: 'asha@example.com',
        phone: undefined,
        avatar: undefined,
        pushToken: undefined,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z').getTime(),
        balance: 25,
        recentExpenses: [
          {
            id: 'expense-1',
            groupId: undefined,
            description: 'Dinner',
            amount: 25,
            currency: 'USD',
            paidBy: 'current-user',
            createdBy: 'current-user',
            category: undefined,
            date: new Date('2026-01-02T00:00:00.000Z').getTime(),
            imageUrl: undefined,
            notes: undefined,
            createdAt: new Date('2026-01-02T00:00:00.000Z').getTime(),
            updatedAt: new Date('2026-01-02T00:00:00.000Z').getTime(),
          },
        ],
      },
    ]);
  });
});
