import { describe, expect, it } from 'vitest';
import type { GroupPairTotal } from '@/services/group-pair-totals-service';
import { getViewerPairBalance } from './group-member-balance';

const pair = (fromUserId: string, toUserId: string, amount: number, currency = 'USD'): GroupPairTotal => ({
  // Group-scoped fixture: the combined from/to matches the group direction.
  userA: fromUserId,
  userB: toUserId,
  currency,
  groupAmount: -amount,
  directAmount: 0,
  fromUserId,
  toUserId,
  amount,
});

describe('getViewerPairBalance', () => {
  const base = { memberUserId: 'member', viewerUserId: 'viewer', preferredCurrency: 'USD' };

  it('marks a member owing the viewer with a negative signed amount', () => {
    expect(getViewerPairBalance({ pairTotals: [pair('member', 'viewer', 18)], ...base })).toMatchObject({
      amount: 18,
      signedAmount: -18,
    });
  });

  it('marks the viewer owing a member with a positive signed amount', () => {
    expect(getViewerPairBalance({ pairTotals: [pair('viewer', 'member', 7)], ...base })).toMatchObject({
      amount: 7,
      signedAmount: 7,
    });
  });

  it('returns null for a member with no bilateral pair', () => {
    expect(getViewerPairBalance({ pairTotals: [], ...base })).toBeNull();
  });

  it('keeps an explicitly settled pair distinct from a missing pair', () => {
    expect(getViewerPairBalance({ pairTotals: [pair('member', 'viewer', 0)], ...base })).toMatchObject({
      amount: 0,
      signedAmount: -0,
    });
  });

  it('prefers the viewer currency when multiple pair currencies exist', () => {
    expect(getViewerPairBalance({
      pairTotals: [pair('member', 'viewer', 10, 'EUR'), pair('member', 'viewer', 20, 'USD')],
      ...base,
    })).toMatchObject({ amount: 20, currency: 'USD', signedAmount: -20 });
  });

  it('prefers an outstanding other currency over a settled preferred currency', () => {
    expect(getViewerPairBalance({
      pairTotals: [pair('member', 'viewer', 0, 'USD'), pair('member', 'viewer', 12, 'EUR')],
      ...base,
    })).toMatchObject({ amount: 12, currency: 'EUR', signedAmount: -12 });
  });

  it('shows the group component, not the combined net, for mixed-scope pairs', () => {
    // Mixed-scope shape: group 49.49 + direct 44.50 = 93.99 combined.
    const mixed: GroupPairTotal = {
      userA: 'member',
      userB: 'viewer',
      currency: 'USD',
      groupAmount: -49.49,
      directAmount: -44.5,
      fromUserId: 'viewer',
      toUserId: 'member',
      amount: -93.99,
    };
    expect(getViewerPairBalance({
      pairTotals: [mixed],
      memberUserId: 'member',
      viewerUserId: 'viewer',
      preferredCurrency: 'USD',
    })).toMatchObject({ amount: 49.49, currency: 'USD', signedAmount: -49.49 });
  });
});
