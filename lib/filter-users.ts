import type { User } from '@/types/database';
import { getVisibleEmail } from '@/utils/validation';

export function filterUsers(users: User[], query: string): User[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return users;

  return users.filter(user =>
    [user.name, getVisibleEmail(user.email), user.phone]
      .filter(Boolean)
      .some(value => value!.toLocaleLowerCase().includes(normalizedQuery))
  );
}
