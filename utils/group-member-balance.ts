import type { GroupPairTotal } from '@/services/group-pair-totals-service';

export type ViewerPairBalance = {
  amount: number;
  currency: string;
  /** Positive means the viewer owes the member; negative means the member owes the viewer. */
  signedAmount: number;
};

/**
 * Select the bilateral total for a member as seen by the current viewer.
 * A missing pair is distinct from a settled pair so callers never infer a
 * debt from a member's global group balance.
 */
export function getViewerPairBalance(input: {
  pairTotals: GroupPairTotal[];
  memberUserId: string;
  viewerUserId: string;
  preferredCurrency: string;
}): ViewerPairBalance | null {
  const entries = input.pairTotals.filter(total =>
    (total.fromUserId === input.memberUserId && total.toUserId === input.viewerUserId)
    || (total.fromUserId === input.viewerUserId && total.toUserId === input.memberUserId),
  );

  if (entries.length === 0) return null;

  const entry = entries.find(candidate => candidate.currency === input.preferredCurrency && candidate.amount >= 0.01)
    ?? entries.find(candidate => candidate.amount >= 0.01)
    ?? entries.find(candidate => candidate.currency === input.preferredCurrency)
    ?? entries[0];
  const signedAmount = entry.fromUserId === input.memberUserId ? -entry.amount : entry.amount;

  return {
    amount: entry.amount,
    currency: entry.currency,
    signedAmount,
  };
}
