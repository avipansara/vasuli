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
import { projectFriendRelationship } from '@/services/friend-detail-service';
import { createFriendDetailModule } from '@/services/friend-detail-module';

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
          relationship: {
            directBalance: 25,
            directCurrency: 'USD',
            groupBalances: [],
            activity: [],
            totalsByCurrency: [{ currency: 'USD', amount: 25, direction: 'you_are_owed' }],
            settleableTotal: { currency: 'USD', amount: 25, direction: 'you_are_owed' },
          },
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

    expect(mocks.rpc).toHaveBeenCalledWith('get_friend_home_relationships');
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
        relationship: {
          directBalance: 25,
          directCurrency: 'USD',
          groupBalances: [],
          activity: [],
          totalsByCurrency: [{ currency: 'USD', amount: 25, direction: 'you_are_owed' }],
          settleableTotal: { currency: 'USD', amount: 25, direction: 'you_are_owed' },
        },
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

  it('preserves the authoritative Home projection when direct and Group scopes combine', async () => {
    const friend = {
      id: 'friend-2',
      name: 'Dev',
      isActive: true,
      createdAt: 1,
      balance: 1449.12,
    };
    const expenses = [{
      id: 'direct-expense',
      description: 'Dinner',
      amount: 1449.12,
      currency: 'USD',
      paidBy: 'current-user',
      date: 1,
      createdAt: 1,
      updatedAt: 1,
    }];
    const groupBalances = [{
      groupId: 'group-1',
      groupName: 'Trip',
      currency: 'USD',
      amount: -467.5,
      direction: 'you_owe',
    }];
    const relationship = projectFriendRelationship({ friend, expenses, activity: [], groupBalances });

    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'friend-2',
          name: 'Dev',
          email: null,
          phone: null,
          avatar: null,
          push_token: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
          // The fixture mirrors the architecture review: a $1,449.12 direct
          // balance offset by a -$467.50 Group balance leaves $981.62 owed.
          balance: 981.62,
          relationship,
          recent_expenses: [],
        },
      ],
      error: null,
    });

    const [summary] = await friendSummaryService.getHomeSummaries('current-user');
    const friendDetail = await createFriendDetailModule({
      readAdapter: {
        getDetail: async () => ({ friend, expenses, activity: [], groupBalances, relationship }),
      },
      groupBalanceAdapter: {
        getSharedGroupBalances: async () => groupBalances,
      },
    }).getDetail('current-user', 'friend-2');

    expect(summary.balance).toBe(981.62);
    expect(summary.relationship).toEqual(relationship);
    expect(friendDetail?.relationship).toEqual(summary.relationship);
  });

  it('does not turn incompatible currencies into a scalar Home balance', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        id: 'friend-3',
        name: 'Mina',
        email: null,
        phone: null,
        avatar: null,
        push_token: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        balance: 0,
        relationship: {
          directBalance: 0,
          groupBalances: [{
            groupId: 'group-eur',
            groupName: 'Europe',
            currency: 'EUR',
            amount: -80,
            direction: 'you_owe',
          }],
          activity: [],
          totalsByCurrency: [
            { currency: 'EUR', amount: -80, direction: 'you_owe' },
            { currency: 'USD', amount: 100, direction: 'you_are_owed' },
          ],
        },
        recent_expenses: [],
      }],
      error: null,
    });

    const [summary] = await friendSummaryService.getHomeSummaries('current-user');

    expect(summary.balance).toBe(0);
    expect(summary.relationship?.totalsByCurrency).toHaveLength(2);
    expect(summary.relationship?.settleableTotal).toBeUndefined();
  });
});
