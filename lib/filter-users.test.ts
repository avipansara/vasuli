import { describe, expect, it } from 'vitest';
import { filterUsers } from './filter-users';

const users = [
  { id: '1', name: 'Alex Johnson', email: 'alex@example.com', isActive: true, createdAt: 0 },
  { id: '2', name: 'Priya Shah', email: 'priya@example.com', isActive: true, createdAt: 0 },
];

describe('filterUsers', () => {
  it('returns all users for an empty query', () => {
    expect(filterUsers(users, '  ')).toEqual(users);
  });

  it('matches names and email addresses case-insensitively', () => {
    expect(filterUsers(users, 'PRIYA').map(user => user.id)).toEqual(['2']);
    expect(filterUsers(users, 'alex@example').map(user => user.id)).toEqual(['1']);
  });
});
