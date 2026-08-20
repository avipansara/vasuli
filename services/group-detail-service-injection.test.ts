import { describe, expect, it, vi } from 'vitest';
import { createGroupDetailService, type GroupDetailDataSource } from './group-detail-service';

describe('group detail service composition', () => {
  it('accepts an independently substitutable data source', async () => {
    const group = { id: 'group-1', name: 'Trip', createdAt: 1, updatedAt: 1 };
    const dataSource: GroupDetailDataSource = {
      getGroup: vi.fn().mockResolvedValue(group),
      getExpenses: vi.fn().mockResolvedValue([]),
      getMembers: vi.fn().mockResolvedValue([]),
      getSettlements: vi.fn().mockResolvedValue([]),
      getUserFriends: vi.fn().mockResolvedValue([]),
      getFriendships: vi.fn().mockResolvedValue([]),
      getUsers: vi.fn().mockResolvedValue([]),
      getSplits: vi.fn().mockResolvedValue([]),
    };

    const service = createGroupDetailService(dataSource);
    const result = await service.getDetail('user-1', 'group-1');

    expect(result?.group).toEqual(group);
    expect(dataSource.getGroup).toHaveBeenCalledWith('group-1');
    expect(dataSource.getExpenses).toHaveBeenCalledWith('group-1');
  });

  it('recovers when the group is temporarily unavailable on the first read', async () => {
    const group = { id: 'group-1', name: 'Trip', createdAt: 1, updatedAt: 1 };
    const dataSource: GroupDetailDataSource = {
      getGroup: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(group),
      getExpenses: vi.fn().mockResolvedValue([]),
      getMembers: vi.fn().mockResolvedValue([]),
      getSettlements: vi.fn().mockResolvedValue([]),
      getUserFriends: vi.fn().mockResolvedValue([]),
      getFriendships: vi.fn().mockResolvedValue([]),
      getUsers: vi.fn().mockResolvedValue([]),
      getSplits: vi.fn().mockResolvedValue([]),
    };

    const service = createGroupDetailService(dataSource);

    await expect(service.getDetail('user-1', 'group-1', 'trace-1')).resolves.toMatchObject({
      group,
    });
    expect(dataSource.getGroup).toHaveBeenCalledTimes(2);
    expect(dataSource.getGroup).toHaveBeenNthCalledWith(1, 'group-1', 'trace-1');
    expect(dataSource.getGroup).toHaveBeenNthCalledWith(2, 'group-1', 'trace-1');
  });
});
