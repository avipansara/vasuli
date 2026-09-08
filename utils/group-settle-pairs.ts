import { toGroupScopedLine, type GroupPairTotal } from '@/services/group-pair-totals-service';

/**
 * Signed settle-screen balance for one member, in settle-screen convention
 * (negative = the member owes the viewer, positive = the viewer owes).
 *
 * Prefers the bilateral pair total with the viewer (what the two people owe
 * each other) over the member's global group net. Falls back to the global
 * net only when pair data is unavailable (e.g. RPC error), preserving the
 * screen's current behavior instead of blanking rows.
 *
 * Group scope only: the group settle screen settles group balances, so the
 * direct-ledger component of a combined pair net must not leak into the
 * offered amount.
 */
export function toSettleableBalance(input: {
  pairTotals: GroupPairTotal[];
  memberUserId: string;
  viewerUserId: string;
  preferredCurrency: string;
  fallbackGlobalBalance: number;
}): number | null {
  const { pairTotals, memberUserId, viewerUserId, preferredCurrency, fallbackGlobalBalance } = input;
  const lines = pairTotals
    .filter(
      total =>
        (total.fromUserId === memberUserId && total.toUserId === viewerUserId) ||
        (total.fromUserId === viewerUserId && total.toUserId === memberUserId),
    )
    .map(toGroupScopedLine);
  if (lines.length === 0) return fallbackGlobalBalance;
  const entry = lines.find(candidate => candidate.currency === preferredCurrency)
    ?? lines.find(candidate => candidate.amount >= 0.01)
    ?? lines[0];
  // Canonical debtor -> creditor: member owes viewer => negative (receiving).
  const signed = entry.fromUserId === memberUserId ? -entry.amount : entry.amount;
  return signed === 0 ? 0 : signed;
}
