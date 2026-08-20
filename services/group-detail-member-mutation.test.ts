import { describe, expect, it, vi } from 'vitest';
import type { GroupMember, User } from '@/types/database';
import {
  createGroupDetailMemberMutation,
  type GroupDetailMemberMutationDependencies,
} from './group-detail-member-mutation';

vi.mock('@/services/notification-service', () => ({
  createMemberAddedNotification: vi.fn(),
  notificationService: { sendPushNotification: vi.fn() },
}));

const actor: User = { id: 'user-a', name: 'Alex', isActive: true, createdAt: 1 };
const member: User = { id: 'user-b', name: 'Blair', isActive: true, createdAt: 1, pushToken: 'token' };
const groupMember: GroupMember & { user: User } = {
  id: 'member-b', groupId: 'group-1', userId: member.id, role: 'member', joinedAt: 1, user: member,
};

function createDependencies(): GroupDetailMemberMutationDependencies {
  return {
    addMember: vi.fn(async () => groupMember),
    removeMember: vi.fn(async () => undefined),
    createFriendship: vi.fn(async () => ({ id: 'friendship-1', userId: actor.id, friendId: member.id, status: 'pending' as const, createdAt: 1 })),
    logMemberAdded: vi.fn(async () => undefined),
    logMemberRemoved: vi.fn(async () => undefined),
    getUsersByIds: vi.fn(async () => [member]),
    sendMemberAddedNotification: vi.fn(async () => undefined),
    createMemberAddedNotification: vi.fn(() => ({ type: 'member_added' as const, title: 'Added', body: 'Added' })),
  } as unknown as GroupDetailMemberMutationDependencies;
}

describe('Group detail member mutation', () => {
  it('adds members and isolates Activity and notification failures', async () => {
    const dependencies = createDependencies();
    (dependencies.logMemberAdded as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('activity failed'));
    (dependencies.sendMemberAddedNotification as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('push failed'));
    const mutation = createGroupDetailMemberMutation(dependencies);

    await expect(mutation.addMembers({
      groupId: 'group-1', groupName: 'Trip', currentUser: actor, memberIds: [member.id], users: [member],
      groupDetailKey: ['group'], cache: { invalidate: vi.fn(async () => undefined) },
    })).resolves.toBeUndefined();

    expect(dependencies.addMember).toHaveBeenCalledWith('group-1', member.id);
    expect(dependencies.getUsersByIds).toHaveBeenCalledWith([member.id]);
    expect(dependencies.logMemberAdded).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'group-1',
      memberName: member.name,
    }));
    expect(dependencies.sendMemberAddedNotification).toHaveBeenCalledWith(member.pushToken, expect.anything());
  });

  it('removes a member after the persistence guard accepts a settled balance', async () => {
    const dependencies = createDependencies();
    const mutation = createGroupDetailMemberMutation(dependencies);

    await expect(mutation.removeMember({
      groupId: 'group-1', groupName: 'Trip', currentUser: actor, member: groupMember,
      groupDetailKey: ['group'], cache: { invalidate: vi.fn(async () => undefined) },
    })).resolves.toBeUndefined();

    expect(dependencies.removeMember).toHaveBeenCalledWith('group-1', member.id);
    expect(dependencies.logMemberRemoved).toHaveBeenCalledWith(expect.objectContaining({ memberName: member.name }));
  });

  it('does not log removal until persistence succeeds', async () => {
    const dependencies = createDependencies();
    (dependencies.removeMember as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('outstanding balance'));
    const mutation = createGroupDetailMemberMutation(dependencies);

    await expect(mutation.removeMember({
      groupId: 'group-1', groupName: 'Trip', currentUser: actor, member: groupMember,
      groupDetailKey: ['group'], cache: { invalidate: vi.fn(async () => undefined) },
    })).rejects.toThrow('outstanding balance');

    expect(dependencies.logMemberRemoved).not.toHaveBeenCalled();
  });

  it('compensates members already added when a later member insert fails', async () => {
    const dependencies = createDependencies();
    const addMember = dependencies.addMember as unknown as ReturnType<typeof vi.fn>;
    addMember
      .mockResolvedValueOnce(groupMember)
      .mockRejectedValueOnce(new Error('second insert failed'));
    const mutation = createGroupDetailMemberMutation(dependencies);

    await expect(mutation.addMembers({
      groupId: 'group-1', groupName: 'Trip', currentUser: actor,
      memberIds: ['user-b', 'user-c'], users: [member],
      groupDetailKey: ['group'], cache: { invalidate: vi.fn(async () => undefined) },
    })).rejects.toThrow('second insert failed');

    expect(dependencies.removeMember).toHaveBeenCalledWith('group-1', 'user-b');
    expect(dependencies.logMemberAdded).not.toHaveBeenCalled();
  });

  it('updates Friendship state only after request persistence succeeds', async () => {
    const dependencies = createDependencies();
    const current = { friendshipStatus: new Map([['user-b', 'none' as const]]) };
    const values = new Map<string, unknown>([['group', current]]);
    const cache = {
      set: vi.fn((_key: readonly unknown[], updater: (value: typeof current | undefined) => typeof current) => {
        values.set('group', updater(current));
      }),
    } as Pick<import('./query-cache-adapter').QueryCacheAdapter, 'set'>;
    const mutation = createGroupDetailMemberMutation(dependencies);

    await mutation.sendFriendRequest({ currentUserId: actor.id, friendId: member.id, groupDetailKey: ['group'], cache });

    expect(dependencies.createFriendship).toHaveBeenCalledWith(actor.id, member.id);
    expect((values.get('group') as typeof current).friendshipStatus.get(member.id)).toBe('pending_sent');
  });

  it('does not update Friendship state when request persistence fails', async () => {
    const dependencies = createDependencies();
    (dependencies.createFriendship as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('friend request rejected'));
    const set = vi.fn();
    const mutation = createGroupDetailMemberMutation(dependencies);

    await expect(mutation.sendFriendRequest({
      currentUserId: actor.id,
      friendId: member.id,
      groupDetailKey: ['group'],
      cache: { set } as never,
    })).rejects.toThrow('friend request rejected');

    expect(set).not.toHaveBeenCalled();
  });
});
