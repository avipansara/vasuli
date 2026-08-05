import type { User } from '@/types/database';

/** Resolve group participants from group membership before falling back to friends. */
export function getGroupExpenseParticipant(
  userId: string,
  groupMemberUsers: User[],
  friends: User[],
): User | undefined {
  return groupMemberUsers.find(user => user.id === userId) ?? friends.find(user => user.id === userId);
}
