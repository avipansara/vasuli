import type { User } from '@/types/database';

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
    const searchableText = `${friend.name} ${friend.email ?? ''}`.toLowerCase();
    return terms.every(term => searchableText.includes(term));
  });
}
