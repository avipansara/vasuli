import type { FriendHomeSummary } from '@/services/friend-summary-service';

export type PairCaptionDirection = 'you_owe' | 'you_are_owed';

export type PairCaption = {
  amount: number;
  currency: string;
  direction: PairCaptionDirection;
};

/**
 * Bilateral caption for one member row on the group page: what the pair
 * owes each other *in this group*, from the home summaries' per-group
 * relationship projection (now bilateral server-side).
 *
 * Returns null when there is nothing unambiguous to show: unknown member,
 * no entry for the group, a settled/zero entry, or balances in more than
 * one currency (picking one would mislead).
 */
export function getPairCaptionForGroupMember(
  summaries: Pick<FriendHomeSummary, 'id' | 'relationship'>[],
  groupId: string,
  memberUserId: string,
): PairCaption | null {
  const summary = summaries.find(candidate => candidate.id === memberUserId);
  if (!summary) return null;
  const entries = (summary.relationship.groupBalances ?? []).filter(
    entry => entry.groupId === groupId && Math.abs(entry.amount) >= 0.01,
  );
  if (entries.length !== 1) return null;
  const [entry] = entries;
  return {
    amount: Math.abs(entry.amount),
    currency: entry.currency,
    direction: entry.amount < 0 ? 'you_owe' : 'you_are_owed',
  };
}
