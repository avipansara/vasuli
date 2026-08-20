import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendDetailData, FriendGroupBalanceSummary } from '@/services/friend-detail-service';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}));

import { createFriendDetailModule } from '@/services/friend-detail-module';
import { friendSummaryService } from '@/services/friend-summary-service';
import { refreshFriendRelationshipSurfaces } from '@/services/friend-relationship-invalidation';
import type { Expense, User } from '@/types/database';

const currentUserId = 'current-user';
const friendId = 'friend-1';

type FixtureState = {
  directBalance: number;
  directCurrency?: string;
  groupBalances: FriendGroupBalanceSummary[];
};

const friend: User = {
  id: friendId,
  name: 'Sam',
  isActive: true,
  createdAt: 1,
};

const directExpense: Expense = {
  id: 'expense-1',
  description: 'Dinner',
  amount: 100,
  currency: 'USD',
  paidBy: currentUserId,
  date: 1,
  createdAt: 1,
  updatedAt: 1,
};

function makeState(overrides: Partial<FixtureState> = {}): FixtureState {
  return {
    directBalance: 100,
    directCurrency: 'USD',
    groupBalances: [],
    ...overrides,
  };
}

function makeHomeRow(state: FixtureState) {
  const total = state.directBalance + state.groupBalances.reduce((sum, item) => sum + item.amount, 0);
  return {
    id: friendId,
    name: friend.name,
    email: null,
    phone: null,
    avatar: null,
    push_token: null,
    is_active: true,
    created_at: '1970-01-01T00:00:00.001Z',
    balance: total,
    relationship: {
      directBalance: state.directBalance,
      directCurrency: state.directCurrency,
      groupBalances: state.groupBalances,
      activity: [],
      totalsByCurrency: [{
        currency: 'USD',
        amount: total,
        direction: total > 0 ? 'you_are_owed' : total < 0 ? 'you_owe' : 'settled',
      }],
      settleableTotal: total === 0 ? undefined : {
        currency: 'USD',
        amount: total,
        direction: total > 0 ? 'you_are_owed' : 'you_owe',
      },
    },
    recent_expenses: [],
  };
}

function makeDetail(state: FixtureState): FriendDetailData {
  return {
    friend: { ...friend, balance: state.directBalance },
    expenses: state.directBalance === 0 ? [] : [directExpense],
    activity: [],
    groupBalances: state.groupBalances,
    relationship: {
      directBalance: state.directBalance,
      directCurrency: state.directCurrency,
      groupBalances: state.groupBalances,
      activity: [],
      totalsByCurrency: [],
    },
  };
}

describe('relationship cross-surface freshness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refreshes Home, Friend detail, and settle-up after ledger and membership events', async () => {
    let state = makeState();
    const queryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    mocks.rpc.mockImplementation(async () => ({ data: [makeHomeRow(state)], error: null }));

    const detailModule = createFriendDetailModule({
      readAdapter: { getDetail: async () => makeDetail(state) },
      groupBalanceAdapter: { getSharedGroupBalances: async () => state.groupBalances },
      relationshipAdapter: {
        getRelationship: async () => (await friendSummaryService.getHomeSummaries(currentUserId))[0].relationship,
      },
    });

    const readSurfaces = async () => {
      const [home, detail] = await Promise.all([
        friendSummaryService.getHomeSummaries(currentUserId),
        detailModule.getDetail(currentUserId, friendId),
      ]);
      return {
        home: home[0].relationship.settleableTotal?.amount ?? 0,
        detail: detail?.relationship.settleableTotal?.amount ?? 0,
        settle: detail?.relationship.settleableTotal?.amount ?? 0,
      };
    };

    const applyRemoteEvent = async (nextState: FixtureState) => {
      state = nextState;
      await refreshFriendRelationshipSurfaces(
        queryClient,
        currentUserId,
        friendId,
        async () => undefined,
      );
      const surfaces = await readSurfaces();
      expect(surfaces.home).toBe(surfaces.detail);
      expect(surfaces.detail).toBe(surfaces.settle);
      return surfaces.home;
    };

    expect(await readSurfaces()).toMatchObject({ home: 100, detail: 100, settle: 100 });
    expect(await applyRemoteEvent(makeState({ directBalance: 140 }))).toBe(140); // expense
    expect(await applyRemoteEvent(makeState({ directBalance: 60 }))).toBe(60); // edit
    expect(await applyRemoteEvent(makeState({ directBalance: 0 }))).toBe(0); // delete
    expect(await applyRemoteEvent(makeState({
      directBalance: 0,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: -25,
        direction: 'you_owe',
      }],
    }))).toBe(-25); // membership / Group projection
    expect(await applyRemoteEvent(makeState({
      directBalance: 0,
      groupBalances: [{
        groupId: 'group-1',
        groupName: 'Trip',
        currency: 'USD',
        amount: 0,
        direction: 'settled',
      }],
    }))).toBe(0); // settlement from another device

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(10);
  });
});
