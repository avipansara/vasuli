import { describe, expect, it } from 'vitest';
import { toGroupScopedLine } from '@/services/group-pair-totals-service';
import { toSettleableBalance } from './group-settle-pairs';
import type { GroupPairTotal } from '@/services/group-pair-totals-service';

const pair = (
  from: string,
  to: string,
  amount: number,
  currency = 'USD',
  groupAmount = amount,
  directAmount = 0,
): GroupPairTotal => ({
  // groupAmount uses user_a perspective: positive means user_b owes user_a.
  userA: to,
  userB: from,
  currency,
  groupAmount,
  directAmount,
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

  it('uses the group component, not the combined net, for mixed-scope pairs', () => {
    // Mixed-scope shape: group 49.49 + direct 44.50 = 93.99 combined.
    // The group settle screen must offer the group 49.49 only.
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
    expect(toSettleableBalance({
      pairTotals: [mixed],
      memberUserId: 'member',
      viewerUserId: 'viewer',
      preferredCurrency: 'USD',
      fallbackGlobalBalance: 0,
    })).toBe(-49.49);
  });
});

describe('toGroupScopedLine', () => {
  it('derives direction from the group_amount sign (user_a perspective)', () => {
    expect(toGroupScopedLine({
      userA: 'member',
      userB: 'viewer',
      currency: 'USD',
      groupAmount: -49.49,
      directAmount: -44.5,
      fromUserId: 'viewer',
      toUserId: 'member',
      amount: -93.99,
    })).toEqual({ fromUserId: 'member', toUserId: 'viewer', amount: 49.49, currency: 'USD' });

    expect(toGroupScopedLine({
      userA: 'viewer',
      userB: 'member',
      currency: 'USD',
      groupAmount: 523.38,
      directAmount: -69.48,
      fromUserId: 'viewer',
      toUserId: 'member',
      amount: 453.9,
    })).toEqual({ fromUserId: 'member', toUserId: 'viewer', amount: 523.38, currency: 'USD' });
  });

  it('keeps canonical orientation with zero amount for settled pairs', () => {
    expect(toGroupScopedLine({
      userA: 'a',
      userB: 'b',
      currency: 'USD',
      groupAmount: 0,
      directAmount: 0,
      fromUserId: 'b',
      toUserId: 'a',
      amount: 0,
    })).toEqual({ fromUserId: 'b', toUserId: 'a', amount: 0, currency: 'USD' });
  });
});
