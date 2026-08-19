import type { GroupDetailReadModel } from './group-detail-read-model';
import { activityService } from './activity-service';
import { friendshipService } from './friendship-service';
import { groupService } from './group-service';
import {
  createMemberAddedNotification,
  notificationService,
} from './notification-service';
import type { QueryCacheAdapter, QueryCacheKey } from './query-cache-adapter';
import { userService } from './user-service';
import type { GroupMember, User } from '@/types/database';

export type GroupDetailMemberMutationDependencies = {
  addMember: typeof groupService.addMember;
  removeMember: typeof groupService.removeMember;
  createFriendship: typeof friendshipService.create;
  logMemberAdded: typeof activityService.logMemberAdded;
  logMemberRemoved: typeof activityService.logMemberRemoved;
  getUsersByIds: typeof userService.getByIds;
  sendMemberAddedNotification: typeof notificationService.sendPushNotification;
  createMemberAddedNotification: typeof createMemberAddedNotification;
};

const defaultDependencies: GroupDetailMemberMutationDependencies = {
  addMember: groupService.addMember,
  removeMember: groupService.removeMember,
  createFriendship: friendshipService.create,
  logMemberAdded: activityService.logMemberAdded,
  logMemberRemoved: activityService.logMemberRemoved,
  getUsersByIds: userService.getByIds,
  sendMemberAddedNotification: notificationService.sendPushNotification,
  createMemberAddedNotification,
};

type MemberMutationContext = {
  groupId: string;
  groupName: string;
  currentUser: Pick<User, 'id' | 'name'>;
};

export function createGroupDetailMemberMutation(
  dependencies: GroupDetailMemberMutationDependencies = defaultDependencies,
) {
  return {
    async addMembers(
      context: MemberMutationContext & {
        memberIds: string[];
        users: User[];
      },
    ): Promise<void> {
      await Promise.all(context.memberIds.map(memberId => dependencies.addMember(context.groupId, memberId)));

      await Promise.all(context.memberIds.map(async memberId => {
        const member = context.users.find(user => user.id === memberId);
        await safelyRunSideEffect(
          () => dependencies.logMemberAdded({
            groupId: context.groupId,
            userId: context.currentUser.id,
            userName: context.currentUser.name,
            memberName: member?.name || 'Someone',
            groupName: context.groupName,
          }),
          'Group member Activity logging failed after membership add:',
        );
      }));

      await safelyNotifyAddedMembers(context, dependencies);
    },

    async removeMember(
      context: MemberMutationContext & { member: GroupMember & { user?: User } },
    ): Promise<void> {
      await dependencies.removeMember(context.groupId, context.member.userId);
      await safelyRunSideEffect(
        () => dependencies.logMemberRemoved({
          groupId: context.groupId,
          userId: context.currentUser.id,
          userName: context.currentUser.name,
          memberName: context.member.user?.name || 'Someone',
          groupName: context.groupName,
        }),
        'Group member Activity logging failed after membership removal:',
      );
    },

    async sendFriendRequest(params: {
      currentUserId: string;
      friendId: string;
      groupDetailKey: QueryCacheKey;
      cache: Pick<QueryCacheAdapter, 'set'>;
    }): Promise<void> {
      await dependencies.createFriendship(params.currentUserId, params.friendId);
      params.cache.set<GroupDetailReadModel | null>(params.groupDetailKey, current => {
        if (!current) return null;
        const friendshipStatus = new Map(current.friendshipStatus);
        friendshipStatus.set(params.friendId, 'pending_sent');
        return { ...current, friendshipStatus };
      });
    },
  };
}

async function safelyNotifyAddedMembers(
  context: MemberMutationContext & { memberIds: string[]; users: User[] },
  dependencies: GroupDetailMemberMutationDependencies,
): Promise<void> {
  try {
    const usersToNotify = await dependencies.getUsersByIds(context.memberIds);
    await Promise.all(
      usersToNotify
        .filter((member): member is User => Boolean(member.pushToken))
        .map(member => dependencies.sendMemberAddedNotification(
          member.pushToken!,
          dependencies.createMemberAddedNotification(
            context.groupName,
            context.currentUser.name,
            member.name,
            context.groupId,
          ),
        )),
    );
  } catch (error) {
    console.error('Group member notification failed after membership add:', error);
  }
}

async function safelyRunSideEffect(
  effect: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await effect();
  } catch (error) {
    console.error(message, error);
  }
}

export const groupDetailMemberMutation = createGroupDetailMemberMutation();
