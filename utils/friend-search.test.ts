import { describe, expect, it } from 'vitest';

import { filterFriendsForExpenseSearch } from './friend-search';

const friends = [
  { name: 'Asha Patel', email: 'asha@example.com' },
  { name: 'Ben Rivera', email: 'ben.rivera@example.com' },
  { name: 'Casey Morgan' },
];

describe('filterFriendsForExpenseSearch', () => {
  it('returns all friends when the query is blank', () => {
    expect(filterFriendsForExpenseSearch(friends, '   ')).toEqual(friends);
  });

  it('matches friends by name or email without case sensitivity', () => {
    expect(filterFriendsForExpenseSearch(friends, 'RIVERA')).toEqual([friends[1]]);
    expect(filterFriendsForExpenseSearch(friends, 'asha@example')).toEqual([friends[0]]);
  });

  it('requires every search term to match the same friend', () => {
    expect(filterFriendsForExpenseSearch(friends, 'ben example')).toEqual([friends[1]]);
    expect(filterFriendsForExpenseSearch(friends, 'ben asha')).toEqual([]);
  });
});
