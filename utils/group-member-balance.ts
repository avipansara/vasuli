import { toGroupScopedLine, type GroupPairTotal } from '@/services/group-pair-totals-service';

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
 *
 * Group scope only: member rows on the group page must show the group
 * component, never the combined net that folds direct-ledger debt in.
 */
export function getViewerPairBalance(input: {
  pairTotals: GroupPairTotal[];
  memberUserId: string;
  viewerUserId: string;
  preferredCurrency: string;
}): ViewerPairBalance | null {
  const lines = input.pairTotals
    .filter(total =>
      (total.fromUserId === input.memberUserId && total.toUserId === input.viewerUserId)
      || (total.fromUserId === input.viewerUserId && total.toUserId === input.memberUserId),
    )
    .map(toGroupScopedLine);

  if (lines.length === 0) return null;

  const entry = lines.find(candidate => candidate.currency === input.preferredCurrency && candidate.amount >= 0.01)
    ?? lines.find(candidate => candidate.amount >= 0.01)
    ?? lines.find(candidate => candidate.currency === input.preferredCurrency)
    ?? lines[0];
  const signedAmount = entry.fromUserId === input.viewerUserId ? entry.amount : -entry.amount;

  return {
    amount: entry.amount,
    currency: entry.currency,
    signedAmount,
  };
}
