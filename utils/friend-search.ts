import type { User } from '@/types/database';
import { getVisibleEmail } from '@/utils/validation';

type SearchableFriend = Pick<User, 'email' | 'name'>;

export function filterFriendsForExpenseSearch<T extends SearchableFriend>(
  friends: T[],
  query: string
): T[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return friends;
  }

  return friends.filter(friend => {
    const visibleEmail = getVisibleEmail(friend.email) ?? '';
    const searchableText = `${friend.name} ${visibleEmail}`.toLowerCase();
    return terms.every(term => searchableText.includes(term));
  });
}
