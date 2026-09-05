import { describe, expect, it } from 'vitest';
import { getPairCaptionForGroupMember } from './group-pair-caption';
import type { FriendHomeSummary } from '@/services/friend-summary-service';

function makeSummary(
  id: string,
  groupBalances: FriendHomeSummary['relationship']['groupBalances'],
): Pick<FriendHomeSummary, 'id' | 'relationship'> {
  return {
    id,
    relationship: {
      directBalance: 0,
      groupBalances,
      activity: [],
      totalsByCurrency: [],
    },
  };
}

const groupEntry = (amount: number, currency = 'USD', groupId = 'group-1') => ({
  groupId,
  groupName: 'Trip Group',
  currency,
  amount,
  direction: amount > 0.01 ? ('you_are_owed' as const) : amount < -0.01 ? ('you_owe' as const) : ('settled' as const),
});

describe('getPairCaptionForGroupMember', () => {
  it('returns you_owe for a negative bilateral balance', () => {
    expect(
      getPairCaptionForGroupMember([makeSummary('friend', [groupEntry(-523.38)])], 'group-1', 'friend'),
    ).toEqual({ amount: 523.38, currency: 'USD', direction: 'you_owe' });
  });

  it('returns you_are_owed for a positive bilateral balance', () => {
    expect(
      getPairCaptionForGroupMember([makeSummary('friend', [groupEntry(69.48)])], 'group-1', 'friend'),
    ).toEqual({ amount: 69.48, currency: 'USD', direction: 'you_are_owed' });
  });

  it('returns null for unknown members and other groups', () => {
    const summaries = [makeSummary('friend', [groupEntry(-10)])];
    expect(getPairCaptionForGroupMember(summaries, 'group-1', 'stranger')).toBeNull();
    expect(getPairCaptionForGroupMember(summaries, 'group-2', 'friend')).toBeNull();
  });

  it('returns null for settled entries', () => {
    const summaries = [makeSummary('friend', [groupEntry(0)])];
    expect(getPairCaptionForGroupMember(summaries, 'group-1', 'friend')).toBeNull();
  });

  it('returns null when the pair has balances in two currencies', () => {
    const summaries = [makeSummary('friend', [groupEntry(-10, 'USD'), groupEntry(5, 'EUR')])];
    expect(getPairCaptionForGroupMember(summaries, 'group-1', 'friend')).toBeNull();
  });
});
