import { describe, expect, it } from 'vitest';
import { toSettleableBalance } from './group-settle-pairs';
import type { GroupPairTotal } from '@/services/group-pair-totals-service';

const pair = (from: string, to: string, amount: number, currency = 'USD'): GroupPairTotal => ({
  userA: 'a',
  userB: 'b',
  currency,
  groupAmount: 0,
  directAmount: 0,
  fromUserId: from,
  toUserId: to,
  amount,
});

describe('toSettleableBalance', () => {
  it('maps member-owes-viewer to a negative (receiving) balance', () => {
    expect(toSettleableBalance({
      pairTotals: [pair('member', 'viewer', 523.38)],
      memberUserId: 'member',
      viewerUserId: 'viewer',
      preferredCurrency: 'USD',
      fallbackGlobalBalance: 0,
    })).toBe(-523.38);
  });

  it('maps viewer-owes-member to a positive balance', () => {
    expect(toSettleableBalance({
      pairTotals: [pair('viewer', 'member', 100)],
      memberUserId: 'member',
      viewerUserId: 'viewer',
      preferredCurrency: 'USD',
      fallbackGlobalBalance: 0,
    })).toBe(100);
  });

  it('falls back to the global net when the pair is unknown', () => {
    expect(toSettleableBalance({
      pairTotals: [],
      memberUserId: 'stranger',
      viewerUserId: 'viewer',
      preferredCurrency: 'USD',
      fallbackGlobalBalance: -50,
    })).toBe(-50);
  });

  it('prefers the requested currency, then any outstanding entry', () => {
    const totals = [pair('member', 'viewer', 10, 'EUR'), pair('member', 'viewer', 20, 'USD')];
    expect(toSettleableBalance({
      pairTotals: totals,
      memberUserId: 'member',
      viewerUserId: 'viewer',
      preferredCurrency: 'USD',
      fallbackGlobalBalance: 0,
    })).toBe(-20);
  });

  it('returns zero for settled-with-flows pairs', () => {
    expect(toSettleableBalance({
      pairTotals: [pair('member', 'viewer', 0)],
      memberUserId: 'member',
      viewerUserId: 'viewer',
      preferredCurrency: 'USD',
      fallbackGlobalBalance: 999,
    })).toBe(0);
  });
});
