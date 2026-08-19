import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupDetailService } from './group-detail-service';
import { expenseService } from './expense-service';
import { friendshipService } from './friendship-service';
import { groupService } from './group-service';
import { settlementService } from './settlement-service';
import { userService } from './user-service';
import { scopeTransferService } from './scope-transfer-service';

vi.mock('./expense-service', () => ({ expenseService: { getByGroup: vi.fn(), getSplitsForExpenses: vi.fn() } }));
vi.mock('./friendship-service', () => ({ friendshipService: { getAllFriendships: vi.fn() } }));
vi.mock('./group-service', () => ({ groupService: { getById: vi.fn(), getMembers: vi.fn() } }));
vi.mock('./settlement-service', () => ({ settlementService: { getByGroup: vi.fn() } }));
vi.mock('./user-service', () => ({ userService: { getUserFriends: vi.fn(), getByIds: vi.fn() } }));
vi.mock('./scope-transfer-service', () => ({ scopeTransferService: { getByGroup: vi.fn() } }));

describe('groupDetailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the group read model and returns nested relationship-resolved expenses', async () => {
    const group = { id: 'group-1', name: 'Trip', createdAt: 1, updatedAt: 1 };
    const members = [
      { id: 'member-a', groupId: group.id, userId: 'user-a', role: 'admin' as const, joinedAt: 1 },
      { id: 'member-b', groupId: group.id, userId: 'user-b', role: 'member' as const, joinedAt: 1 },
    ];
    const expenses = [{ id: 'expense-1', groupId: group.id, description: 'Dinner', amount: 30, currency: 'USD', paidBy: 'user-a', date: 1, createdAt: 1, updatedAt: 1 }];

    vi.mocked(groupService.getById).mockResolvedValue(group);
    vi.mocked(groupService.getMembers).mockResolvedValue(members);
    vi.mocked(expenseService.getByGroup).mockResolvedValue(expenses);
    vi.mocked(expenseService.getSplitsForExpenses).mockResolvedValue([
      { id: 'split-a', expenseId: 'expense-1', userId: 'user-a', amount: 15, splitType: 'equal' },
      { id: 'split-b', expenseId: 'expense-1', userId: 'user-b', amount: 15, splitType: 'equal' },
    ]);
    vi.mocked(settlementService.getByGroup).mockResolvedValue([]);
    vi.mocked(scopeTransferService.getByGroup).mockResolvedValue([]);
    vi.mocked(userService.getUserFriends).mockResolvedValue([]);
    vi.mocked(userService.getByIds).mockResolvedValue([
      { id: 'user-a', name: 'Alex', isActive: true, createdAt: 1 },
      { id: 'user-b', name: 'Blair', isActive: true, createdAt: 1 },
    ]);
    vi.mocked(friendshipService.getAllFriendships).mockResolvedValue([]);

    const model = await groupDetailService.getDetail('user-a', group.id);

    expect(model?.expenses[0]).toMatchObject({
      paidByUser: { name: 'Alex' },
      splits: [{ user: { name: 'Alex' } }, { user: { name: 'Blair' } }],
    });
    expect(expenseService.getSplitsForExpenses).toHaveBeenCalledWith(['expense-1']);
  });

  it('returns null without fetching related rows when the group is missing', async () => {
    vi.mocked(groupService.getById).mockResolvedValue(null);

    await expect(groupDetailService.getDetail('user-a', 'missing')).resolves.toBeNull();
    expect(groupService.getById).toHaveBeenCalledTimes(2);
    expect(expenseService.getByGroup).not.toHaveBeenCalled();
  });
});
