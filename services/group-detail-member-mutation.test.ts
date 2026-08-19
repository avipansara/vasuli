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
  } as GroupDetailMemberMutationDependencies;
}

describe('Group detail member mutation', () => {
  it('adds members and isolates Activity and notification failures', async () => {
    const dependencies = createDependencies();
    dependencies.logMemberAdded.mockRejectedValueOnce(new Error('activity failed'));
    dependencies.sendMemberAddedNotification.mockRejectedValueOnce(new Error('push failed'));
    const mutation = createGroupDetailMemberMutation(dependencies);

    await expect(mutation.addMembers({
      groupId: 'group-1', groupName: 'Trip', currentUser: actor, memberIds: [member.id], users: [member],
    })).resolves.toBeUndefined();

    expect(dependencies.addMember).toHaveBeenCalledWith('group-1', member.id);
    expect(dependencies.getUsersByIds).toHaveBeenCalledWith([member.id]);
  });

  it('does not log removal until persistence succeeds', async () => {
    const dependencies = createDependencies();
    dependencies.removeMember.mockRejectedValueOnce(new Error('outstanding balance'));
    const mutation = createGroupDetailMemberMutation(dependencies);

    await expect(mutation.removeMember({
      groupId: 'group-1', groupName: 'Trip', currentUser: actor, member: groupMember,
    })).rejects.toThrow('outstanding balance');

    expect(dependencies.logMemberRemoved).not.toHaveBeenCalled();
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
});
