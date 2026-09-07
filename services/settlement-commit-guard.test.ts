import { describe, expect, it } from 'vitest';
import { settlementModule } from '@/services/settlement-service';

describe('settlement operation validation', () => {
  it('allows a valid full-settlement cancellation plan', () => {
    const plan = settlementModule.preview({
      currentUserId: 'current-user', friendId: 'friend-a', currency: 'USD', amount: 7,
      directBalance: 15,
      groupBalances: [{ groupId: 'group-1', groupName: 'Test Group', currency: 'USD', amount: -8, direction: 'you_owe' }],
    });
    expect(plan.allocations[0]).toMatchObject({ groupId: undefined, amount: 7, currency: 'USD', fromUserId: 'friend-a', toUserId: 'current-user' });
    expect(plan.cancellations).toHaveLength(1);
    expect(plan.cancellations[0]).toMatchObject({ groupId: 'group-1', amount: 8 });
  });

  it('produces no operation effects for a naturally zero balance', () => {
    const plan = settlementModule.preview({
      currentUserId: 'current-user', friendId: 'friend-a', currency: 'USD', amount: 0,
      directBalance: 8,
      groupBalances: [{ groupId: 'group-1', groupName: 'Test Group', currency: 'USD', amount: -8, direction: 'you_owe' }],
    });
    expect(plan.allocations).toEqual([]);
    expect(plan.cancellations).toEqual([]);
  });

  it('accepts a valid same-direction plan with no cancellation', () => {
    const plan = settlementModule.preview({
      currentUserId: 'current-user', friendId: 'friend-a', currency: 'USD', amount: 5,
      directBalance: -30,
      groupBalances: [{ groupId: 'group-1', groupName: 'Test Group', currency: 'USD', amount: 20, direction: 'you_are_owed' }],
    });
    expect(plan.cancellations).toEqual([]);
    expect(plan.allocations).toHaveLength(1);
  });
});
