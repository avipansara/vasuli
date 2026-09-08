import { supabase } from '@/lib/supabase';

export type GroupPairTotal = {
  userA: string;
  userB: string;
  currency: string;
  /** Signed group-ledger component (user_a perspective). */
  groupAmount: number;
  /** Signed direct-ledger component (user_a perspective). */
  directAmount: number;
  /** Canonical debtor. */
  fromUserId: string;
  /** Canonical creditor. */
  toUserId: string;
  /** Absolute net (0 for settled-with-flows pairs). */
  amount: number;
};

type GroupPairTotalRow = {
  user_a: string;
  user_b: string;
  currency: string;
  group_amount: number;
  direct_amount: number;
  from_user_id: string;
  to_user_id: string;
  amount: number;
};

export type GroupPairLine = Pick<GroupPairTotal, 'fromUserId' | 'toUserId' | 'amount' | 'currency'>;

/**
 * Group-scoped pair line: the group page settles group balances, so member
 * rows must show the group component only — never the combined net that
 * folds direct-ledger debt into the group. Direction derives from the
 * group_amount sign (user_a perspective: positive means user_b owes user_a),
 * matching the RPC's own orientation.
 */
export function toGroupScopedLine(total: GroupPairTotal): GroupPairLine {
  const magnitude = Math.abs(total.groupAmount);
  if (total.groupAmount > 0) {
    return { fromUserId: total.userB, toUserId: total.userA, amount: magnitude, currency: total.currency };
  }
  if (total.groupAmount < 0) {
    return { fromUserId: total.userA, toUserId: total.userB, amount: magnitude, currency: total.currency };
  }
  return { fromUserId: total.fromUserId, toUserId: total.toUserId, amount: 0, currency: total.currency };
}

function mapRow(row: GroupPairTotalRow): GroupPairTotal {
  return {
    userA: row.user_a,
    userB: row.user_b,
    currency: row.currency,
    groupAmount: row.group_amount,
    directAmount: row.direct_amount,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: row.amount,
  };
}

export const groupPairTotalsService = {
  async getByGroup(groupId: string): Promise<GroupPairTotal[]> {
    const { data, error } = await supabase.rpc('get_group_pair_totals', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return ((data ?? []) as GroupPairTotalRow[]).map(mapRow);
  },
};
