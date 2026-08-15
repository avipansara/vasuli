import { describe, expect, it } from 'vitest';
import {
  canSubmitGroupSettlement,
  getDefaultGroupSettleMember,
  getGroupSettleAmount,
  isSettleableGroupBalance,
} from './group-settle-selection';

const member = (userId: string, balance: number) => ({ userId, balance });

describe('group settle selection', () => {
  it('preselects the first member with an unsettled balance', () => {
    expect(getDefaultGroupSettleMember([
      member('settled', 0),
      member('rounding', 0.004),
      member('owes', -12.5),
      member('owed', 8),
    ])).toMatchObject({ userId: 'owes' });
  });

  it('formats the selected balance as a settlement amount', () => {
    expect(getGroupSettleAmount(-12.5)).toBe('12.50');
    expect(getGroupSettleAmount(0.004)).toBe('');
  });

  it('only enables submit for a selected member and positive amount', () => {
    expect(isSettleableGroupBalance(0.004)).toBe(false);
    expect(canSubmitGroupSettlement(member('owes', -12.5), '12.50', false)).toBe(true);
    expect(canSubmitGroupSettlement(member('owes', -12.5), '12.51', false)).toBe(false);
    expect(canSubmitGroupSettlement(member('owes', -12.5), '0', false)).toBe(false);
    expect(canSubmitGroupSettlement(null, '12.50', false)).toBe(false);
    expect(canSubmitGroupSettlement(member('owes', -12.5), '12.50', true)).toBe(false);
  });
});
