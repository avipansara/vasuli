import { describe, expect, it, vi } from 'vitest';
import { createGroupDetailGroupMutation } from './group-detail-group-mutation';

describe('Group detail Group mutation', () => {
  it('blocks deletion when a Group has an outstanding Balance', async () => {
    const deleteGroup = vi.fn(async () => undefined);
    const mutation = createGroupDetailGroupMutation({ deleteGroup });
    const cache = { invalidate: vi.fn(async () => undefined) };

    await expect(mutation.deleteGroup({
      groupId: 'group-1', currentUserId: 'user-a', balances: new Map([['user-b', 10]]),
      groupDetailKey: ['group'], groupListKey: ['groups'], cache,
    })).resolves.toEqual({ status: 'blocked' });

    expect(deleteGroup).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it('soft-deletes a settled Group and refreshes active Group surfaces', async () => {
    const deleteGroup = vi.fn(async () => undefined);
    const mutation = createGroupDetailGroupMutation({ deleteGroup });
    const cache = { invalidate: vi.fn(async () => undefined) };

    await expect(mutation.deleteGroup({
      groupId: 'group-1', currentUserId: 'user-a', balances: new Map([['user-b', 0]]),
      groupDetailKey: ['group'], groupListKey: ['groups'], cache,
    })).resolves.toEqual({ status: 'deleted' });

    expect(deleteGroup).toHaveBeenCalledWith('group-1', 'user-a');
    expect(cache.invalidate).toHaveBeenCalledWith(['group']);
    expect(cache.invalidate).toHaveBeenCalledWith(['groups']);
  });

  it('does not refresh caches when persistence fails', async () => {
    const deleteGroup = vi.fn(async () => { throw new Error('delete failed'); });
    const mutation = createGroupDetailGroupMutation({ deleteGroup });
    const cache = { invalidate: vi.fn(async () => undefined) };

    await expect(mutation.deleteGroup({
      groupId: 'group-1', currentUserId: 'user-a', balances: new Map([['user-b', 0]]),
      groupDetailKey: ['group'], groupListKey: ['groups'], cache,
    })).rejects.toThrow('delete failed');

    expect(cache.invalidate).not.toHaveBeenCalled();
  });
});
