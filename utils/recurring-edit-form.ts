import type { RecurringExpenseRule } from '@/types/database';

export type RecurringSplitMethod = RecurringExpenseRule['splitMethod'];

/** Keep the editable share inputs proportional to the rule's resolved saved shares. */
export function getRecurringSplitFormValues(
  participants: RecurringExpenseRule['participants'],
) {
  const amounts: Record<string, string> = {};
  const percentages: Record<string, string> = {};
  const shares: Record<string, string> = {};

  const totalCents = participants.reduce((sum, item) => sum + Math.round(item.shareAmount * 100), 0);
  const gcd = (left: number, right: number): number => right === 0 ? Math.abs(left) : gcd(right, left % right);
  const divisor = participants.reduce(
    (value, item) => gcd(value, Math.round(item.shareAmount * 100)),
    0,
  ) || 1;
  const percentageShares = participants.map((participant, index) => {
    const exactBasisPoints = totalCents ? Math.round(participant.shareAmount * 100) * 10_000 / totalCents : 0;
    return { index, basisPoints: Math.floor(exactBasisPoints), remainder: exactBasisPoints % 1 };
  });
  let basisPointsLeft = 10_000 - percentageShares.reduce((sum, item) => sum + item.basisPoints, 0);
  [...percentageShares]
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .forEach(item => {
      if (basisPointsLeft > 0) {
        percentageShares[item.index].basisPoints += 1;
        basisPointsLeft -= 1;
      }
    });

  for (const participant of participants) {
    amounts[participant.userId] = String(participant.shareAmount);
    percentages[participant.userId] = String(participant.percentage ?? percentageShares[participants.indexOf(participant)].basisPoints / 100);
    // Share inputs accept whole numbers; reduced cents preserve unequal ratios exactly.
    shares[participant.userId] = String(Math.round(participant.shareAmount * 100) / divisor);
  }

  return { amounts, percentages, shares };
}

export function isRecurringParticipantSetValid(
  participantIds: readonly string[],
  eligibleIds: readonly string[],
  currentUserId: string,
  scopeType: 'group' | 'friends',
): boolean {
  if (participantIds.length < 2 || !participantIds.includes(currentUserId)) return false;
  const eligible = new Set(eligibleIds);
  return participantIds.every(id =>
    id === currentUserId && scopeType === 'friends' ? true : eligible.has(id),
  );
}

export function getRecurringSplitType(method: RecurringSplitMethod): 'equal' | 'exact' | 'percentage' {
  if (method === 'equal') return 'equal';
  if (method === 'percentage') return 'percentage';
  return 'exact';
}
