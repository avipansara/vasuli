import { describe, expect, it } from 'vitest';
import { getPendingInvitationCount } from './invitation-count';

describe('getPendingInvitationCount', () => {
  it('combines pending friend requests and email invitations', () => {
    expect(getPendingInvitationCount(2, 3)).toBe(5);
  });

  it('returns zero when there are no pending invitations', () => {
    expect(getPendingInvitationCount(0, 0)).toBe(0);
  });
});
