import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { createGroupDetailService, type GroupDetailDataSource } from './group-detail-service';

describe('group detail query lifecycle', () => {
  it('documents that React Query considers null successful and does not retry it', async () => {
    const queryFn = vi.fn().mockResolvedValue(null);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 2 } },
    });

    await expect(queryClient.fetchQuery({ queryKey: ['group-detail-null'], queryFn })).resolves.toBeNull();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryState(['group-detail-null'])?.status).toBe('success');
  });

  it('does not publish a transient missing result to the screen query observer', async () => {
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
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = new QueryObserver(queryClient, {
      queryKey: ['groups', 'detail', 'user-1', 'group-1'],
      queryFn: () => service.getDetail('user-1', 'group-1'),
    });
    const observedData: unknown[] = [];
    const unsubscribe = observer.subscribe(result => {
      if (result.data !== undefined) observedData.push(result.data);
    });

    try {
      const result = await observer.refetch();

      expect(result.data).toMatchObject({ group });
      expect(observedData).not.toContain(null);
    } finally {
      unsubscribe();
    }
  });
});
