import { describe, expect, it } from 'vitest';
import type { RecurringExpenseRule } from '@/types/database';
import { getRecurringSplitFormValues, getRecurringSplitType, isRecurringParticipantSetValid } from '@/utils/recurring-edit-form';
import { resolveExpenseSplits } from '@/utils/split-validation';

describe('recurring edit form values', () => {
  it('keeps saved resolved share proportions with editable integer weights and cent allocation', () => {
    const participants: RecurringExpenseRule['participants'] = [
      { userId: 'owner', shareAmount: 2.01 },
      { userId: 'friend', shareAmount: 1 },
    ];

    const shares = getRecurringSplitFormValues(participants).shares;
    expect(shares).toEqual({ owner: '201', friend: '100' });
    expect(resolveExpenseSplits(['owner', 'friend'], 0.05, 'shares', { shares }).splits?.map(split => split.amount))
      .toEqual([0.03, 0.02]);
  });

  it('maps every selected split method to the server split type contract', () => {
    expect(getRecurringSplitType('equal')).toBe('equal');
    expect(getRecurringSplitType('unequal')).toBe('exact');
    expect(getRecurringSplitType('shares')).toBe('exact');
    expect(getRecurringSplitType('percentage')).toBe('percentage');
  });

  it('blocks saving when a saved participant is no longer eligible or the owner is absent', () => {
    expect(isRecurringParticipantSetValid(['owner', 'friend'], ['owner', 'friend'], 'owner', 'group')).toBe(true);
    expect(isRecurringParticipantSetValid(['owner', 'removed-friend'], ['owner', 'current-friend'], 'owner', 'group')).toBe(false);
    expect(isRecurringParticipantSetValid(['friend'], ['friend'], 'owner', 'friends')).toBe(false);
  });
});
