import type { User } from '@/types/database';
import { describe, expect, it } from 'vitest';
import { getGroupExpenseParticipant } from './group-expense-participants';

const user = (id: string, name: string): User => ({
  id,
  name,
  isActive: true,
  createdAt: 0,
});

describe('getGroupExpenseParticipant', () => {
  it('resolves a group member even when they are not a friend', () => {
    const groupMember = user('member-c', 'C');

    expect(getGroupExpenseParticipant('member-c', [groupMember], [])).toEqual(groupMember);
  });

  it('falls back to the friend list for friend expenses', () => {
    const friend = user('friend-b', 'B');

    expect(getGroupExpenseParticipant('friend-b', [], [friend])).toEqual(friend);
  });
});
