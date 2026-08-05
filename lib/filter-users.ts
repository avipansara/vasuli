import type { User } from '@/types/database';

export function filterUsers(users: User[], query: string): User[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return users;

  return users.filter(user =>
    [user.name, user.email, user.phone]
      .filter(Boolean)
      .some(value => value!.toLocaleLowerCase().includes(normalizedQuery))
  );
}
