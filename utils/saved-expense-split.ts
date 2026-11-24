import { SplitMethod, type ExpenseSplitDraft } from '@/components/expenses/expense-split-types';
import type { ExpenseSplit } from '@/types/database';

export function getSavedExpenseSplit(splits: ExpenseSplit[]) {
  const method = splits.every(split => split.splitType === 'equal') ? SplitMethod.EQUAL
    : splits.every(split => split.splitType === 'percentage') ? SplitMethod.PERCENTAGE
    : SplitMethod.UNEQUAL;

  return {
    participantIds: splits.map(split => split.userId),
    method,
    // The expense writer stores zero percentages as null.
    values: Object.fromEntries(splits.map(split => [
      split.userId,
      method === SplitMethod.PERCENTAGE ? String(split.percentage ?? 0) : String(split.amount),
    ])),
  };
}

type Allocation = Pick<ExpenseSplitDraft, 'method' | 'participantIds' | 'values'>;

export function hasSameAllocation(left: Allocation, right: Allocation) {
  return left.method === right.method && left.participantIds.length === right.participantIds.length &&
    left.participantIds.every((id, index) => id === right.participantIds[index] &&
      (left.method === SplitMethod.EQUAL || Number(left.values[id] || 0) === Number(right.values[id] || 0)));
}
