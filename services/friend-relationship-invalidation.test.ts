import { describe, expect, it, vi } from 'vitest';
import {
  FRIEND_RELATIONSHIP_REALTIME_TABLES,
  getFriendRelationshipInvalidationKeys,
  invalidateFriendRelationshipSurfaces,
  refreshFriendRelationshipSurfaces,
} from '@/services/friend-relationship-invalidation';

describe('friend relationship freshness contract', () => {
  it('covers every persisted input that can change a relationship projection', () => {
    expect(FRIEND_RELATIONSHIP_REALTIME_TABLES).toEqual([
      'expenses',
      'expense_splits',
      'settlements',
      'settlement_scope_transfers',
      'groups',
      'group_members',
      'friendships',
    ]);
  });

  it('invalidates Home and one Friend detail together', async () => {
    const queryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };

    await invalidateFriendRelationshipSurfaces(queryClient, 'current-user', 'friend-1');

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['friends', 'home', 'current-user'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['friends', 'detail', 'current-user', 'friend-1'],
    });
  });

  it('invalidates every cached Friend detail when the affected Friend is unknown', () => {
    expect(getFriendRelationshipInvalidationKeys('current-user')).toEqual([
      ['friends', 'home', 'current-user'],
      ['friends', 'detail', 'current-user'],
    ]);
  });

  it('invalidates caches before refreshing the settle-up read', async () => {
    const queryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    const refresh = vi.fn().mockResolvedValue(undefined);

    await refreshFriendRelationshipSurfaces(queryClient, 'current-user', 'friend-1', refresh);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
